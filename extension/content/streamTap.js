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
    const UNRESOLVED_IMAGE_STATE_KEY = '__pending__';
    const IMAGE_FINAL_SETTLE_DELAY_MS = 6000;
    const COMPARE_RECOVERY_RETRY_MS = 1200;
    const COMPARE_RECOVERY_MAX_MS = 24000;
    const SINGLE_RECOVERY_RETRY_MS = 1200;
    const SINGLE_RECOVERY_MAX_MS = 30000;
    let imageObserver = null;
    let latestGeneratedImageSrc = null;
    let activeImageRequestId = null;
    const prefetchedImageByFileId = new Map();
    const prefetchPendingFileIds = new Set();
    const imageStateByConversation = new Map();

    function safeJsonStringify(obj) {
        try {
            return JSON.stringify(obj);
        } catch (_) {
            return JSON.stringify({type: 'error', error: 'Could not stringify payload'});
        }
    }

    function trace(event, meta = {}) {
        wsSend({
            type: 'trace',
            traceEvent: event,
            traceAt: new Date().toISOString(),
            ...meta,
        });
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
                    const interactiveChild = el.querySelector(
                        'button, [role="menuitemradio"], [role="menuitem"]'
                    );
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
            const plusBtn = await waitFor(
                () => {
                    return (
                        document.querySelector('#composer-plus-btn') ||
                        document.querySelector('[data-testid="composer-plus-btn"]') ||
                        document.querySelector('button[aria-label="Add files and more"]')
                    );
                },
                {timeoutMs: 7000, intervalMs: 120}
            );

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

                    const byText = nodes.find(node =>
                        getMenuItemText(node).includes('create image')
                    );
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
                    activeImageRequestId =
                        isImagePrompt && typeof item?.id === 'string' ? item.id : null;
                    if (isImagePrompt) {
                        trace('image_prompt_start', {
                            requestId: activeImageRequestId,
                            queueRemaining: promptQueue.length,
                        });
                        for (const state of imageStateByConversation.values()) {
                            clearConversationFinalizeTimer(state);
                        }
                        latestGeneratedImageSrc = null;
                        prefetchedImageByFileId.clear();
                        prefetchPendingFileIds.clear();
                        imageStateByConversation.delete(UNRESOLVED_IMAGE_STATE_KEY);
                    }

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
                        let imageModeEnabled = false;
                        try {
                            await window.CGPT_NAV.newChat?.ensureTemporaryChatDisabled?.();
                        } catch (_) {}

                        try {
                            imageModeEnabled = await ensureImageModeEnabled();
                        } catch (_) {}

                        if (!imageModeEnabled) {
                            trace('image_mode_not_enabled', {
                                requestId: activeImageRequestId,
                            });
                            wsSend({
                                type: 'error',
                                error: {
                                    code: 'image_mode_not_enabled',
                                    message: 'Could not enable image generation mode before submit',
                                    requestId: activeImageRequestId,
                                },
                            });
                            continue;
                        }
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
        if (!src) return {ok: false, reason: 'missing_src'};
        const requestId = typeof activeImageRequestId === 'string' ? activeImageRequestId : null;
        if (!requestId) {
            console.debug('[cgpt-nav:image-drop-no-request-id]', {
                source: 'dom',
                src,
            });
            return {ok: false, reason: 'missing_request_id'};
        }
        try {
            const fileId = extractFileIdFromUrl(src);
            if (fileId && (seenImageFileIds.has(fileId) || pendingImageFileIds.has(fileId))) {
                return {ok: false, reason: 'already_seen_or_pending'};
            }
            if (fileId) pendingImageFileIds.add(fileId);

            const resp = await fetch(src, {credentials: 'include', cache: 'no-store'});
            if (!resp.ok) {
                trace('dom_fetch_failed', {
                    requestId,
                    fileId,
                    status: resp.status,
                });
                return {ok: false, reason: `image_status_${resp.status}`};
            }

            const mimeType = resp.headers.get('content-type') || 'image/png';
            const arrayBuffer = await resp.arrayBuffer();
            const dataBase64 = arrayBufferToBase64(arrayBuffer);

            wsSend({
                type: 'image.generated',
                requestId,
                fileId: fileId || null,
                fileName: null,
                mimeType,
                dataBase64,
            });
            trace('image_generated_sent_dom', {
                requestId,
                fileId: fileId || null,
                byteLength: dataBase64.length,
            });

            if (fileId) seenImageFileIds.add(fileId);
            return {ok: true};
        } catch (err) {
            return {ok: false, reason: String(err?.message || err || 'unknown_error')};
        } finally {
            const fileId = extractFileIdFromUrl(src);
            if (fileId) pendingImageFileIds.delete(fileId);
        }
    }

    function isGeneratedImageSrc(src) {
        if (typeof src !== 'string' || src.length === 0) return false;
        return src.includes('/backend-api/estuary/content?id=file_');
    }

    function updateLatestGeneratedImageSrc(src) {
        if (!isGeneratedImageSrc(src)) return;
        latestGeneratedImageSrc = src;
        void prefetchImageBySrc(src);
    }

    async function fetchArrayBufferWithTimeout(url, timeoutMs = 7000) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const resp = await fetch(url, {
                credentials: 'include',
                cache: 'no-store',
                signal: ctrl.signal,
            });
            if (!resp.ok) {
                return {ok: false, reason: `image_status_${resp.status}`};
            }
            const arrayBuffer = await resp.arrayBuffer();
            const mimeType = resp.headers.get('content-type') || 'image/png';
            return {ok: true, arrayBuffer, mimeType};
        } catch (err) {
            return {ok: false, reason: String(err?.message || err || 'fetch_failed')};
        } finally {
            clearTimeout(timer);
        }
    }

    async function prefetchImageBySrc(src) {
        const requestId = typeof activeImageRequestId === 'string' ? activeImageRequestId : null;
        const fileId = extractFileIdFromUrl(src);
        if (!requestId || !fileId) return;
        if (prefetchedImageByFileId.has(fileId)) return;
        if (prefetchPendingFileIds.has(fileId)) return;
        if (seenImageFileIds.has(fileId) || pendingImageFileIds.has(fileId)) return;

        prefetchPendingFileIds.add(fileId);

        try {
            const fetched = await fetchArrayBufferWithTimeout(src, 7000);
            if (!fetched.ok) {
                trace('prefetch_failed', {
                    requestId,
                    fileId,
                    reason: fetched.reason || 'unknown',
                });
                return;
            }

            const dataBase64 = arrayBufferToBase64(fetched.arrayBuffer);
            prefetchedImageByFileId.set(fileId, {
                requestId,
                mimeType: fetched.mimeType,
                dataBase64,
                at: Date.now(),
            });
            trace('prefetch_success', {
                requestId,
                fileId,
                byteLength: dataBase64.length,
            });

            for (const [conversationId, state] of imageStateByConversation.entries()) {
                if (conversationId === UNRESOLVED_IMAGE_STATE_KEY) continue;
                if (!state || !state.streamComplete) continue;
                if (!Array.isArray(state.candidateOrder) || !state.candidateOrder.includes(fileId)) continue;
                trace('prefetch_retrigger_finalize', {
                    requestId,
                    fileId,
                    conversationId,
                });
                clearConversationFinalizeTimer(state);
                void maybeSendFinalImageForConversation(conversationId);
            }

            if (prefetchedImageByFileId.size > 40) {
                const firstKey = Array.from(prefetchedImageByFileId.keys())[0];
                if (firstKey) prefetchedImageByFileId.delete(firstKey);
            }
        } finally {
            prefetchPendingFileIds.delete(fileId);
        }
    }

    function sendPrefetchedImage(fileId, conversationId = null, minAgeMs = 0) {
        if (!fileId) return false;
        const requestId = typeof activeImageRequestId === 'string' ? activeImageRequestId : null;
        if (!requestId) return false;

        const cached = prefetchedImageByFileId.get(fileId);
        if (!cached) return false;
        if (cached.requestId !== requestId) return false;
        if (minAgeMs > 0) {
            const ageMs = Date.now() - Number(cached.at || 0);
            if (ageMs < minAgeMs) return false;
        }

        wsSend({
            type: 'image.generated',
            requestId,
            fileId,
            conversationId,
            fileName: null,
            mimeType: cached.mimeType || 'image/png',
            dataBase64: cached.dataBase64,
        });
        trace('image_generated_sent_prefetch', {
            requestId,
            fileId,
            conversationId,
            byteLength: cached.dataBase64.length,
        });
        seenImageFileIds.add(fileId);
        prefetchedImageByFileId.delete(fileId);
        return true;
    }

    function clearConversationFinalizeTimer(state) {
        if (!state || !state.finalizeTimer) return;
        try {
            clearTimeout(state.finalizeTimer);
        } catch (_) {}
        state.finalizeTimer = null;
    }

    function scanRenderedImages(root = document) {
        const imgs = root.querySelectorAll('img[src*="/backend-api/estuary/content?id=file_"]');
        imgs.forEach(img => {
            const src = img.getAttribute('src') || '';
            updateLatestGeneratedImageSrc(src);
        });
    }

    function startImageObserver() {
        if (imageObserver) return;

        scanRenderedImages(document);

        imageObserver = new MutationObserver(mutations => {
            for (const m of mutations) {
                if (m.type === 'attributes' && m.target instanceof HTMLImageElement) {
                    const src = m.target.getAttribute('src') || '';
                    updateLatestGeneratedImageSrc(src);
                    continue;
                }

                if (!m.addedNodes || m.addedNodes.length === 0) continue;
                m.addedNodes.forEach(node => {
                    if (!(node instanceof Element)) return;
                    if (node instanceof HTMLImageElement) {
                        const src = node.getAttribute('src') || '';
                        updateLatestGeneratedImageSrc(src);
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
        if (!fileId || !conversationId) {
            return {ok: false, reason: 'missing_ids'};
        }
        const requestId = typeof activeImageRequestId === 'string' ? activeImageRequestId : null;
        if (!requestId) {
            console.debug('[cgpt-nav:image-drop-no-request-id]', {
                source: 'pointer_download',
                conversationId,
                fileId,
            });
            return {ok: false, reason: 'missing_request_id'};
        }
        if (seenImageFileIds.has(fileId) || pendingImageFileIds.has(fileId)) {
            return {ok: false, reason: 'already_seen_or_pending'};
        }

        trace('pointer_download_start', {
            requestId,
            conversationId,
            fileId,
        });

        pendingImageFileIds.add(fileId);

        async function tryEstuaryFallback(reason) {
            const estuaryUrls = [
                `https://chatgpt.com/backend-api/estuary/content?id=${encodeURIComponent(fileId)}&conversation_id=${encodeURIComponent(conversationId)}`,
                `https://chatgpt.com/backend-api/estuary/content?id=${encodeURIComponent(fileId)}`,
            ];

            for (const url of estuaryUrls) {
                try {
                    const resp = await fetch(url, {
                        credentials: 'include',
                        cache: 'no-store',
                    });

                    if (!resp.ok) {
                        trace('estuary_fallback_failed', {
                            requestId,
                            conversationId,
                            fileId,
                            reason,
                            status: resp.status,
                        });
                        continue;
                    }

                    const mimeType = resp.headers.get('content-type') || 'image/png';
                    const arrayBuffer = await resp.arrayBuffer();
                    const dataBase64 = arrayBufferToBase64(arrayBuffer);

                    wsSend({
                        type: 'image.generated',
                        requestId,
                        fileId,
                        conversationId,
                        fileName: null,
                        mimeType,
                        dataBase64,
                    });
                    trace('image_generated_sent_estuary', {
                        requestId,
                        conversationId,
                        fileId,
                        byteLength: dataBase64.length,
                    });
                    seenImageFileIds.add(fileId);
                    return {ok: true};
                } catch (err) {
                    trace('estuary_fallback_exception', {
                        requestId,
                        conversationId,
                        fileId,
                        reason,
                        detail: String(err?.message || err || 'unknown_error'),
                    });
                }
            }

            return {ok: false, reason: `estuary_fallback_${reason}`};
        }

        try {
            const metaUrl = `https://chatgpt.com/backend-api/files/download/${fileId}?conversation_id=${encodeURIComponent(
                conversationId
            )}&inline=false`;

            const metaResp = await fetch(metaUrl, {
                credentials: 'include',
                cache: 'no-store',
            });
            if (!metaResp.ok) {
                console.debug('[cgpt-nav:image-download-meta-failed]', {
                    conversationId,
                    fileId,
                    status: metaResp.status,
                });
                trace('pointer_download_meta_failed', {
                    requestId,
                    conversationId,
                    fileId,
                    status: metaResp.status,
                });
                return await tryEstuaryFallback(`meta_status_${metaResp.status}`);
            }

            const meta = await metaResp.json();
            const downloadUrl = typeof meta?.download_url === 'string' ? meta.download_url : '';
            if (!downloadUrl) {
                console.debug('[cgpt-nav:image-download-url-missing]', {
                    conversationId,
                    fileId,
                });
                trace('pointer_download_url_missing', {
                    requestId,
                    conversationId,
                    fileId,
                });
                return await tryEstuaryFallback('missing_download_url');
            }

            const imageResp = await fetch(downloadUrl, {
                credentials: 'include',
                cache: 'no-store',
            });
            if (!imageResp.ok) {
                console.debug('[cgpt-nav:image-download-content-failed]', {
                    conversationId,
                    fileId,
                    status: imageResp.status,
                });
                trace('pointer_download_content_failed', {
                    requestId,
                    conversationId,
                    fileId,
                    status: imageResp.status,
                });
                return await tryEstuaryFallback(`image_status_${imageResp.status}`);
            }

            const arrayBuffer = await imageResp.arrayBuffer();
            const dataBase64 = arrayBufferToBase64(arrayBuffer);
            const mimeType =
                imageResp.headers.get('content-type') || meta?.mime_type || 'image/png';

            wsSend({
                type: 'image.generated',
                requestId,
                fileId,
                conversationId,
                fileName: typeof meta?.file_name === 'string' ? meta.file_name : null,
                mimeType,
                dataBase64,
            });
            trace('image_generated_sent_pointer', {
                requestId,
                conversationId,
                fileId,
                byteLength: dataBase64.length,
            });

            seenImageFileIds.add(fileId);
            return {ok: true};
        } catch (err) {
            console.debug('[cgpt-nav:image-download-exception]', {
                conversationId,
                fileId,
                detail: String(err?.message || err || 'unknown_error'),
            });
            trace('pointer_download_exception', {
                requestId,
                conversationId,
                fileId,
                detail: String(err?.message || err || 'unknown_error'),
            });
            return {ok: false, reason: 'exception'};
        } finally {
            pendingImageFileIds.delete(fileId);
        }
    }

    function createConversationState() {
        return {
            slotFileIds: new Map(),
            candidateOrder: [],
            finalFileId: null,
            streamComplete: false,
            streamCompleteAt: 0,
            finalizeTimer: null,
            recoveryStartedAt: 0,
            singleRecoveryStartedAt: 0,
            finalizeInProgress: false,
        };
    }

    function resetConversationImageState(state) {
        if (!state) return;
        state.streamComplete = false;
        state.streamCompleteAt = 0;
        state.recoveryStartedAt = 0;
        state.singleRecoveryStartedAt = 0;
        clearConversationFinalizeTimer(state);
        state.slotFileIds.clear();
        state.candidateOrder = [];
        state.finalFileId = null;
    }

    function getConversationState(conversationId) {
        const key = String(conversationId || '');
        if (!key) return null;
        const existing = imageStateByConversation.get(key);
        if (existing) return existing;

        const next = createConversationState();
        imageStateByConversation.set(key, next);
        return next;
    }

    function getOrCreateImageStateByKey(stateKey) {
        const key = String(stateKey || '');
        if (!key) return null;

        const existing = imageStateByConversation.get(key);
        if (existing) return existing;

        const next = createConversationState();
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
        recordImageCandidate(state, fileId);
    }

    function recordImageCandidate(state, fileId) {
        if (!state || !fileId) return;
        if (!Array.isArray(state.candidateOrder)) {
            state.candidateOrder = [];
        }
        state.candidateOrder = state.candidateOrder.filter(v => v !== fileId);
        state.candidateOrder.push(fileId);
    }

    function mergeImageStates(targetState, sourceState) {
        if (!targetState || !sourceState || targetState === sourceState) return;

        if (sourceState.slotFileIds instanceof Map) {
            for (const [slot, fileId] of sourceState.slotFileIds.entries()) {
                if (!fileId) continue;
                setConversationSlotFileId(targetState, slot, fileId);
            }
        }

        if (Array.isArray(sourceState.candidateOrder)) {
            for (const fileId of sourceState.candidateOrder) {
                if (!fileId) continue;
                recordImageCandidate(targetState, fileId);
            }
        }

        if (typeof sourceState.finalFileId === 'string' && sourceState.finalFileId) {
            targetState.finalFileId = sourceState.finalFileId;
        }

        if (sourceState.streamComplete) {
            targetState.streamComplete = true;
            targetState.streamCompleteAt = Math.max(
                targetState.streamCompleteAt || 0,
                sourceState.streamCompleteAt || 0
            );
        }

        if (sourceState.singleRecoveryStartedAt) {
            targetState.singleRecoveryStartedAt = Math.max(
                targetState.singleRecoveryStartedAt || 0,
                sourceState.singleRecoveryStartedAt || 0
            );
        }
    }

    function mergeUnresolvedImageState(conversationId) {
        if (!conversationId) return;

        const unresolvedState = imageStateByConversation.get(UNRESOLVED_IMAGE_STATE_KEY);
        if (!unresolvedState) return;

        const targetState = getConversationState(conversationId);
        if (!targetState) return;

        mergeImageStates(targetState, unresolvedState);
        imageStateByConversation.delete(UNRESOLVED_IMAGE_STATE_KEY);

        console.debug('[cgpt-nav:image-state-merged]', {
            conversationId,
            mergedCandidates: Array.isArray(targetState.candidateOrder)
                ? targetState.candidateOrder.length
                : 0,
        });
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
            if (message?.status === 'finished_successfully') {
                state.finalFileId = fileId;
            }
        }
    }

    function collectImagePointersFromPatchPayload(data, state) {
        if (!data || data.o !== 'patch') return;

        const patches = Array.isArray(data?.p)
            ? data.p
            : Array.isArray(data?.patches)
              ? data.patches
              : Array.isArray(data?.v)
                ? data.v
              : [];

        let statusFinished = false;
        let lastPatchedFileId = null;

        for (const patch of patches) {
            if (!patch || typeof patch !== 'object') continue;

            const path =
                typeof patch.p === 'string'
                    ? patch.p
                    : typeof patch.path === 'string'
                      ? patch.path
                      : null;

            const value =
                typeof patch.v === 'string'
                    ? patch.v
                    : typeof patch.value === 'string'
                      ? patch.value
                      : null;

            if (path === '/message/status' && value === 'finished_successfully') {
                statusFinished = true;
            }

            if (!path || !/\/message\/content\/parts\/\d+\/asset_pointer$/.test(path)) continue;

            const fileId = extractFileIdFromAssetPointer(value);
            if (!fileId) continue;

            const slotMatch = path.match(/\/message\/content\/parts\/(\d+)\/asset_pointer$/);
            const slotIndex = slotMatch && slotMatch[1] ? Number(slotMatch[1]) : -1;
            setConversationSlotFileId(state, slotIndex, fileId);
            lastPatchedFileId = fileId;
        }

        if (statusFinished && lastPatchedFileId) {
            state.finalFileId = lastPatchedFileId;
        }
    }

    function updateImageStateFromSse(payload) {
        const data = extractSseJson(payload);
        if (!data || typeof data !== 'object') return;

        const conversationId = extractConversationId(payload);
        if (conversationId) {
            mergeUnresolvedImageState(conversationId);
        }

        const stateKey = conversationId || UNRESOLVED_IMAGE_STATE_KEY;
        const state = getOrCreateImageStateByKey(stateKey);
        if (!state) return;

        collectImagePointersFromAddPayload(data, state);
        collectImagePointersFromPatchPayload(data, state);

        if (data.type === 'message_stream_complete') {
            state.streamComplete = true;
            state.streamCompleteAt = Date.now();
            console.debug('[cgpt-nav:image-stream-complete]', {
                conversationId: conversationId || null,
                stateKey,
                candidateCount: Array.isArray(state.candidateOrder) ? state.candidateOrder.length : 0,
            });
        }
    }

    async function maybeSendFinalImageForConversation(conversationId) {
        if (!conversationId) return;
        const state = imageStateByConversation.get(conversationId);
        if (!state || !state.streamComplete) return;

        if (state.finalizeInProgress) {
            return;
        }
        state.finalizeInProgress = true;

        try {
            clearConversationFinalizeTimer(state);
            const elapsedSinceComplete = Date.now() - Number(state.streamCompleteAt || 0);
            if (elapsedSinceComplete < IMAGE_FINAL_SETTLE_DELAY_MS) {
                const waitMs = IMAGE_FINAL_SETTLE_DELAY_MS - elapsedSinceComplete;
                trace('final_settle_wait', {
                    requestId: activeImageRequestId,
                    conversationId,
                    waitMs,
                });
                state.finalizeTimer = setTimeout(() => {
                    const current = imageStateByConversation.get(conversationId);
                    if (!current || !current.streamComplete) return;
                    void maybeSendFinalImageForConversation(conversationId);
                }, waitMs);
                return;
            }

            const strictFinalCandidate =
                typeof state.finalFileId === 'string' &&
                state.finalFileId &&
                !seenImageFileIds.has(state.finalFileId) &&
                !pendingImageFileIds.has(state.finalFileId)
                    ? state.finalFileId
                    : null;

            const finalCandidatesBySlot = Array.from(state.slotFileIds.values()).filter(
                fileId => fileId && !seenImageFileIds.has(fileId) && !pendingImageFileIds.has(fileId)
            );
            const finalCandidatesByOrder = Array.isArray(state.candidateOrder)
                ? state.candidateOrder.filter(
                      fileId =>
                          fileId && !seenImageFileIds.has(fileId) && !pendingImageFileIds.has(fileId)
                  )
                : [];
            const uniqueOrder = Array.from(new Set(finalCandidatesByOrder));
            const activeSlotEntries = Array.from(state.slotFileIds.entries()).filter(([slot, fileId]) => {
                return Number.isInteger(slot) && slot >= 0 && !!fileId;
            });
            const activeSlotIndexes = new Set(activeSlotEntries.map(([slot]) => slot));
            const activeSlotFileIds = Array.from(
                new Set(activeSlotEntries.map(([, fileId]) => String(fileId)))
            );
            const isCompareMode = activeSlotIndexes.size > 1 && activeSlotFileIds.length > 1;

            const slotZeroCandidate =
                typeof state.slotFileIds.get(0) === 'string' &&
                state.slotFileIds.get(0) &&
                !seenImageFileIds.has(state.slotFileIds.get(0)) &&
                !pendingImageFileIds.has(state.slotFileIds.get(0))
                    ? state.slotFileIds.get(0)
                    : null;

            const newestOrderCandidate = uniqueOrder.length > 0 ? uniqueOrder[uniqueOrder.length - 1] : null;

            const strictSingleCandidate = strictFinalCandidate || slotZeroCandidate || newestOrderCandidate;

            trace('candidate_mode_classified', {
                requestId: activeImageRequestId,
                conversationId,
                isCompareMode,
                activeSlotCount: activeSlotIndexes.size,
                activeSlotFileCount: activeSlotFileIds.length,
                strictFinalCandidate,
                strictSingleCandidate,
                candidateOrderCount: uniqueOrder.length,
            });

            let finalCandidates = [];
            if (isCompareMode) {
                if (strictFinalCandidate) {
                    const newestFallbacks = uniqueOrder
                        .filter(fileId => fileId !== strictFinalCandidate)
                        .reverse();
                    finalCandidates = [strictFinalCandidate, ...newestFallbacks];
                } else {
                    finalCandidates = Array.from(new Set([...finalCandidatesBySlot, ...uniqueOrder])).reverse();
                }
            } else if (strictSingleCandidate) {
                finalCandidates = [strictSingleCandidate];
            } else {
                finalCandidates = [];
            }

            if (finalCandidates.length > 0) {
                let sent = false;
                trace('final_candidates_ready', {
                    requestId: activeImageRequestId,
                    conversationId,
                    finalCandidates,
                    strictFinalCandidate,
                    isCompareMode,
                });

                for (const selectedFileId of finalCandidates) {
                    const isStrict =
                        (isCompareMode && !!strictFinalCandidate && selectedFileId === strictFinalCandidate) ||
                        (!isCompareMode && !!strictSingleCandidate && selectedFileId === strictSingleCandidate);
                    if (
                        sendPrefetchedImage(
                            selectedFileId,
                            conversationId,
                            isStrict ? IMAGE_FINAL_SETTLE_DELAY_MS : 0
                        )
                    ) {
                        sent = true;
                        trace('final_candidate_success', {
                            requestId: activeImageRequestId,
                            conversationId,
                            selectedFileId,
                            via: 'prefetch',
                        });
                        break;
                    }

                    const result = await fetchAndForwardGeneratedImage(selectedFileId, conversationId);
                    if (result?.ok) {
                        sent = true;
                        trace('final_candidate_success', {
                            requestId: activeImageRequestId,
                            conversationId,
                            selectedFileId,
                        });
                        break;
                    }

                    trace('final_candidate_failed', {
                        requestId: activeImageRequestId,
                        conversationId,
                        selectedFileId,
                        reason: result?.reason || 'unknown',
                    });
                }

                if (!sent && latestGeneratedImageSrc) {
                    trace('final_candidates_exhausted_try_dom', {
                        requestId: activeImageRequestId,
                        conversationId,
                    });

                    const latestFileId = extractFileIdFromUrl(latestGeneratedImageSrc);
                    const expectedDomFileId = isCompareMode
                        ? strictFinalCandidate || null
                        : strictSingleCandidate || null;
                    const latestMatchesExpected = expectedDomFileId
                        ? latestFileId && latestFileId === expectedDomFileId
                        : isCompareMode;

                    if (
                        latestFileId &&
                        (latestMatchesExpected || isCompareMode) &&
                        sendPrefetchedImage(
                            latestFileId,
                            conversationId,
                            expectedDomFileId && latestMatchesExpected ? IMAGE_FINAL_SETTLE_DELAY_MS : 0
                        )
                    ) {
                        sent = true;
                    }

                    if (!sent) {
                        const fallbackResult = latestMatchesExpected || isCompareMode
                            ? await forwardImageBySrc(latestGeneratedImageSrc)
                            : {ok: false, reason: 'latest_dom_not_expected_candidate'};
                        if (fallbackResult?.ok) {
                            sent = true;
                        } else {
                            trace('final_candidates_dom_failed', {
                                requestId: activeImageRequestId,
                                conversationId,
                                reason: fallbackResult?.reason || 'unknown',
                            });
                        }
                    }
                }

                if (sent) {
                    resetConversationImageState(state);
                    return;
                }

                if (isCompareMode) {
                    if (!state.recoveryStartedAt) {
                        state.recoveryStartedAt = Date.now();
                        trace('compare_recovery_started', {
                            requestId: activeImageRequestId,
                            conversationId,
                        });
                    }
                    const recoveryElapsed = Date.now() - Number(state.recoveryStartedAt || 0);
                    if (recoveryElapsed < COMPARE_RECOVERY_MAX_MS) {
                        trace('compare_recovery_retry', {
                            requestId: activeImageRequestId,
                            conversationId,
                            retryInMs: COMPARE_RECOVERY_RETRY_MS,
                            recoveryElapsed,
                        });
                        state.finalizeTimer = setTimeout(() => {
                            const current = imageStateByConversation.get(conversationId);
                            if (!current || !current.streamComplete) return;
                            void maybeSendFinalImageForConversation(conversationId);
                        }, COMPARE_RECOVERY_RETRY_MS);
                        return;
                    }

                    trace('compare_recovery_timeout', {
                        requestId: activeImageRequestId,
                        conversationId,
                        recoveryElapsed,
                    });
                } else {
                    if (!state.singleRecoveryStartedAt) {
                        state.singleRecoveryStartedAt = Date.now();
                        trace('single_recovery_started', {
                            requestId: activeImageRequestId,
                            conversationId,
                            strictSingleCandidate,
                            strictFinalCandidate,
                            slotZeroCandidate,
                        });
                    }
                    const recoveryElapsed = Date.now() - Number(state.singleRecoveryStartedAt || 0);
                    if (recoveryElapsed < SINGLE_RECOVERY_MAX_MS) {
                        trace('single_recovery_retry', {
                            requestId: activeImageRequestId,
                            conversationId,
                            strictSingleCandidate,
                            strictFinalCandidate,
                            retryInMs: SINGLE_RECOVERY_RETRY_MS,
                            recoveryElapsed,
                        });
                        state.finalizeTimer = setTimeout(() => {
                            const current = imageStateByConversation.get(conversationId);
                            if (!current || !current.streamComplete) return;
                            void maybeSendFinalImageForConversation(conversationId);
                        }, SINGLE_RECOVERY_RETRY_MS);
                        return;
                    }

                    trace('single_recovery_timeout', {
                        requestId: activeImageRequestId,
                        conversationId,
                        strictSingleCandidate,
                        strictFinalCandidate,
                        recoveryElapsed,
                    });
                }

                resetConversationImageState(state);
                return;
            }

            if (latestGeneratedImageSrc) {
                const latestFileId = extractFileIdFromUrl(latestGeneratedImageSrc);
                const fallbackAllowed = isCompareMode
                    ? true
                    : !!strictSingleCandidate && !!latestFileId && latestFileId === strictSingleCandidate;

                if (fallbackAllowed) {
                    const fallbackResult = await forwardImageBySrc(latestGeneratedImageSrc);
                    if (fallbackResult?.ok) {
                        resetConversationImageState(state);
                        return;
                    }
                    trace('final_candidates_dom_failed', {
                        requestId: activeImageRequestId,
                        conversationId,
                        reason: fallbackResult?.reason || 'unknown',
                    });
                } else {
                    trace('final_candidates_dom_skipped', {
                        requestId: activeImageRequestId,
                        conversationId,
                        strictSingleCandidate,
                        latestFileId: latestFileId || null,
                        reason: 'latest_dom_not_expected_candidate',
                    });
                }
            }

            if (isCompareMode) {
                if (!state.recoveryStartedAt) {
                    state.recoveryStartedAt = Date.now();
                    trace('compare_recovery_started', {
                        requestId: activeImageRequestId,
                        conversationId,
                    });
                }
                const recoveryElapsed = Date.now() - Number(state.recoveryStartedAt || 0);
                if (recoveryElapsed < COMPARE_RECOVERY_MAX_MS) {
                    trace('compare_recovery_retry', {
                        requestId: activeImageRequestId,
                        conversationId,
                        retryInMs: COMPARE_RECOVERY_RETRY_MS,
                        recoveryElapsed,
                    });
                    state.finalizeTimer = setTimeout(() => {
                        const current = imageStateByConversation.get(conversationId);
                        if (!current || !current.streamComplete) return;
                        void maybeSendFinalImageForConversation(conversationId);
                    }, COMPARE_RECOVERY_RETRY_MS);
                    return;
                }

                trace('compare_recovery_timeout', {
                    requestId: activeImageRequestId,
                    conversationId,
                    recoveryElapsed,
                });
            } else {
                if (!state.singleRecoveryStartedAt) {
                    state.singleRecoveryStartedAt = Date.now();
                    trace('single_recovery_started', {
                        requestId: activeImageRequestId,
                        conversationId,
                        strictSingleCandidate,
                        strictFinalCandidate,
                        slotZeroCandidate,
                    });
                }
                const recoveryElapsed = Date.now() - Number(state.singleRecoveryStartedAt || 0);
                if (recoveryElapsed < SINGLE_RECOVERY_MAX_MS) {
                    trace('single_recovery_retry', {
                        requestId: activeImageRequestId,
                        conversationId,
                        strictSingleCandidate,
                        strictFinalCandidate,
                        retryInMs: SINGLE_RECOVERY_RETRY_MS,
                        recoveryElapsed,
                    });
                    state.finalizeTimer = setTimeout(() => {
                        const current = imageStateByConversation.get(conversationId);
                        if (!current || !current.streamComplete) return;
                        void maybeSendFinalImageForConversation(conversationId);
                    }, SINGLE_RECOVERY_RETRY_MS);
                    return;
                }

                trace('single_recovery_timeout', {
                    requestId: activeImageRequestId,
                    conversationId,
                    strictSingleCandidate,
                    strictFinalCandidate,
                    recoveryElapsed,
                });
            }

            resetConversationImageState(state);
        } finally {
            state.finalizeInProgress = false;
        }
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
