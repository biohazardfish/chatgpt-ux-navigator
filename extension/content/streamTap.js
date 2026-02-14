(() => {
    window.CGPT_NAV = window.CGPT_NAV || {};
    const NS = 'CGPT_NAV_STREAM_TAP';

    const {store} = window.CGPT_NAV;

    // ---------- WebSocket forwarder (content-script world) ----------
    const WS_URL = 'ws://localhost:8765/ws';
    let ws = null;
    let wsOpen = false;
    let reconnectTimer = null;
    let backoffMs = 300;

    let enabled = false;
    let pageHookInjected = false;
    let currentClientId = null;

    // Prompt queue to serialize "new chat -> inject -> submit"
    /** @type {Array<{id?:string, created?:number, input:string, newChat?:boolean, temporary?:boolean, type?:string}>} */
    const promptQueue = [];
    let promptProcessing = false;

    const seenImageFileIds = new Set();
    const pendingImageFileIds = new Set();
    const FILE_ID_RE = /file_[a-zA-Z0-9]+/g;
    let imageObserver = null;
    let latestGeneratedImageSrc = null;
    const imageStateByConversation = new Map();

    function safeJsonStringify(obj) {
        try {
            return JSON.stringify(obj);
        } catch (_) {
            return JSON.stringify({type: 'error', error: 'Could not stringify payload'});
        }
    }

    function scheduleReconnect() {
        if (!enabled) return;
        if (reconnectTimer) return;

        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            backoffMs = Math.min(backoffMs * 2, 8000);
            connectWs();
        }, backoffMs);
    }

    function connectWs(clientId) {
        if (!enabled) return;

        // Store clientId for reconnection logic
        if (clientId) {
            currentClientId = clientId;
        }

        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        // Build WS URL with clientId query parameter if provided
        let wsUrl = WS_URL;
        if (currentClientId) {
            wsUrl = `${WS_URL}?clientId=${encodeURIComponent(currentClientId)}`;
        }

        try {
            ws = new WebSocket(wsUrl);
        } catch (_) {
            scheduleReconnect();
            return;
        }

        ws.onopen = () => {
            wsOpen = true;
            backoffMs = 300;
            ws.send(
                safeJsonStringify({
                    type: 'hello',
                    source: 'cgpt-nav',
                    clientId: currentClientId,
                    at: Date.now(),
                })
            );
        };

        // ----------------------------
        // helpers for queued prompt processing
        // ----------------------------
        function sleep(ms) {
            return new Promise(r => setTimeout(r, ms));
        }

        /**
         * Wait until fn() returns truthy, or timeout.
         * @template T
         * @param {() => T} fn
         * @param {{timeoutMs?: number, intervalMs?: number}} [opts]
         * @returns {Promise<T|null>}
         */
        async function waitFor(fn, opts = {}) {
            const timeoutMs = opts.timeoutMs ?? 12_000;
            const intervalMs = opts.intervalMs ?? 120;

            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                try {
                    const v = fn();
                    if (v) return v;
                } catch (_) {
                    // ignore transient DOM errors
                }
                await sleep(intervalMs);
            }
            return null;
        }


        async function ensureComposerReady() {
            // Prefer your chatInput finder if present; otherwise DOM fallback
            const ok = await waitFor(() => {
                const ci = window.CGPT_NAV.chatInput;
                if (ci?.findChatInput) return ci.findChatInput();
                return (
                    document.querySelector(
                        '[data-testid="prompt-textarea"][contenteditable="true"]'
                    ) || document.querySelector('form [contenteditable="true"]')
                );
            });
            return !!ok;
        }

        function getMenuItemText(el) {
            if (!(el instanceof HTMLElement)) return '';
            return (el.innerText || el.textContent || '').trim().toLowerCase();
        }

        function userClick(el) {
            if (!(el instanceof HTMLElement)) return false;

            function firePointerClick(target) {
                const opts = {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    view: window,
                };

                target.dispatchEvent(
                    new PointerEvent('pointerdown', {
                        ...opts,
                        pointerId: 1,
                        pointerType: 'mouse',
                        buttons: 1,
                    })
                );
                target.dispatchEvent(new MouseEvent('mousedown', {...opts, buttons: 1}));
                target.dispatchEvent(
                    new PointerEvent('pointerup', {
                        ...opts,
                        pointerId: 1,
                        pointerType: 'mouse',
                        buttons: 0,
                    })
                );
                target.dispatchEvent(new MouseEvent('mouseup', {...opts, buttons: 0}));
                target.dispatchEvent(new MouseEvent('click', {...opts, buttons: 0}));
            }

            try {
                firePointerClick(el);
                return true;
            } catch (_) {
                try {
                    const interactiveChild = el.querySelector('button, [role="menuitemradio"], [role="menuitem"]');
                    if (interactiveChild instanceof HTMLElement) {
                        firePointerClick(interactiveChild);
                        return true;
                    }

                    el.click();
                    return true;
                } catch (_) {
                    return false;
                }
            }
        }

        async function closePlusMenu(plusBtn) {
            if (!(plusBtn instanceof HTMLElement)) return;
            const isOpen = () => plusBtn.getAttribute('aria-expanded') === 'true';
            if (!isOpen()) return;

            try {
                document.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'Escape',
                        code: 'Escape',
                        bubbles: true,
                        cancelable: true,
                    })
                );
            } catch (_) {}

            await sleep(80);
            if (isOpen()) {
                try {
                    plusBtn.click();
                } catch (_) {}
            }
        }

        async function ensureImageModeEnabled() {
            const plusBtn = await waitFor(() => {
                return (
                    document.querySelector('#composer-plus-btn') ||
                    document.querySelector('[data-testid="composer-plus-btn"]') ||
                    document.querySelector('button[aria-label="Add files and more"]')
                );
            }, {timeoutMs: 7000, intervalMs: 120});

            if (!(plusBtn instanceof HTMLElement)) return false;

            const isOpen = () => plusBtn.getAttribute('aria-expanded') === 'true';
            for (let attempt = 0; attempt < 3; attempt += 1) {
                if (isOpen()) break;
                userClick(plusBtn);
                await sleep(160);
            }

            const createImageItem = await waitFor(
                () => {
                    const nodes = Array.from(
                        document.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')
                    );

                    const byText = nodes.find(node => getMenuItemText(node).includes('create image'));
                    if (byText) return byText;

                    const byIcon = nodes.find(node => {
                        if (!(node instanceof HTMLElement)) return false;
                        return !!node.querySelector('use[href*="#266724"]');
                    });
                    return byIcon || null;
                },
                {timeoutMs: 4000, intervalMs: 100}
            );

            if (!(createImageItem instanceof HTMLElement)) {
                await closePlusMenu(plusBtn);
                return false;
            }

            const ariaChecked = createImageItem.getAttribute('aria-checked');
            const dataState = createImageItem.getAttribute('data-state');
            const alreadyEnabled = ariaChecked === 'true' || dataState === 'checked';

            if (!alreadyEnabled) {
                userClick(createImageItem);
                await sleep(150);
            }

            await closePlusMenu(plusBtn);
            return true;
        }

        /**
         * Process queued prompts sequentially:
         * - create new chat if requested
         * - wait for composer
         * - inject and submit
         */
        async function processPromptQueue() {
            if (promptProcessing) return;
            promptProcessing = true;

            try {
                while (promptQueue.length > 0) {
                    const item = promptQueue.shift();
                    const prompt = String(item?.input ?? '');
                    if (!prompt.trim()) continue;

                    const needsNewChat = !!item?.newChat;
                    const wantsTemporary = item?.temporary !== false;
                    const isImagePrompt = item?.type === 'prompt.image';

                    // 1) Start new chat if requested (best-effort)
                    if (needsNewChat) {
                        try {
                            const nc = window.CGPT_NAV.newChat;
                            if (nc?.startNewChat) {
                                await nc.startNewChat({temporary: wantsTemporary});
                            } else if (nc?.startNewTemporaryChat) {
                                await nc.startNewTemporaryChat();
                            }
                        } catch (_) {
                            // Non-fatal: if this fails, still try to inject into whatever chat is present
                        }
                    }

                    // 2) Wait for navigation/UI mount so composer exists
                    await ensureComposerReady();

                    if (isImagePrompt) {
                        try {
                            await window.CGPT_NAV.newChat?.ensureTemporaryChatDisabled?.();
                        } catch (_) {}

                        try {
                            await ensureImageModeEnabled();
                        } catch (_) {}
                    }

                    // 3) Inject prompt + submit
                    try {
                        const ci = window.CGPT_NAV.chatInput;
                        const okSet = ci?.setChatInputText ? ci.setChatInputText(prompt) : false;

                        if (!okSet) {
                            // Retry briefly; ChatGPT sometimes remounts editor after navigation
                            const setOkAfter = await waitFor(
                                () => {
                                    const ci2 = window.CGPT_NAV.chatInput;
                                    return ci2?.setChatInputText
                                        ? ci2.setChatInputText(prompt)
                                        : false;
                                },
                                {timeoutMs: 5000, intervalMs: 150}
                            );

                            if (!setOkAfter) continue;
                        }

                        // small delay so editor state settles before clicking send
                        await sleep(120);

                        try {
                            ci?.submitChatInput?.();
                        } catch (_) {}
                    } catch (_) {
                        // ignore and continue to next queued prompt
                    }

                    // 4) Small spacing to avoid racing subsequent new chat clicks
                    await sleep(250);
                }
            } finally {
                promptProcessing = false;
            }
        }

        async function activateImageGenerationMode() {
            await ensureComposerReady();

            try {
                await ensureImageModeEnabled();
            } catch (_) {
                // best-effort
            }
        }

        function enqueuePromptMessage(msg) {
            const prompt = typeof msg?.input === 'string' ? msg.input : '';
            if (!prompt.trim()) return;

            const requiresNewChat = msg?.type === 'prompt.new' || msg?.newChat === true;
            const temporary = msg?.temporary !== false;

            promptQueue.push({
                id: msg?.id,
                created: msg?.created,
                input: prompt,
                newChat: requiresNewChat,
                temporary,
                type: msg?.type,
            });

            // Kick processor (fire-and-forget)
            processPromptQueue();
        }

        // Receive server -> extension messages (e.g. prompts)
        ws.onmessage = ev => {
            let msg = null;
            try {
                msg = JSON.parse(String(ev?.data ?? ''));
            } catch (_) {
                return;
            }

            if (!msg || typeof msg !== 'object') return;

            // Expected:
            // { type: "prompt", id: "...", created: <unix>, input: "..." }
            // { type: "prompt.new", ... } // -> request a fresh temporary chat first
            if (msg.type === 'prompt' || msg.type === 'prompt.new' || msg.type === 'prompt.image') {
                enqueuePromptMessage(msg);
                return;
            }

            if (msg.type === 'image.activate') {
                activateImageGenerationMode();
                return;
            }
        };

        ws.onclose = () => {
            wsOpen = false;
            scheduleReconnect();
        };

        ws.onerror = () => {
            wsOpen = false;
            try {
                ws.close();
            } catch (_) {}
            scheduleReconnect();
        };
    }

    function wsSend(obj) {
        if (!enabled) return;

        const payload = safeJsonStringify(obj);
        if (!ws || !wsOpen) connectWs(currentClientId);

        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(payload);
            } catch (_) {
                // ignore; reconnect loop will handle
            }
        }
    }

    function extractFileIdFromUrl(url) {
        try {
            const u = new URL(url, location.href);
            const id = u.searchParams.get('id');
            if (id && id.startsWith('file_')) return id;
            const m = String(url).match(FILE_ID_RE);
            return m && m[0] ? m[0] : null;
        } catch (_) {
            const m = String(url || '').match(FILE_ID_RE);
            return m && m[0] ? m[0] : null;
        }
    }

    function arrayBufferToBase64(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        const chunkSize = 0x8000;
        let binary = '';
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    async function forwardImageBySrc(src) {
        if (!src) return;
        try {
            const fileId = extractFileIdFromUrl(src);
            if (fileId && (seenImageFileIds.has(fileId) || pendingImageFileIds.has(fileId))) return;
            if (fileId) pendingImageFileIds.add(fileId);

            const resp = await fetch(src, {credentials: 'include', cache: 'no-store'});
            if (!resp.ok) return;

            const mimeType = resp.headers.get('content-type') || 'image/png';
            const arrayBuffer = await resp.arrayBuffer();
            const dataBase64 = arrayBufferToBase64(arrayBuffer);

            wsSend({
                type: 'image.generated',
                fileId: fileId || null,
                fileName: null,
                mimeType,
                dataBase64,
            });

            if (fileId) seenImageFileIds.add(fileId);
        } catch (_) {
            // ignore transient fetch failures
        } finally {
            const fileId = extractFileIdFromUrl(src);
            if (fileId) pendingImageFileIds.delete(fileId);
        }
    }

    function scanRenderedImages(root = document) {
        const imgs = root.querySelectorAll(
            'img[alt="Generated image"][src*="/backend-api/estuary/content?id=file_"]'
        );
        imgs.forEach(img => {
            const src = img.getAttribute('src') || '';
            if (src) latestGeneratedImageSrc = src;
        });
    }

    function startImageObserver() {
        if (imageObserver) return;

        scanRenderedImages(document);

        imageObserver = new MutationObserver(mutations => {
            for (const m of mutations) {
                if (m.type === 'attributes' && m.target instanceof HTMLImageElement) {
                    const src = m.target.getAttribute('src') || '';
                    const alt = m.target.getAttribute('alt') || '';
                    if (src.includes('/backend-api/estuary/content?id=file_') && alt === 'Generated image') {
                        latestGeneratedImageSrc = src;
                    }
                    continue;
                }

                if (!m.addedNodes || m.addedNodes.length === 0) continue;
                m.addedNodes.forEach(node => {
                    if (!(node instanceof Element)) return;
                    if (node instanceof HTMLImageElement) {
                        const src = node.getAttribute('src') || '';
                        const alt = node.getAttribute('alt') || '';
                        if (
                            src.includes('/backend-api/estuary/content?id=file_') &&
                            alt === 'Generated image'
                        ) {
                            latestGeneratedImageSrc = src;
                        }
                        return;
                    }
                    scanRenderedImages(node);
                });
            }
        });

        imageObserver.observe(document.documentElement || document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['src'],
        });
    }

    function stopImageObserver() {
        if (!imageObserver) return;
        try {
            imageObserver.disconnect();
        } catch (_) {}
        imageObserver = null;
    }

    // ---------- Page-world injection (CSP-safe) ----------
    function injectPageHook() {
        if (!enabled) return;
        if (pageHookInjected) return;

        const existing = document.querySelector('script[data-cgpt-nav-page-hook="1"]');
        if (existing) {
            pageHookInjected = true;
            return;
        }

        const s = document.createElement('script');
        s.setAttribute('data-cgpt-nav-page-hook', '1');
        s.src = chrome.runtime.getURL('content/pageHook.js');

        (document.documentElement || document.head || document.body).appendChild(s);

        s.addEventListener('load', () => {
            pageHookInjected = true;
        });
        s.addEventListener('error', () => {
            console.warn('Failed to load pageHook.js (CSP or missing web_accessible_resources).');
        });
    }

    function clearReconnectTimer() {
        if (!reconnectTimer) return;
        try {
            clearTimeout(reconnectTimer);
        } catch (_) {}
        reconnectTimer = null;
    }

    function closeWs() {
        wsOpen = false;
        if (ws) {
            try {
                ws.onopen = null;
                ws.onclose = null;
                ws.onerror = null;
                ws.onmessage = null;
                ws.close();
            } catch (_) {}
        }
        ws = null;
        clearReconnectTimer();
        backoffMs = 300;
    }

    // Receive page-world events and forward to Bun WS
    function collectStrings(input, out, limit = 3000) {
        if (!input || out.length >= limit) return;

        if (typeof input === 'string') {
            out.push(input);
            return;
        }

        if (Array.isArray(input)) {
            for (const item of input) {
                if (out.length >= limit) break;
                collectStrings(item, out, limit);
            }
            return;
        }

        if (typeof input === 'object') {
            for (const [k, v] of Object.entries(input)) {
                if (out.length >= limit) break;
                out.push(String(k));
                collectStrings(v, out, limit);
            }
        }
    }

    function extractConversationId(payload) {
        const data = payload?.json || payload;
        if (data && typeof data.conversation_id === 'string') {
            return data.conversation_id;
        }

        const strings = [];
        collectStrings(data, strings);
        for (const s of strings) {
            if (!s.includes('conversation_id=')) continue;
            const m = s.match(/conversation_id=([0-9a-f-]+)/i);
            if (m && m[1]) return m[1];
        }

        return null;
    }

    async function fetchAndForwardGeneratedImage(fileId, conversationId) {
        if (!fileId || !conversationId) return;
        if (seenImageFileIds.has(fileId) || pendingImageFileIds.has(fileId)) return;

        pendingImageFileIds.add(fileId);

        try {
            const metaUrl = `https://chatgpt.com/backend-api/files/download/${fileId}?conversation_id=${encodeURIComponent(
                conversationId
            )}&inline=false`;

            const metaResp = await fetch(metaUrl, {
                credentials: 'include',
                cache: 'no-store',
            });
            if (!metaResp.ok) {
                return;
            }

            const meta = await metaResp.json();
            const downloadUrl = typeof meta?.download_url === 'string' ? meta.download_url : '';
            if (!downloadUrl) return;

            const imageResp = await fetch(downloadUrl, {
                credentials: 'include',
                cache: 'no-store',
            });
            if (!imageResp.ok) {
                return;
            }

            const arrayBuffer = await imageResp.arrayBuffer();
            const dataBase64 = arrayBufferToBase64(arrayBuffer);
            const mimeType = imageResp.headers.get('content-type') || meta?.mime_type || 'image/png';

            wsSend({
                type: 'image.generated',
                fileId,
                conversationId,
                fileName: typeof meta?.file_name === 'string' ? meta.file_name : null,
                mimeType,
                dataBase64,
            });

            seenImageFileIds.add(fileId);
        } catch (_) {
            // ignore; next SSE patch may retry
        } finally {
            pendingImageFileIds.delete(fileId);
        }
    }

    function getConversationState(conversationId) {
        const key = String(conversationId || '');
        if (!key) return null;
        const existing = imageStateByConversation.get(key);
        if (existing) return existing;

        const next = {
            slotFileIds: new Map(),
            streamComplete: false,
        };
        imageStateByConversation.set(key, next);
        return next;
    }

    function extractSseJson(payload) {
        return payload?.json || payload || null;
    }

    function extractFileIdFromAssetPointer(pointer) {
        if (typeof pointer !== 'string') return null;
        const matches = pointer.match(FILE_ID_RE);
        return matches && matches[0] ? matches[0] : null;
    }

    function setConversationSlotFileId(state, slotIndex, fileId) {
        if (!state || !state.slotFileIds || !fileId) return;
        const normalizedSlot = Number.isInteger(slotIndex) && slotIndex >= 0 ? slotIndex : -1;
        state.slotFileIds.set(normalizedSlot, fileId);
    }

    function collectImagePointersFromAddPayload(data, state) {
        if (!data || data.o !== 'add') return;
        const message = data?.v?.message;
        if (!message || message?.author?.role !== 'tool') return;

        const parts = message?.content?.parts;
        if (!Array.isArray(parts)) return;

        for (let i = 0; i < parts.length; i += 1) {
            const part = parts[i];
            if (!part || typeof part !== 'object') continue;
            if (part.content_type !== 'image_asset_pointer') continue;

            const fileId = extractFileIdFromAssetPointer(part.asset_pointer);
            if (!fileId) continue;
            setConversationSlotFileId(state, i, fileId);
        }
    }

    function collectImagePointersFromPatchPayload(data, state) {
        if (!data || data.o !== 'patch') return;

        const patches = Array.isArray(data?.p)
            ? data.p
            : Array.isArray(data?.patches)
              ? data.patches
              : [];

        for (const patch of patches) {
            if (!patch || typeof patch !== 'object') continue;

            const path =
                typeof patch.p === 'string'
                    ? patch.p
                    : typeof patch.path === 'string'
                      ? patch.path
                      : null;
            if (!path || !/\/message\/content\/parts\/\d+\/asset_pointer$/.test(path)) continue;

            const value =
                typeof patch.v === 'string'
                    ? patch.v
                    : typeof patch.value === 'string'
                      ? patch.value
                      : null;
            const fileId = extractFileIdFromAssetPointer(value);
            if (!fileId) continue;

            const slotMatch = path.match(/\/message\/content\/parts\/(\d+)\/asset_pointer$/);
            const slotIndex = slotMatch && slotMatch[1] ? Number(slotMatch[1]) : -1;
            setConversationSlotFileId(state, slotIndex, fileId);
        }
    }

    function pickRandom(values) {
        if (!Array.isArray(values) || values.length === 0) return null;
        const idx = Math.floor(Math.random() * values.length);
        return values[idx] || null;
    }

    function updateImageStateFromSse(payload) {
        const data = extractSseJson(payload);
        if (!data || typeof data !== 'object') return;

        const conversationId = extractConversationId(payload);
        if (!conversationId) return;
        const state = getConversationState(conversationId);
        if (!state) return;

        collectImagePointersFromAddPayload(data, state);
        collectImagePointersFromPatchPayload(data, state);

        if (data.type === 'message_stream_complete') {
            state.streamComplete = true;
        }
    }

    async function maybeSendFinalImageForConversation(conversationId) {
        if (!conversationId) return;
        const state = imageStateByConversation.get(conversationId);
        if (!state || !state.streamComplete) return;

        const finalCandidates = Array.from(state.slotFileIds.values()).filter(
            fileId => fileId && !seenImageFileIds.has(fileId) && !pendingImageFileIds.has(fileId)
        );

        if (finalCandidates.length > 0) {
            const dedupedCandidates = Array.from(new Set(finalCandidates));
            const selectedFileId = pickRandom(dedupedCandidates);
            console.debug('[cgpt-nav:image-final-select]', {
                conversationId,
                finalCandidates: dedupedCandidates,
                selectedFileId,
            });

            if (selectedFileId) {
                await fetchAndForwardGeneratedImage(selectedFileId, conversationId);
            }
            state.streamComplete = false;
            state.slotFileIds.clear();
            return;
        }

        if (latestGeneratedImageSrc) {
            await forwardImageBySrc(latestGeneratedImageSrc);
        }

        state.streamComplete = false;
        state.slotFileIds.clear();
    }

    function onWindowMessage(ev) {
        if (!enabled) return;

        const d = ev && ev.data;
        if (!d || d.__cgptNav !== NS) return;

        wsSend({
            type: d.type,
            payload: d.payload,
            pageUrl: location.href,
            at: Date.now(),
        });

        if (d.type === 'sse') {
            updateImageStateFromSse(d.payload);
            const conversationId = extractConversationId(d.payload);
            if (conversationId) {
                maybeSendFinalImageForConversation(conversationId);
            }
        }
    }

    function enable(clientId) {
        if (enabled) return;
        enabled = true;

        // Store clientId for WS connection
        if (clientId) {
            currentClientId = clientId;
        }

        // Hook window message listener (for pageHook events)
        window.addEventListener('message', onWindowMessage);

        // Start WS + inject page hook
        connectWs(currentClientId);
        injectPageHook();
        startImageObserver();

    }

    function disable() {
        if (!enabled) return;
        enabled = false;

        // Stop forwarding and close WS
        window.removeEventListener('message', onWindowMessage);
        stopImageObserver();
        closeWs();

        // NOTE: we do not remove the injected script; it is harmless if no listener/WS is active.
        // Keeping it avoids churn if the user toggles WS on/off repeatedly.
    }

    function isEnabled() {
        return enabled;
    }

    window.CGPT_NAV.streamTap = {
        wsUrl: WS_URL,
        enable,
        disable,
        isEnabled,
        getClientId: () => currentClientId,
        reconnect: connectWs,
    };
})();
