// extension/content/conversationId.js
//
// Conversation identity for the state ledger.
//
// ChatGPT is a SPA: the thread changes without a page load, and a brand new chat
// has no id in its URL until the first response lands. Both cases have to be
// handled or the ledger will write one thread's state onto another.
(() => {
    window.CGPT_NAV = window.CGPT_NAV || {};
    const {C} = window.CGPT_NAV;

    /**
     * Extract the conversation key from a pathname.
     * Pure: no DOM, no location access. Returns the PENDING key for a chat that
     * has not been assigned a URL yet (a fresh chat sits at "/").
     * @param {string} pathname
     * @returns {string}
     */
    function extractConversationKey(pathname) {
        const p = String(pathname || '');
        const m = p.match(/\/c\/([0-9a-f-]{16,})/i);
        if (m && m[1]) return m[1].toLowerCase();
        return C.LEDGER.PENDING_KEY;
    }

    /**
     * @returns {string} conversation key for the currently displayed thread
     */
    function getConversationKey() {
        return extractConversationKey(location.pathname);
    }

    /**
     * @param {string} key
     * @returns {boolean} true while ChatGPT has not yet assigned a thread URL
     */
    function isPending(key) {
        return key === C.LEDGER.PENDING_KEY;
    }

    /**
     * Watch for SPA navigation between threads.
     *
     * The extension had no navigation handling at all before this, so history
     * patching is introduced here. Patching is done once and kept idempotent so
     * repeated bootstraps (or a future second caller) cannot stack wrappers.
     *
     * @param {(nextKey: string, prevKey: string) => void} onChange
     */
    let watching = false;
    let lastKey = null;

    function watchNavigation(onChange) {
        if (watching) return;
        watching = true;

        lastKey = getConversationKey();

        const check = () => {
            const next = getConversationKey();
            if (next === lastKey) return;
            const prev = lastKey;
            lastKey = next;
            try {
                onChange(next, prev);
            } catch (e) {
                console.debug('[cgpt-nav:ledger] navigation handler failed', e);
            }
        };

        const wrap = name => {
            const original = history[name];
            if (typeof original !== 'function' || original.__cgptNavWrapped) return;

            const patched = function (...args) {
                const result = original.apply(this, args);
                // Let the SPA finish its own routing before we read location.
                setTimeout(check, 0);
                return result;
            };
            patched.__cgptNavWrapped = true;
            history[name] = patched;
        };

        wrap('pushState');
        wrap('replaceState');

        window.addEventListener('popstate', () => setTimeout(check, 0));

        // Safety net: ChatGPT can swap threads through routes we do not observe,
        // and a missed transition means cross-thread state corruption.
        setInterval(check, 1500);
    }

    window.CGPT_NAV.conversationId = {
        extractConversationKey,
        getConversationKey,
        isPending,
        watchNavigation,
    };
})();
