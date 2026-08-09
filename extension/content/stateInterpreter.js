// extension/content/stateInterpreter.js
//
// Talks to the dedicated State Interpreter tab.
//
// The main conversation tab is never touched by this module. Everything here goes
// to a separate ChatGPT tab whose client id the user configures in the sidebar.
(() => {
    window.CGPT_NAV = window.CGPT_NAV || {};
    const {C, messaging, ledgerStore} = window.CGPT_NAV;

    // The server resolves lines of the form "@path" / "@@path" into file contents
    // before the prompt reaches the tab (server/src/prompts/resolveIncludes.ts).
    // Conversation text can legitimately contain a line that is nothing but
    // "@repo/server", which would make the server try to read that path.
    const INCLUDE_LINE_RE = /^(\s*)(@@?)(\S+)(\s*)$/;

    /**
     * Neutralise lines that the server would otherwise treat as file includes.
     * Wrapping in backticks breaks the match (the line no longer starts with "@")
     * while staying readable to the interpreter. Pure.
     * @param {string} text
     * @returns {string}
     */
    function escapeIncludeLines(text) {
        return String(text || '')
            .split('\n')
            .map(line => {
                const m = line.match(INCLUDE_LINE_RE);
                if (!m) return line;
                return `${m[1]}\`${m[2]}${m[3]}\``;
            })
            .join('\n');
    }

    /**
     * Trim a transcript window to a character budget, keeping the most recent turns.
     * Pure.
     * @param {Array<{role:string, text:string}>} turns
     * @param {number} maxChars
     * @returns {Array<{role:string, text:string}>}
     */
    function fitTurns(turns, maxChars) {
        const list = Array.isArray(turns) ? turns : [];
        const out = [];
        let used = 0;

        for (let i = list.length - 1; i >= 0; i--) {
            const t = list[i];
            if (!t || typeof t.text !== 'string') continue;
            const cost = t.text.length + 16;
            if (used + cost > maxChars && out.length > 0) break;
            out.unshift(t);
            used += cost;
        }

        return out;
    }

    /**
     * Build the interpreter prompt.
     *
     * Self-contained by design: it carries the entire current ledger, so the
     * interpreter tab needs no memory of previous calls. Pure.
     *
     * @param {object} state current ConversationState
     * @param {Array<{role:string, text:string}>} recentTurns
     * @param {string[]} reasons why this interpretation was triggered
     * @returns {string}
     */
    function buildInterpreterPrompt(state, recentTurns, reasons) {
        const turns = fitTurns(recentTurns, C.LEDGER.MAX_CONTEXT_CHARS);

        const transcript = turns
            .map(t => `### ${t.role === 'user' ? 'USER' : 'ASSISTANT'}\n${t.text}`)
            .join('\n\n');

        const body = [
            'You are a CONVERSATION STATE INTERPRETER. You are not a chat assistant.',
            'You never answer the conversation below; you only describe its current state.',
            '',
            'You are given the current state ledger of a separate conversation, plus its most',
            'recent turns. Decide whether the state has MEANINGFULLY changed, and return the',
            'updated state.',
            '',
            'Rules:',
            '- Maintain CURRENT state, not a chronological summary. Never write "then the user asked...".',
            '- "confirmed" = established facts/conclusions. "assumptions" = believed but unverified.',
            '- "decisions" = choices actually made. "rejected" = options explicitly ruled out.',
            '- "next" = the single most immediate continuation point, written so someone',
            '  returning days later knows what to do first.',
            '- "branches" = topics that have drifted away from the goal. Report them; do not',
            '  suggest redirecting the conversation.',
            '- Set state_changed to false if nothing meaningful changed. Cosmetic rewording is',
            '  NOT a change. Be strict: a false positive creates a useless checkpoint.',
            '- Keep every list item to one short line. Preserve the conversation language.',
            '',
            `Trigger reasons (hints only, may be wrong): ${(reasons || []).join(', ') || 'manual'}`,
            '',
            'CURRENT STATE LEDGER:',
            '```json',
            JSON.stringify(
                {
                    goal: state?.goal || '',
                    current_focus: state?.current_focus || '',
                    confirmed: state?.confirmed || [],
                    assumptions: state?.assumptions || [],
                    decisions: state?.decisions || [],
                    rejected: state?.rejected || [],
                    open_questions: state?.open_questions || [],
                    next: state?.next || '',
                    branches: state?.branches || [],
                },
                null,
                2
            ),
            '```',
            '',
            'RECENT CONVERSATION TURNS:',
            '```text',
            transcript || '(no turns captured)',
            '```',
            '',
            'Reply with ONE fenced json block and nothing else:',
            '```json',
            '{"goal":"","current_focus":"","confirmed":[],"assumptions":[],"decisions":[],',
            ' "rejected":[],"open_questions":[],"next":"","branches":[],',
            ' "state_changed":true,"change_reason":""}',
            '```',
        ].join('\n');

        return escapeIncludeLines(body);
    }

    /**
     * Pull plausible JSON payloads out of a chat reply.
     * A chat UI wraps answers in prose, so fenced blocks are tried first and a
     * brace-balanced scan is the fallback. Pure.
     * @param {string} text
     * @returns {string[]}
     */
    function extractJsonCandidates(text) {
        const s = String(text || '');
        const candidates = [];

        const fenced = s.matchAll(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/g);
        for (const m of fenced) {
            const inner = (m[1] || '').trim();
            if (inner.startsWith('{')) candidates.push(inner);
        }

        let depth = 0;
        let start = -1;
        let inString = false;
        let escaped = false;

        for (let i = 0; i < s.length; i++) {
            const ch = s[i];

            if (inString) {
                if (escaped) escaped = false;
                else if (ch === '\\') escaped = true;
                else if (ch === '"') inString = false;
                continue;
            }

            if (ch === '"') inString = true;
            else if (ch === '{') {
                if (depth === 0) start = i;
                depth++;
            } else if (ch === '}') {
                depth--;
                if (depth === 0 && start >= 0) {
                    candidates.push(s.slice(start, i + 1));
                    start = -1;
                }
            }
        }

        return candidates;
    }

    function coerceBool(v) {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'string') return v.trim().toLowerCase() === 'true';
        return false;
    }

    /**
     * Parse an interpreter reply into a validated result.
     *
     * Returns null when nothing usable came back. Callers must treat null as
     * "no change" -- never as a reason to write an empty ledger. Pure.
     *
     * @param {string} text
     * @returns {{state: object, state_changed: boolean, change_reason: string} | null}
     */
    function parseInterpreterResponse(text) {
        for (const candidate of extractJsonCandidates(text)) {
            let parsed;
            try {
                parsed = JSON.parse(candidate);
            } catch {
                continue;
            }

            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;

            const looksRight =
                'goal' in parsed ||
                'current_focus' in parsed ||
                'state_changed' in parsed ||
                'next' in parsed;
            if (!looksRight) continue;

            return {
                state: ledgerStore.normalizeState(parsed),
                state_changed: coerceBool(parsed.state_changed),
                change_reason:
                    typeof parsed.change_reason === 'string' ? parsed.change_reason.trim() : '',
            };
        }

        return null;
    }

    // Single-slot mutex. The server rejects a second concurrent request for the
    // same client with 409, and queueing stale interpretations has no value -- the
    // next settled turn will trigger a fresh one anyway.
    let inflight = false;

    function isBusy() {
        return inflight;
    }

    /**
     * Ask the interpreter tab for the current state.
     *
     * @param {object} opts
     * @param {string} opts.clientId       interpreter tab's client id
     * @param {object} opts.state          current ConversationState
     * @param {Array<{role:string,text:string}>} opts.recentTurns
     * @param {string[]} opts.reasons
     * @returns {Promise<{ok:boolean, reason?:string, result?:object}>}
     */
    async function interpret({clientId, state, recentTurns, reasons}) {
        if (!clientId) return {ok: false, reason: 'no_client_id'};
        if (inflight) return {ok: false, reason: 'busy'};

        inflight = true;
        try {
            const input = buildInterpreterPrompt(state, recentTurns, reasons);
            const resp = await messaging.sendMessage({
                type: C.MSG.INTERPRET_STATE,
                clientId,
                input,
            });

            if (!resp?.ok) return {ok: false, reason: resp?.reason || resp?.error || 'failed'};

            const result = parseInterpreterResponse(resp.text);
            if (!result) return {ok: false, reason: 'unparseable'};

            return {ok: true, result};
        } catch (e) {
            return {ok: false, reason: String(e?.message || e)};
        } finally {
            inflight = false;
        }
    }

    window.CGPT_NAV.stateInterpreter = {
        escapeIncludeLines,
        fitTurns,
        buildInterpreterPrompt,
        extractJsonCandidates,
        parseInterpreterResponse,
        interpret,
        isBusy,
    };
})();
