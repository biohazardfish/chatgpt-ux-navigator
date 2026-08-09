(() => {
    const {
        store,
        model,
        observer,
        sidebar,
        activeSection,
        conversationId,
        ledgerState,
        ledgerPanel,
    } = window.CGPT_NAV;

    function init() {
        sidebar.ensureShowButton();
        sidebar.createSidebar();

        // initial scan
        model.fullRescan();
        sidebar.renderAll(); // render from model state
        if (activeSection?.start) activeSection.start();
        if (store.isHidden()) sidebar.hideSidebar();
        else sidebar.showSidebar();

        // Conversation State Ledger
        ledgerPanel.mount();
        ledgerState.init();

        // ChatGPT swaps threads without a page load. Without this the model would
        // keep entries from the previous thread and the ledger would write one
        // conversation's state onto another.
        conversationId.watchNavigation((nextKey, prevKey) => {
            sidebar.resetList(); // clears the model and the rendered list
            model.fullRescan();
            sidebar.renderAll(true);

            // Rescan first: the ledger measures conversation size on load, and
            // reading it against an empty model would make the next turn look like
            // a huge influx of new content.
            ledgerState.switchConversation(nextKey, prevKey);
        });

        // observer updates
        observer.startObserver(
            () => {
                sidebar.renderFromModelIncremental();
                if (activeSection?.recomputeActive) activeSection.recomputeActive();
            },
            () => {
                ledgerState.handleTurnSettled();
            }
        );

        // keyboard toggle
        window.addEventListener('keydown', e => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'y') {
                const hidden = store.isHidden();
                store.setHidden(!hidden);
                if (hidden) {
                    sidebar.showSidebar();
                    sidebar.renderAll();
                } else {
                    sidebar.hideSidebar();
                }
            }
        });

        // confirm when user accidently close tab on temporary chat
        window.addEventListener('beforeunload', e => {
            e.preventDefault();
            e.returnValue = '';
        });

        // Persistently highlight a code block when user clicks it in the page
        document.addEventListener(
            'click',
            e => {
                const t = e.target;
                if (!(t instanceof Element)) return;
                if (window.CGPT_NAV.dom?.isInExtensionDom(t)) return;

                const pre = t.closest('pre');
                if (!pre) return;

                // Only treat it as a "navigator code block" if it has/gets the CODE_ATTR
                if (
                    window.CGPT_NAV.C?.CODE_ATTR &&
                    !pre.hasAttribute(window.CGPT_NAV.C.CODE_ATTR)
                ) {
                    // assign an id so it participates consistently
                    window.CGPT_NAV.dom?.ensureAttrId(pre, window.CGPT_NAV.C.CODE_ATTR);
                }

                // If it is a pre inside ChatGPT content, select/highlight it
                window.CGPT_NAV.scroll?.selectCodeBlock(pre);
            },
            true
        );
    }

    init();
})();
