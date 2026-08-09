// extension/content/ledgerState.js
//
// Orchestration for the Conversation State Ledger.
//
// Holds the in-memory ConversationState for the active thread, decides when to ask
// the State Interpreter, applies results, writes timestamped checkpoints and
// persists everything. The main conversation tab is only ever read.
(() => {
    window.CGPT_NAV = window.CGPT_NAV || {};
    const {C, model, markdown, conversationId, ledgerStore, ledgerTriggers, stateInterpreter} =
        window.CGPT_NAV;

    /** @type {string|null} */
    let currentKey = null;
    /** @type {object} */
    let record = ledgerStore.emptyRecord(C.LEDGER.PENDING_KEY);

    let charsAtLastInterpretation = 0;
    let lastInterpretationAt = 0;
    let status = 'idle'; // idle | interpreting | local_only | error
    let statusDetail = '';

    /** @type {Set<Function>} */
    const subscribers = new Set();

    function notify() {
        for (const cb of subscribers) {
            try {
                cb(getSnapshot());
            } catch (e) {
                console.debug('[cgpt-nav:ledger] subscriber failed', e);
            }
        }
    }

    function setStatus(next, detail = '') {
        if (status === next && statusDetail === detail) return;
        status = next;
        statusDetail = detail;
        notify();
    }

    function getSnapshot() {
        return {
            conversationKey: currentKey,
            state: record.state,
            checkpoints: record.checkpoints,
            status,
            statusDetail,
            updatedAt: record.updatedAt,
        };
    }

    function subscribe(cb) {
        if (typeof cb === 'function') subscribers.add(cb);
        return () => subscribers.delete(cb);
    }

    // ----------------------------
    // Interpreter client id
    // ----------------------------

    async function getInterpreterClientId() {
        try {
            const key = C.LEDGER.STORAGE_KEY_INTERPRETER_ID;
            const data = await chrome.storage.sync.get({[key]: ''});
            return String(data?.[key] || '').trim();
        } catch {
            return '';
        }
    }

    async function setInterpreterClientId(value) {
        try {
            await chrome.storage.sync.set({
                [C.LEDGER.STORAGE_KEY_INTERPRETER_ID]: String(value || '').trim(),
            });
            notify();
        } catch (e) {
            console.debug('[cgpt-nav:ledger] could not persist interpreter id', e);
        }
    }

    // ----------------------------
    // Conversation content
    // ----------------------------

    /**
     * Total characters currently rendered in the thread.
     * Used only as a "how much is new" signal, so approximation is fine.
     */
    function totalChars() {
        const {entryById, order} = model.getState();
        let sum = 0;
        for (const id of order) {
            const entry = entryById.get(id);
            const node = entry?.roleNode;
            if (node && typeof node.textContent === 'string') sum += node.textContent.length;
        }
        return sum;
    }

    /**
     * The most recent turns as markdown, for the interpreter.
     * @returns {Array<{role:string, text:string}>}
     */
    function recentTurns() {
        const entries = model.getRecentEntries(C.LEDGER.RECENT_TURN_WINDOW);
        const out = [];

        for (const entry of entries) {
            if (!entry?.roleNode) continue;
            let text = '';
            try {
                text = markdown.getMessageMarkdown(entry.roleNode);
            } catch {
                text = entry.preview || '';
            }
            if (text) out.push({role: entry.role, text});
        }

        return out;
    }

    function lastTextByRole() {
        const entries = model.getRecentEntries(C.LEDGER.RECENT_TURN_WINDOW);
        let userText = '';
        let assistantText = '';

        for (const entry of entries) {
            if (entry.role === 'user') userText = entry.preview || '';
            else if (entry.role === 'assistant') assistantText = entry.preview || '';
        }

        return {userText, assistantText};
    }

    function hasNewCodeBlock() {
        const entries = model.getRecentEntries(2);
        return entries.some(e => Array.isArray(e.codeIds) && e.codeIds.length > 0);
    }

    // ----------------------------
    // Checkpoints
    // ----------------------------

    function makeCheckpoint(state, trigger, reason) {
        const at = new Date().toISOString();
        return {
            id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            at,
            trigger,
            reason: reason || '',
            state: {
                goal: state.goal,
                current_focus: state.current_focus,
                confirmed: state.confirmed.slice(),
                assumptions: state.assumptions.slice(),
                decisions: state.decisions.slice(),
                rejected: state.rejected.slice(),
                open_questions: state.open_questions.slice(),
                next: state.next,
                branches: state.branches.slice(),
            },
        };
    }

    async function commit(nextState, trigger, reason) {
        const checkpoint = makeCheckpoint(nextState, trigger, reason);

        record.state = {...nextState, last_checkpoint: checkpoint.at};
        record.checkpoints = ledgerStore.pruneCheckpoints(
            record.checkpoints.concat([checkpoint]),
            C.LEDGER.MAX_CHECKPOINTS
        );

        await ledgerStore.save(currentKey, record);
        record.updatedAt = new Date().toISOString();
        notify();

        return checkpoint;
    }

    // ----------------------------
    // Interpretation
    // ----------------------------

    async function runInterpretation(reasons, trigger) {
        const clientId = await getInterpreterClientId();
        if (!clientId) {
            setStatus('local_only', 'No interpreter client ID set');
            return {ok: false, reason: 'no_client_id'};
        }

        setStatus('interpreting');

        const resp = await stateInterpreter.interpret({
            clientId,
            state: record.state,
            recentTurns: recentTurns(),
            reasons,
        });

        // Count the attempt regardless of outcome: a failing interpreter tab must
        // not turn into a retry loop against the user's quota.
        lastInterpretationAt = Date.now();
        charsAtLastInterpretation = totalChars();

        if (!resp.ok) {
            if (resp.reason === 'not_connected') {
                setStatus('local_only', 'Interpreter tab not connected');
            } else if (resp.reason === 'busy') {
                setStatus('idle');
            } else {
                setStatus('error', resp.reason || 'Interpretation failed');
            }
            return resp;
        }

        const {result} = resp;

        if (!result.state_changed) {
            setStatus('idle', 'No state change');
            return {ok: true, changed: false};
        }

        await commit(result.state, trigger, result.change_reason);
        setStatus('idle');
        return {ok: true, changed: true};
    }

    /**
     * Called when the conversation has gone quiet after a turn.
     */
    async function handleTurnSettled() {
        if (!currentKey) return;
        if (stateInterpreter.isBusy()) return;

        const chars = totalChars();
        const newChars = Math.max(0, chars - charsAtLastInterpretation);
        const msSinceLast =
            lastInterpretationAt === 0 ? Infinity : Date.now() - lastInterpretationAt;
        const {userText, assistantText} = lastTextByRole();

        const verdict = ledgerTriggers.detectCandidate({
            userText,
            assistantText,
            state: record.state,
            newChars,
            msSinceLast,
            hasNewCode: hasNewCodeBlock(),
        });

        if (!verdict.candidate) return;

        await runInterpretation(verdict.reasons, 'auto');
    }

    /**
     * Manual checkpoint. Always available.
     *
     * Asks the interpreter first so the checkpoint reflects current reality, but
     * falls back to snapshotting the existing ledger when no interpreter tab is
     * reachable -- a manual request must never silently do nothing.
     */
    async function createManualCheckpoint() {
        if (!currentKey) return null;

        const resp = await runInterpretation(['manual'], 'manual');
        if (resp.ok && resp.changed) return getSnapshot();

        // Interpreter unavailable or reported no change: still record the moment.
        await commit(
            record.state,
            'manual',
            resp.ok ? 'Manual checkpoint (no state change)' : 'Manual checkpoint (local only)'
        );
        return getSnapshot();
    }

    // ----------------------------
    // Lifecycle
    // ----------------------------

    async function loadKey(key) {
        currentKey = key;
        record = await ledgerStore.load(key);
        charsAtLastInterpretation = totalChars();
        lastInterpretationAt = 0;
        notify();
    }

    /**
     * Switch to a different thread.
     *
     * A chat that started before ChatGPT assigned it a URL is migrated off the
     * pending key, mirroring the unresolved-id merge streamTap already does for
     * image state.
     */
    async function switchConversation(nextKey, prevKey) {
        if (prevKey && conversationId.isPending(prevKey) && !conversationId.isPending(nextKey)) {
            const migrated = await ledgerStore.migrate(prevKey, nextKey);
            if (migrated) {
                currentKey = nextKey;
                record = migrated;
                charsAtLastInterpretation = totalChars();
                notify();
                return;
            }
        }

        await loadKey(nextKey);
    }

    async function init() {
        await loadKey(conversationId.getConversationKey());

        const clientId = await getInterpreterClientId();
        if (!clientId) setStatus('local_only', 'No interpreter client ID set');
    }

    window.CGPT_NAV.ledgerState = {
        init,
        subscribe,
        getSnapshot,
        handleTurnSettled,
        createManualCheckpoint,
        switchConversation,
        getInterpreterClientId,
        setInterpreterClientId,
    };
})();
