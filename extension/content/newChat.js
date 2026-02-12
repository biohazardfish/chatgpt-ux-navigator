(() => {
    window.CGPT_NAV = window.CGPT_NAV || {};

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    /**
     * Wait for a function to return a truthy value (polling).
     * @template T
     * @param {() => T} fn
     * @param {{timeoutMs?: number, intervalMs?: number}} opts
     * @returns {Promise<T|null>}
     */
    async function waitFor(fn, opts = {}) {
        const timeoutMs = opts.timeoutMs ?? 8000;
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

    /**
     * Check if an element is visible (not hidden by CSS).
     * @param {HTMLElement} el
     * @returns {boolean}
     */
    function isElementVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        // Check basic CSS visibility
        const isCssVisible =
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            parseFloat(style.opacity) > 0;

        // Check if element has dimensions (for elements that might be in a drawer/popover)
        const hasDimensions = rect.width > 0 && rect.height > 0;

        return isCssVisible && hasDimensions;
    }

    /**
     * Open the sidebar drawer on small screens (if it exists and is closed).
     * @returns {Promise<boolean>} true if sidebar was opened or already open
     */
    async function ensureSidebarOpen() {
        // Look for the "Open sidebar" button (only present on small screens)
        const openSidebarBtn = document.querySelector('[data-testid="open-sidebar-button"]');

        if (!openSidebarBtn) {
            // No open sidebar button found - likely desktop layout where sidebar is always visible
            console.log('[newChat] No open-sidebar-button found - using desktop layout');
            return true;
        }

        // Check if button indicates sidebar is closed (aria-expanded="false")
        const isExpanded = openSidebarBtn.getAttribute('aria-expanded') === 'true';
        console.log('[newChat] Sidebar button found, aria-expanded:', isExpanded);

        if (!isExpanded && openSidebarBtn instanceof HTMLElement) {
            // Sidebar is closed, click to open it
            console.log('[newChat] Opening sidebar drawer...');
            openSidebarBtn.click();

            // Wait for sidebar to animate open and render
            await sleep(400);
            return true;
        }

        // Sidebar already open
        console.log('[newChat] Sidebar already open');
        return true;
    }

    /**
     * Find and click the "New chat" control (best-effort).
     * Handles both desktop layout and small screen layout where the button is inside a drawer.
     * @returns {Promise<boolean>}
     */
    async function clickNewChatButton() {
        // First, ensure sidebar is open (important for small screens)
        await ensureSidebarOpen();

        // Common selectors across chatgpt.com variants
        const candidates = [
            '#stage-popover-sidebar > nav > aside > a:nth-child(1)',
            '[data-testid="create-new-chat-button"]',
            'button[aria-label="New chat"]',
            'a[aria-label="New chat"]',
            'button[aria-label*="New chat"]',
            'a[aria-label*="New chat"]',
        ];

        console.log('[newChat] Searching for New chat button...');
        for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (el instanceof HTMLElement) {
                const visible = isElementVisible(el);
                console.log(`[newChat] Found element with selector "${sel}", visible:`, visible);

                if (visible) {
                    console.log('[newChat] Clicking New chat button');
                    el.click();
                    return true;
                }
            }
        }

        // Fallback: scan clickable elements for visible text
        console.log('[newChat] Trying fallback text search...');
        const clickables = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        for (const el of clickables) {
            if (!(el instanceof HTMLElement)) continue;
            if (!isElementVisible(el)) continue;

            const t = (el.innerText || el.textContent || '').trim().toLowerCase();
            if (t === 'new chat' || t === 'new') {
                console.log('[newChat] Found New chat button via text search:', t);
                el.click();
                return true;
            }
        }

        console.error('[newChat] Could not find New chat button');
        return false;
    }

    /**
     * Determines the specific state for temporary chat based on known aria-labels
     * or falls back to generic toggle state detection.
     * @param {HTMLElement} el
     * @returns {boolean|null}
     */
    function getTemporaryChatToggleState(el) {
        if (!(el instanceof HTMLElement)) return null;

        if (el.ariaLabel === 'Turn off temporary chat') {
            return true; // Temporary chat is ON
        }
        if (el.ariaLabel === 'Turn on temporary chat') {
            return false; // Temporary chat is OFF
        }
        // Fallback to generic toggle state detection for other elements/labels
        return getToggleState(el);
    }

    /**
     * Return tri-state for a toggle-like element:
     * - true: definitely ON
     * - false: definitely OFF
     * - null: unknown
     * @param {Element} el
     * @returns {boolean|null}
     */
    function getToggleState(el) {
        if (!(el instanceof Element)) return null;

        // If it's a real checkbox input
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
            return !!el.checked;
        }

        // aria-checked is authoritative for switches/checkbox-like roles
        const ariaChecked = el.getAttribute('aria-checked');
        if (ariaChecked === 'true') return true;
        if (ariaChecked === 'false') return false;

        // aria-pressed is authoritative for toggle buttons
        const ariaPressed = el.getAttribute('aria-pressed');
        if (ariaPressed === 'true') return true;
        if (ariaPressed === 'false') return false;

        // Common attribute used by headless UI / radix
        const dataState = el.getAttribute('data-state');
        if (dataState === 'checked' || dataState === 'on' || dataState === 'open') return true;
        if (dataState === 'unchecked' || dataState === 'off' || dataState === 'closed')
            return false;

        // If it contains an input checkbox inside, use that
        const innerCb = el.querySelector?.('input[type="checkbox"]');
        if (innerCb instanceof HTMLInputElement) return !!innerCb.checked;

        // Unknown: do NOT guess via class names (too risky; causes flips)
        return null;
    }

    /**
     * Best-effort: find a Temporary Chat toggle/switch/button and enable it.
     * Returns true if it believes the UI is now in temporary mode.
     * @returns {Promise<boolean>}
     */
    async function ensureTemporaryChatEnabled() {
        // Wait for the prompt input to exist as a sign the page is ready
        const prompt = await waitFor(
            () =>
                document.querySelector('[data-testid="prompt-textarea"][contenteditable="true"]') ||
                document.querySelector('form [contenteditable="true"]'),
            {timeoutMs: 12000}
        );

        if (!prompt) return false;

        // Give UI a beat to mount header/toolbars around composer
        await sleep(250);

        const selectors = [
            // Specific aria-labels for on/off state (most reliable)
            'button[aria-label="Turn off temporary chat"]', // Indicates temporary chat is currently ON
            'button[aria-label="Turn on temporary chat"]', // Indicates temporary chat is currently OFF

            // switches
            '[role="switch"][aria-label*="Temporary"]',
            '[role="switch"][aria-label*="temporary"]',
            // toggle buttons
            'button[aria-label*="Temporary"]',
            'button[aria-label*="temporary"]',
            'button[data-testid*="temporary"]',
            'button[data-testid*="Temporary"]',
            // sometimes the clickable is the label wrapper
            '[role="button"][aria-label*="Temporary"]',
            '[role="button"][aria-label*="temporary"]',
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (!(el instanceof HTMLElement)) continue;

            // Use the specialized function to get the state
            const state = getTemporaryChatToggleState(el);

            // Only click if we can prove it's OFF.
            // If unknown, do nothing to avoid toggling OFF accidentally.
            if (state === false) {
                el.click();
                await sleep(200);

                // Re-check if possible using the specialized function
                const after = getTemporaryChatToggleState(el);
                if (after === true) return true;

                // If still unknown, we at least attempted once.
                return true;
            }

            // If it's already ON, return success.
            if (state === true) return true;

            // state === null => unknown: do not click; continue searching
        }

        // Fallback: search buttons/role=button by visible text
        const clickables = Array.from(document.querySelectorAll('button, [role="button"]'));
        for (const el of clickables) {
            if (!(el instanceof HTMLElement)) continue;

            const txt = (el.innerText || el.textContent || '').trim();
            const low = txt.toLowerCase();

            if (low === 'temporary' || low.includes('temporary chat') || low === 'temporary chat') {
                const state = getToggleState(el);

                // Same rule: only click if definitely OFF
                if (state === false) {
                    el.click();
                    await sleep(200);
                    return true;
                }

                if (state === true) return true;

                // unknown -> do nothing (avoid accidental OFF)
            }
        }

        // If we can't find a reliable control or state, do not click anything.
        return false;
    }

    /**
     * Best-effort: find a Temporary Chat toggle/switch/button and disable it.
     * Returns true if it believes the UI is now in non-temporary mode.
     * @returns {Promise<boolean>}
     */
    async function ensureTemporaryChatDisabled() {
        const prompt = await waitFor(
            () =>
                document.querySelector('[data-testid="prompt-textarea"][contenteditable="true"]') ||
                document.querySelector('form [contenteditable="true"]'),
            {timeoutMs: 12000}
        );

        if (!prompt) return false;

        await sleep(250);

        const selectors = [
            'button[aria-label="Turn off temporary chat"]',
            'button[aria-label="Turn on temporary chat"]',
            '[role="switch"][aria-label*="Temporary"]',
            '[role="switch"][aria-label*="temporary"]',
            'button[aria-label*="Temporary"]',
            'button[aria-label*="temporary"]',
            'button[data-testid*="temporary"]',
            'button[data-testid*="Temporary"]',
            '[role="button"][aria-label*="Temporary"]',
            '[role="button"][aria-label*="temporary"]',
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (!(el instanceof HTMLElement)) continue;

            const state = getTemporaryChatToggleState(el);

            if (state === true) {
                el.click();
                await sleep(200);
                const after = getTemporaryChatToggleState(el);
                if (after === false) return true;
                return true;
            }

            if (state === false) return true;
        }

        const clickables = Array.from(document.querySelectorAll('button, [role="button"]'));
        for (const el of clickables) {
            if (!(el instanceof HTMLElement)) continue;

            const txt = (el.innerText || el.textContent || '').trim();
            const low = txt.toLowerCase();

            if (low === 'temporary' || low.includes('temporary chat') || low === 'temporary chat') {
                const state = getToggleState(el);
                if (state === true) {
                    el.click();
                    await sleep(200);
                    return true;
                }

                if (state === false) return true;
            }
        }

        return false;
    }

    /**
     * Public API: start a new chat and attempt to enable temporary chat.
     * @returns {Promise<{ok:boolean, temp:boolean, error?:string}>}
     */
    async function startNewTemporaryChat() {
        return startNewChat({temporary: true});
    }

    /**
     * Public API: start a new chat with temporary mode control.
     * @param {{temporary?: boolean}} opts
     * @returns {Promise<{ok:boolean, temp:boolean, error?:string}>}
     */
    async function startNewChat(opts = {}) {
        const temporary = opts.temporary !== false;
        console.log('[newChat] Starting new chat...', {temporary});

        const clicked = await clickNewChatButton();
        console.log('[newChat] New chat button clicked:', clicked);

        if (!clicked) {
            return {ok: false, temp: false, error: 'Could not find the "New chat" button.'};
        }

        window.CGPT_NAV.sidebar?.resetList?.();

        await sleep(1500);

        if (temporary) {
            const tempOk = await ensureTemporaryChatEnabled();
            console.log('[newChat] Temporary chat enabled:', tempOk);
            return {ok: true, temp: tempOk};
        }

        const tempOff = await ensureTemporaryChatDisabled();
        console.log('[newChat] Temporary chat disabled:', tempOff);
        return {ok: true, temp: false};
    }

    window.CGPT_NAV.newChat = {
        startNewTemporaryChat,
        startNewChat,
        ensureTemporaryChatDisabled,
    };
})();
