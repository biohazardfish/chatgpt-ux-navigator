// extension/content/ledgerStore.js
//
// Persistence for the Conversation State Ledger.
//
// Uses chrome.storage.local rather than the localStorage helper in store.js:
// localStorage is origin-wide and capped around 5MB, and checkpoint history for a
// heavy user would eventually collide with whatever else lives on that origin.
// The "storage" permission is already declared in the manifest.
(() => {
    window.CGPT_NAV = window.CGPT_NAV || {};
    const {C} = window.CGPT_NAV;

    const FIELDS_LIST = [
        'confirmed',
        'assumptions',
        'decisions',
        'rejected',
        'open_questions',
        'branches',
    ];
    const FIELDS_TEXT = ['goal', 'current_focus', 'next'];

    /**
     * @returns {object} a blank ConversationState
     */
    function emptyState() {
        return {
            goal: '',
            current_focus: '',
            confirmed: [],
            assumptions: [],
            decisions: [],
            rejected: [],
            open_questions: [],
            next: '',
            branches: [],
            last_checkpoint: null,
        };
    }

    /**
     * Coerce an arbitrary object into a valid ConversationState.
     * Anything unexpected is dropped rather than trusted -- this runs on data
     * that came back from a chat UI and on records written by older versions.
     * @param {any} raw
     * @returns {object}
     */
    function normalizeState(raw) {
        const out = emptyState();
        if (!raw || typeof raw !== 'object') return out;

        for (const f of FIELDS_TEXT) {
            if (typeof raw[f] === 'string') out[f] = raw[f].trim();
        }

        for (const f of FIELDS_LIST) {
            if (!Array.isArray(raw[f])) continue;
            out[f] = raw[f]
                .filter(v => typeof v === 'string')
                .map(v => v.trim())
                .filter(Boolean);
        }

        if (typeof raw.last_checkpoint === 'string') out.last_checkpoint = raw.last_checkpoint;

        return out;
    }

    /**
     * @param {string} conversationKey
     * @returns {object} a blank persisted record
     */
    function emptyRecord(conversationKey) {
        return {
            version: C.LEDGER.SCHEMA_VERSION,
            conversationKey,
            state: emptyState(),
            checkpoints: [],
            updatedAt: null,
        };
    }

    /**
     * Thin a checkpoint list down to `max` entries.
     *
     * Keeps the most recent half verbatim (that is what a Resume view reads) and
     * evenly samples the older half, always retaining the very first checkpoint so
     * the origin of the conversation is never lost.
     *
     * Pure and deterministic.
     * @param {Array<object>} list
     * @param {number} max
     * @returns {Array<object>}
     */
    function pruneCheckpoints(list, max) {
        const items = Array.isArray(list) ? list : [];
        const cap = Number.isFinite(max) && max > 1 ? Math.floor(max) : 1;

        if (items.length <= cap) return items.slice();

        const recentCount = Math.floor(cap / 2);
        const budget = cap - recentCount;

        const recent = recentCount > 0 ? items.slice(items.length - recentCount) : [];
        const head = items.slice(0, items.length - recentCount);

        if (budget <= 0) return recent;
        if (head.length <= budget) return head.concat(recent);

        const picked = [];
        const seen = new Set();
        const lastIdx = head.length - 1;

        for (let i = 0; i < budget; i++) {
            const idx = budget === 1 ? 0 : Math.round((i * lastIdx) / (budget - 1));
            if (seen.has(idx)) continue;
            seen.add(idx);
            picked.push(head[idx]);
        }

        return picked.concat(recent);
    }

    function storageKey(conversationKey) {
        return `${C.LEDGER.STORAGE_PREFIX}${conversationKey}`;
    }

    /**
     * @param {string} conversationKey
     * @returns {Promise<object>} the stored record, or a blank one
     */
    async function load(conversationKey) {
        const k = storageKey(conversationKey);
        try {
            const data = await chrome.storage.local.get(k);
            const rec = data?.[k];
            if (!rec || typeof rec !== 'object') return emptyRecord(conversationKey);

            return {
                version: C.LEDGER.SCHEMA_VERSION,
                conversationKey,
                state: normalizeState(rec.state),
                checkpoints: Array.isArray(rec.checkpoints) ? rec.checkpoints : [],
                updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : null,
            };
        } catch (e) {
            console.debug('[cgpt-nav:ledger] load failed', e);
            return emptyRecord(conversationKey);
        }
    }

    /**
     * @param {string} conversationKey
     * @param {object} record
     * @returns {Promise<boolean>} false when the write was rejected (e.g. quota)
     */
    async function save(conversationKey, record) {
        const k = storageKey(conversationKey);
        const payload = {
            version: C.LEDGER.SCHEMA_VERSION,
            conversationKey,
            state: normalizeState(record?.state),
            checkpoints: pruneCheckpoints(record?.checkpoints, C.LEDGER.MAX_CHECKPOINTS),
            updatedAt: new Date().toISOString(),
        };

        try {
            await chrome.storage.local.set({[k]: payload});
            return true;
        } catch (e) {
            console.debug('[cgpt-nav:ledger] save failed', e);
            return false;
        }
    }

    async function remove(conversationKey) {
        try {
            await chrome.storage.local.remove(storageKey(conversationKey));
        } catch (e) {
            console.debug('[cgpt-nav:ledger] remove failed', e);
        }
    }

    /**
     * Move a record written before the thread had a URL onto its real key.
     *
     * Mirrors the unresolved-then-merge pattern streamTap.js already uses for
     * image state that arrives before its conversation id is known.
     *
     * Refuses to clobber a destination that already holds real content.
     * @param {string} fromKey
     * @param {string} toKey
     * @returns {Promise<object|null>} the migrated record, or null if nothing moved
     */
    async function migrate(fromKey, toKey) {
        if (!fromKey || !toKey || fromKey === toKey) return null;

        const src = await load(fromKey);
        const hasContent = src.checkpoints.length > 0 || src.state.goal || src.state.current_focus;
        if (!hasContent) {
            await remove(fromKey);
            return null;
        }

        const dst = await load(toKey);
        const dstHasContent = dst.checkpoints.length > 0 || dst.state.goal;
        if (dstHasContent) {
            await remove(fromKey);
            return dst;
        }

        const moved = {...src, conversationKey: toKey};
        await save(toKey, moved);
        await remove(fromKey);
        return moved;
    }

    window.CGPT_NAV.ledgerStore = {
        emptyState,
        emptyRecord,
        normalizeState,
        pruneCheckpoints,
        load,
        save,
        remove,
        migrate,
    };
})();
