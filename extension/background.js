const DEFAULT_SERVER = 'http://localhost:8765';
const STORAGE_KEY_SERVER_URL = 'cgpt_nav_server_url';

function normalizeServerUrl(url) {
    const s = String(url || '').trim();
    if (!s) return DEFAULT_SERVER;
    // Remove trailing slashes to avoid double-slash joins
    return s.replace(/\/+$/, '');
}

let serverUrlCache = null;

async function getServerUrl() {
    if (serverUrlCache) return serverUrlCache;

    const data = await chrome.storage.sync.get({[STORAGE_KEY_SERVER_URL]: DEFAULT_SERVER});
    serverUrlCache = normalizeServerUrl(data[STORAGE_KEY_SERVER_URL]);
    return serverUrlCache;
}

// Keep cache in sync if user changes options
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    if (changes[STORAGE_KEY_SERVER_URL]) {
        serverUrlCache = normalizeServerUrl(changes[STORAGE_KEY_SERVER_URL].newValue);
    }
});

const handlers = {
    'cgpt-nav-fetch-list': async () => {
        const server = await getServerUrl();
        const r = await fetch(`${server}/list`, {cache: 'no-store'});
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        const data = await r.json();
        return {ok: true, prompts: data?.prompts || []};
    },

    'cgpt-nav-fetch-prompt': async msg => {
        const filename = msg?.filename;
        if (!filename || typeof filename !== 'string') throw new Error('Missing filename');

        const server = await getServerUrl();
        const r = await fetch(`${server}/prompt/${encodeURIComponent(filename)}`, {
            cache: 'no-store',
        });
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);

        const data = await r.json();
        if (!data || !Array.isArray(data.threadMessages)) {
            throw new Error('Invalid threadMessages payload');
        }

        return {ok: true, threadMessages: data.threadMessages};
    },

    'cgpt-nav-save-response': async msg => {
        const {filename, response} = msg || {};
        if (!filename || typeof response !== 'string') {
            throw new Error('Missing filename or response');
        }

        const server = await getServerUrl();
        const r = await fetch(`${server}/prompt/${encodeURIComponent(filename)}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({response}),
        });

        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        return {ok: true};
    },

    // Conversation State Ledger: ask the dedicated State Interpreter tab to read
    // the current ledger + recent turns and return structured state.
    //
    // Always uses /new so each interpretation is self-contained: the ledger is the
    // state, so the interpreter never needs to remember anything between calls.
    // That avoids drift and context-limit failures on long-lived conversations.
    'cgpt-nav-interpret-state': async msg => {
        const {clientId, input} = msg || {};
        if (!clientId || typeof clientId !== 'string') throw new Error('Missing clientId');
        if (!input || typeof input !== 'string') throw new Error('Missing input');

        const server = await getServerUrl();
        const r = await fetch(`${server}/responses/${encodeURIComponent(clientId)}/new`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({input, stream: false}),
        });

        // Distinguish the two states the caller must degrade on, rather than
        // collapsing everything into a generic failure.
        if (r.status === 404) return {ok: false, reason: 'not_connected'};
        if (r.status === 409) return {ok: false, reason: 'busy'};
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);

        const data = await r.json();
        return {ok: true, text: typeof data?.output_text === 'string' ? data.output_text : ''};
    },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        try {
            const fn = handlers[msg?.type];
            if (!fn) return sendResponse({ok: false, error: 'Unknown message type'});
            sendResponse(await fn(msg));
        } catch (e) {
            sendResponse({ok: false, error: String(e?.message || e)});
        }
    })();
    return true;
});
