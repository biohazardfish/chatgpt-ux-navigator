import {describe, expect, test} from 'bun:test';
const {loadModule} = require('./helpers.js');

const {stateInterpreter} = (() => {
    loadModule('ledgerStore.js');
    return loadModule('stateInterpreter.js');
})();

const {
    parseInterpreterResponse,
    extractJsonCandidates,
    escapeIncludeLines,
    fitTurns,
    buildInterpreterPrompt,
} = stateInterpreter;

const VALID = {
    goal: 'ship the ledger',
    current_focus: 'parsing interpreter output',
    confirmed: ['no API key is required'],
    assumptions: [],
    decisions: ['use a secondary tab'],
    rejected: ['fixed 10-turn cadence'],
    open_questions: ['how to detect turn completion'],
    next: 'wire the observer settle detector',
    branches: [],
    state_changed: true,
    change_reason: 'a decision was made',
};

describe('escapeIncludeLines', () => {
    // server/src/prompts/resolveIncludes.ts turns a line that is nothing but
    // "@path" into that file's contents before the prompt reaches the tab.
    test('neutralises a bare @path line', () => {
        const out = escapeIncludeLines('talking about\n@repo/server\nand more');
        expect(out).toBe('talking about\n`@repo/server`\nand more');
    });

    test('neutralises the @@ directory form', () => {
        expect(escapeIncludeLines('@@./src')).toBe('`@@./src`');
    });

    test('preserves leading whitespace', () => {
        expect(escapeIncludeLines('   @./a.ts')).toBe('   `@./a.ts`');
    });

    test('leaves @ mentions inside a sentence alone', () => {
        const line = 'the @repo/server workspace handles this';
        expect(escapeIncludeLines(line)).toBe(line);
    });

    test('leaves ordinary text alone', () => {
        expect(escapeIncludeLines('nothing to escape')).toBe('nothing to escape');
    });
});

describe('extractJsonCandidates', () => {
    test('finds a fenced json block', () => {
        const out = extractJsonCandidates('prose\n```json\n{"a":1}\n```\nmore');
        expect(out[0]).toBe('{"a":1}');
    });

    test('finds a bare object when there is no fence', () => {
        expect(extractJsonCandidates('here you go {"a":1} done')).toContain('{"a":1}');
    });

    test('handles braces inside strings', () => {
        const out = extractJsonCandidates('{"a":"not } a brace"}');
        expect(out).toContain('{"a":"not } a brace"}');
    });

    test('handles escaped quotes inside strings', () => {
        const out = extractJsonCandidates('{"a":"say \\" then }"}');
        expect(JSON.parse(out[0]).a).toBe('say " then }');
    });
});

describe('parseInterpreterResponse', () => {
    test('parses a clean fenced reply', () => {
        const out = parseInterpreterResponse('```json\n' + JSON.stringify(VALID) + '\n```');
        expect(out.state_changed).toBe(true);
        expect(out.state.goal).toBe('ship the ledger');
        expect(out.state.decisions).toEqual(['use a secondary tab']);
        expect(out.change_reason).toBe('a decision was made');
    });

    test('survives the prose preamble a chat UI adds', () => {
        const reply =
            "Sure! Here's the updated state for that conversation:\n\n```json\n" +
            JSON.stringify(VALID) +
            '\n```\n\nLet me know if you want changes.';
        expect(parseInterpreterResponse(reply).state.goal).toBe('ship the ledger');
    });

    test('parses an unfenced object', () => {
        expect(parseInterpreterResponse(JSON.stringify(VALID)).state.next).toBe(
            'wire the observer settle detector'
        );
    });

    test('coerces a stringified boolean', () => {
        const reply = JSON.stringify({...VALID, state_changed: 'false'});
        expect(parseInterpreterResponse(reply).state_changed).toBe(false);
    });

    test('treats a missing state_changed as no change', () => {
        const {state_changed, ...rest} = VALID;
        expect(parseInterpreterResponse(JSON.stringify(rest)).state_changed).toBe(false);
    });

    // A null return must be read by callers as "no change" -- never as a reason
    // to overwrite the ledger with an empty state.
    test('returns null for a reply with no JSON at all', () => {
        expect(parseInterpreterResponse('I am not sure what you mean.')).toBeNull();
    });

    test('returns null for malformed JSON', () => {
        expect(parseInterpreterResponse('```json\n{"goal": unquoted}\n```')).toBeNull();
    });

    test('returns null for an unrelated object', () => {
        expect(parseInterpreterResponse('{"weather":"sunny"}')).toBeNull();
    });

    test('returns null for empty input', () => {
        expect(parseInterpreterResponse('')).toBeNull();
        expect(parseInterpreterResponse(null)).toBeNull();
    });

    test('skips an unrelated object and takes the real one', () => {
        const reply = `{"weather":"sunny"}\n\n\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\``;
        expect(parseInterpreterResponse(reply).state.goal).toBe('ship the ledger');
    });

    test('drops fields the interpreter invented', () => {
        const reply = JSON.stringify({...VALID, injected: 'should not survive'});
        expect(parseInterpreterResponse(reply).state.injected).toBeUndefined();
    });
});

describe('fitTurns', () => {
    const turns = [
        {role: 'user', text: 'a'.repeat(100)},
        {role: 'assistant', text: 'b'.repeat(100)},
        {role: 'user', text: 'c'.repeat(100)},
    ];

    test('keeps everything when it fits', () => {
        expect(fitTurns(turns, 10_000)).toHaveLength(3);
    });

    test('drops the oldest turns when over budget', () => {
        const out = fitTurns(turns, 250);
        expect(out).toHaveLength(2);
        expect(out[out.length - 1].text[0]).toBe('c');
    });

    test('always keeps at least the most recent turn', () => {
        const out = fitTurns(turns, 1);
        expect(out).toHaveLength(1);
        expect(out[0].text[0]).toBe('c');
    });

    test('tolerates junk', () => {
        expect(fitTurns(null, 100)).toEqual([]);
    });
});

describe('buildInterpreterPrompt', () => {
    const state = {
        goal: 'g',
        current_focus: 'f',
        confirmed: [],
        assumptions: [],
        decisions: [],
        rejected: [],
        open_questions: [],
        next: 'n',
        branches: [],
    };

    test('carries the whole ledger so the call is self-contained', () => {
        const p = buildInterpreterPrompt(state, [{role: 'user', text: 'hi'}], ['manual']);
        expect(p).toContain('"goal": "g"');
        expect(p).toContain('CURRENT STATE LEDGER');
        expect(p).toContain('RECENT CONVERSATION TURNS');
    });

    test('escapes include-style lines coming from the conversation', () => {
        const p = buildInterpreterPrompt(state, [{role: 'user', text: '@./secrets.env'}], []);
        expect(p).not.toMatch(/^\s*@\.\/secrets\.env\s*$/m);
        expect(p).toContain('`@./secrets.env`');
    });
});
