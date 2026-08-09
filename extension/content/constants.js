// extension/content/constants.js
(() => {
    window.CGPT_NAV = window.CGPT_NAV || {};

    const C = {
        EXT_ID: 'cgpt-nav',
        SHOW_ID: 'cgpt-nav-show',
        PROMPT_MENU_ID: 'cgpt-nav-prompt-menu',

        ITEM_ATTR: 'data-cgpt-nav-id',
        CODE_ATTR: 'data-cgpt-nav-code-id',

        STORAGE_KEY_HIDDEN: 'cgpt_nav_hidden',
        STORAGE_KEY_SERVER_URL: 'cgpt_nav_server_url',

        ROLE_SEL: '[data-message-author-role="user"], [data-message-author-role="assistant"]',
        TURN_SEL: '[data-testid="conversation-turn"]',
        STOP_BTN_SEL: '[data-testid="stop-button"]',

        MSG: {
            FETCH_LIST: 'cgpt-nav-fetch-list',
            FETCH_PROMPT: 'cgpt-nav-fetch-prompt',
            SAVE_RESPONSE: 'cgpt-nav-save-response',
            INTERPRET_STATE: 'cgpt-nav-interpret-state',
        },

        PROMPT_LIST_TTL_MS: 10_000,

        // Conversation State Ledger
        LEDGER: {
            // Bump when the persisted record shape changes.
            SCHEMA_VERSION: 1,

            // chrome.storage.local key prefix; one record per conversation.
            STORAGE_PREFIX: 'cgpt_nav_ledger:',

            // chrome.storage.sync key holding the State Interpreter tab's client id.
            STORAGE_KEY_INTERPRETER_ID: 'cgpt_nav_interpreter_client_id',

            // Key used before ChatGPT assigns the conversation a /c/<uuid> URL.
            PENDING_KEY: '__pending__',

            // A turn counts as settled once the DOM stops mutating for this long
            // AND the composer's stop button is gone.
            SETTLE_MS: 1200,

            // Throttle gates. Every interpretation is a real request in the
            // interpreter tab, so these are required, not an optimisation.
            MIN_INTERPRET_INTERVAL_MS: 45_000,
            MIN_NEW_CHARS: 400,

            // How much conversation the interpreter sees per call.
            RECENT_TURN_WINDOW: 6,
            MAX_CONTEXT_CHARS: 12_000,

            // Checkpoint history cap before thinning.
            MAX_CHECKPOINTS: 50,
        },
    };

    window.CGPT_NAV.C = C;
})();
