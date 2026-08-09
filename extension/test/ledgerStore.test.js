import {describe, expect, test} from 'bun:test';
const {loadModule} = require('./helpers.js');

const {ledgerStore} = loadModule('ledgerStore.js');
const {pruneCheckpoints, normalizeState, emptyState} = ledgerStore;

function makeCheckpoints(n) {
    return Array.from({length: n}, (_, i) => ({id: `cp${i}`, at: `t${i}`}));
}

describe('pruneCheckpoints', () => {
    test('leaves a list under the cap untouched', () => {
        const list = makeCheckpoints(5);
        expect(pruneCheckpoints(list, 10)).toEqual(list);
    });

    test('caps the list at max', () => {
        expect(pruneCheckpoints(makeCheckpoints(200), 50)).toHaveLength(50);
    });

    test('always keeps the very first checkpoint', () => {
        const out = pruneCheckpoints(makeCheckpoints(200), 50);
        expect(out[0].id).toBe('cp0');
    });

    test('keeps the most recent checkpoints verbatim', () => {
        const out = pruneCheckpoints(makeCheckpoints(200), 50);
        expect(out[out.length - 1].id).toBe('cp199');
        expect(out[out.length - 2].id).toBe('cp198');
    });

    test('is deterministic', () => {
        const list = makeCheckpoints(137);
        expect(pruneCheckpoints(list, 50)).toEqual(pruneCheckpoints(list, 50));
    });

    test('never returns duplicates', () => {
        const out = pruneCheckpoints(makeCheckpoints(200), 50);
        expect(new Set(out.map(c => c.id)).size).toBe(out.length);
    });

    test('tolerates junk input', () => {
        expect(pruneCheckpoints(null, 10)).toEqual([]);
        expect(pruneCheckpoints(undefined, 10)).toEqual([]);
    });
});

describe('normalizeState', () => {
    test('returns a blank state for junk', () => {
        expect(normalizeState(null)).toEqual(emptyState());
        expect(normalizeState('nope')).toEqual(emptyState());
        expect(normalizeState(42)).toEqual(emptyState());
    });

    test('keeps recognised fields and trims them', () => {
        const out = normalizeState({
            goal: '  ship the ledger  ',
            current_focus: 'wiring the observer',
            decisions: ['use chrome.storage.local'],
        });
        expect(out.goal).toBe('ship the ledger');
        expect(out.current_focus).toBe('wiring the observer');
        expect(out.decisions).toEqual(['use chrome.storage.local']);
    });

    test('drops non-string list entries rather than trusting them', () => {
        const out = normalizeState({confirmed: ['real', 42, null, {a: 1}, '  ', 'also real']});
        expect(out.confirmed).toEqual(['real', 'also real']);
    });

    test('ignores unknown fields', () => {
        const out = normalizeState({goal: 'x', evil: 'payload'});
        expect(out.evil).toBeUndefined();
    });

    test('coerces a non-array list field to empty', () => {
        expect(normalizeState({decisions: 'not a list'}).decisions).toEqual([]);
    });
});
