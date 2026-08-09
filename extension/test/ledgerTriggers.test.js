import {describe, expect, test} from 'bun:test';
const {loadModule} = require('./helpers.js');

const {ledgerTriggers, ledgerStore} = (() => {
    loadModule('ledgerStore.js');
    return loadModule('ledgerTriggers.js');
})();

const {detectCandidate, overlapRatio, tokenize} = ledgerTriggers;

const BASE = {
    state: {...ledgerStore.emptyState(), goal: 'build the state ledger'},
    newChars: 1000,
    msSinceLast: 10 * 60 * 1000,
};

describe('tokenize', () => {
    test('extracts latin words of length 3+', () => {
        const t = tokenize('use the ledger');
        expect(t.has('use')).toBe(true);
        expect(t.has('ledger')).toBe(true);
    });

    test('splits CJK into bigrams since it has no word breaks', () => {
        const t = tokenize('狀態總結');
        expect(t.has('狀態')).toBe(true);
        expect(t.has('態總')).toBe(true);
        expect(t.has('總結')).toBe(true);
    });
});

describe('overlapRatio', () => {
    test('is 1 when there is nothing to compare', () => {
        expect(overlapRatio('', 'anything')).toBe(1);
        expect(overlapRatio('anything', '')).toBe(1);
    });

    test('is high for related text', () => {
        expect(overlapRatio('build the state ledger', 'the ledger state')).toBeGreaterThan(0.5);
    });

    test('is low for unrelated text', () => {
        expect(overlapRatio('build the state ledger', 'pasta recipes tonight')).toBeLessThan(0.2);
    });
});

describe('detectCandidate', () => {
    test('stays quiet on small talk', () => {
        const out = detectCandidate({...BASE, userText: 'ok thanks', assistantText: 'sure'});
        expect(out.candidate).toBe(false);
        expect(out.reasons).toEqual([]);
    });

    test('flags English decision language', () => {
        const out = detectCandidate({...BASE, userText: "let's go with option B"});
        expect(out.reasons).toContain('decision_language');
        expect(out.candidate).toBe(true);
    });

    test('flags Cantonese decision language', () => {
        const out = detectCandidate({...BASE, userText: '好,就用第二個方案,決定咗'});
        expect(out.reasons).toContain('decision_language');
    });

    test('flags rejection in both languages', () => {
        expect(detectCandidate({...BASE, userText: 'scrap that approach'}).reasons).toContain(
            'rejection_language'
        );
        expect(detectCandidate({...BASE, userText: '呢個方法唔用喇'}).reasons).toContain(
            'rejection_language'
        );
    });

    test('flags confirmation language', () => {
        expect(detectCandidate({...BASE, assistantText: 'that works now'}).reasons).toContain(
            'confirmation_language'
        );
        expect(detectCandidate({...BASE, userText: '搞掂喇'}).reasons).toContain(
            'confirmation_language'
        );
    });

    test('flags a new code block', () => {
        const out = detectCandidate({...BASE, userText: 'here', hasNewCode: true});
        expect(out.reasons).toContain('new_code_block');
    });

    test('flags a possible branch when the turn drifts from the goal', () => {
        const out = detectCandidate({
            ...BASE,
            userText: 'completely unrelated now, what pasta should I cook for dinner tonight',
        });
        expect(out.reasons).toContain('possible_drift');
    });

    test('does not flag drift for a short acknowledgement', () => {
        const out = detectCandidate({...BASE, userText: 'yes'});
        expect(out.reasons).not.toContain('possible_drift');
    });

    test('flags the opening turn when no state exists yet', () => {
        const out = detectCandidate({
            ...BASE,
            state: ledgerStore.emptyState(),
            userText: 'help me design something',
        });
        expect(out.reasons).toContain('no_state_yet');
    });

    test('throttles when too little new content has accumulated', () => {
        const out = detectCandidate({...BASE, userText: "let's go with B", newChars: 10});
        expect(out.throttled).toBe(true);
        expect(out.candidate).toBe(false);
    });

    test('throttles when the last interpretation was too recent', () => {
        const out = detectCandidate({...BASE, userText: "let's go with B", msSinceLast: 1000});
        expect(out.throttled).toBe(true);
        expect(out.candidate).toBe(false);
    });

    test('reports reasons even while throttled, so callers can see why', () => {
        const out = detectCandidate({...BASE, userText: "let's go with B", msSinceLast: 1000});
        expect(out.reasons).toContain('decision_language');
    });

    test('respects limit overrides', () => {
        const out = detectCandidate({
            ...BASE,
            userText: "let's go with B",
            newChars: 10,
            limits: {minNewChars: 5, minIntervalMs: 0},
        });
        expect(out.candidate).toBe(true);
    });
});
