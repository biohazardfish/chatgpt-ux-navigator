// extension/content/ledgerTriggers.js
//
// Cheap, local candidate detection for the Conversation State Ledger.
//
// This module answers exactly one question: "is it worth asking the State
// Interpreter to look at this?" It deliberately does NOT try to work out what the
// conversation state is -- that is the interpreter's job.
//
// Bias: recall over precision. These conversations are mixed Chinese/English, so
// keyword heuristics are inherently unreliable; pretending otherwise would silently
// miss real transitions. Over-triggering is filtered by the interpreter returning
// state_changed:false, which is why the throttle below is a requirement and not an
// optimisation -- every call that gets past it costs a real request.
(() => {
    window.CGPT_NAV = window.CGPT_NAV || {};

    // Deliberately broad. A hit means "maybe", never "yes".
    const CUES = {
        decision: [
            'let us go with',
            "let's go with",
            'we will use',
            "we'll use",
            'i will use',
            'decided',
            'decision',
            'go ahead with',
            'settle on',
            'final answer',
            'choose',
            'chosen',
            '決定',
            '就用',
            '揀',
            '選擇',
            '拍板',
            '定咗',
            '就咁',
        ],
        rejection: [
            'not going to',
            "won't work",
            'will not work',
            'scrap',
            'drop that',
            'forget that',
            'instead of',
            'rather than',
            'no longer',
            'reject',
            '唔用',
            '唔要',
            '放棄',
            '取消',
            '算數',
            '唔得',
            '否決',
        ],
        confirmation: [
            'confirmed',
            'that works',
            'it works',
            'verified',
            'resolved',
            'fixed',
            'solved',
            'correct',
            '確認',
            '搞掂',
            '得咗',
            '成功',
            '解決',
            '啱',
            '無問題',
            '冇問題',
        ],
        goalShift: [
            'new topic',
            'change of scope',
            'change of plan',
            'switching to',
            'switch to',
            'actually i want',
            'instead i want',
            'forget the',
            'different question',
            '轉',
            '改為',
            '第二個問題',
            '另一個',
            '重新',
            '改方向',
        ],
        question: [
            'should i',
            'should we',
            'which one',
            'what about',
            'how do i',
            'how should',
            'unclear',
            'not sure',
            '點算',
            '點做',
            '邊個',
            '定係',
            '好唔好',
            '係咪',
            '唔知',
        ],
    };

    const CJK_RE = /[\u3400-\u9fff]/;

    /**
     * Split text into comparable tokens.
     * Latin text splits on word boundaries; CJK has no spaces, so it is split into
     * character bigrams, which is crude but adequate for an overlap ratio.
     * @param {string} text
     * @returns {Set<string>}
     */
    function tokenize(text) {
        const s = String(text || '').toLowerCase();
        const tokens = new Set();

        for (const w of s.match(/[a-z0-9_]{3,}/g) || []) tokens.add(w);

        const cjk = s.match(/[\u3400-\u9fff]+/g) || [];
        for (const run of cjk) {
            if (run.length === 1) {
                tokens.add(run);
                continue;
            }
            for (let i = 0; i < run.length - 1; i++) tokens.add(run.slice(i, i + 2));
        }

        return tokens;
    }

    /**
     * Fraction of `b`'s tokens that also appear in `a`.
     * @param {string} a
     * @param {string} b
     * @returns {number} 0..1, and 1 when there is nothing to compare
     */
    function overlapRatio(a, b) {
        const ta = tokenize(a);
        const tb = tokenize(b);
        if (ta.size === 0 || tb.size === 0) return 1;

        let hits = 0;
        for (const t of tb) if (ta.has(t)) hits++;
        return hits / tb.size;
    }

    /**
     * @param {string} text
     * @param {string[]} cues
     * @returns {boolean}
     */
    function hasCue(text, cues) {
        const s = String(text || '').toLowerCase();
        if (!s) return false;
        return cues.some(c => s.includes(c));
    }

    /**
     * Decide whether this moment is a candidate for semantic interpretation.
     *
     * Pure: all inputs are supplied by the caller, including the clock.
     *
     * @param {object} input
     * @param {string} input.userText       most recent user turn
     * @param {string} input.assistantText  most recent assistant turn
     * @param {object} input.state          current ConversationState
     * @param {number} input.newChars       characters added since last interpretation
     * @param {number} input.msSinceLast    ms since last interpretation (Infinity if never)
     * @param {boolean} [input.hasNewCode]  a new code block appeared this turn
     * @param {object} [input.limits]       overrides for MIN_NEW_CHARS / MIN_INTERPRET_INTERVAL_MS
     * @returns {{candidate: boolean, reasons: string[], throttled: boolean}}
     */
    function detectCandidate(input) {
        const {
            userText = '',
            assistantText = '',
            state = null,
            newChars = 0,
            msSinceLast = Infinity,
            hasNewCode = false,
            limits = {},
        } = input || {};

        const C = window.CGPT_NAV.C;
        const minChars = limits.minNewChars ?? C.LEDGER.MIN_NEW_CHARS;
        const minInterval = limits.minIntervalMs ?? C.LEDGER.MIN_INTERPRET_INTERVAL_MS;

        const reasons = [];
        const combined = `${userText}\n${assistantText}`;

        // No state yet: the first substantive turn establishes the goal.
        const isFirstState = !state || (!state.goal && !state.current_focus);
        if (isFirstState && newChars > 0) reasons.push('no_state_yet');

        if (hasCue(userText, CUES.goalShift)) reasons.push('goal_shift_language');
        if (hasCue(combined, CUES.decision)) reasons.push('decision_language');
        if (hasCue(combined, CUES.rejection)) reasons.push('rejection_language');
        if (hasCue(combined, CUES.confirmation)) reasons.push('confirmation_language');
        if (hasCue(userText, CUES.question)) reasons.push('open_question_language');
        if (hasNewCode) reasons.push('new_code_block');

        // Possible branch: the recent turn has drifted away from the stated goal.
        if (state && state.goal && (userText || assistantText)) {
            const ratio = overlapRatio(`${state.goal} ${state.current_focus}`, userText);
            const meaningful = CJK_RE.test(userText)
                ? userText.length >= 12
                : userText.length >= 40;
            if (meaningful && ratio < 0.15) reasons.push('possible_drift');
        }

        // Enough new material has accumulated that the state is probably stale.
        if (newChars >= minChars * 3) reasons.push('volume_accumulated');

        if (reasons.length === 0) return {candidate: false, reasons: [], throttled: false};

        // Throttle gates. "no_state_yet" still respects the interval so a burst of
        // opening turns cannot fire repeatedly.
        const throttled = msSinceLast < minInterval || newChars < minChars;
        return {candidate: !throttled, reasons, throttled};
    }

    window.CGPT_NAV.ledgerTriggers = {
        CUES,
        tokenize,
        overlapRatio,
        hasCue,
        detectCandidate,
    };
})();
