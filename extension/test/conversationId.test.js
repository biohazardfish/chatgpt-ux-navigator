import {describe, expect, test} from 'bun:test';
const {loadModule} = require('./helpers.js');

const {conversationId, C} = loadModule('conversationId.js');
const {extractConversationKey} = conversationId;

describe('extractConversationKey', () => {
    test('pulls the uuid out of a thread URL', () => {
        expect(extractConversationKey('/c/68f0a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b')).toBe(
            '68f0a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b'
        );
    });

    test('lowercases the key so it is stable', () => {
        expect(extractConversationKey('/c/68F0A1B2-C3D4-4E5F-8A9B-0C1D2E3F4A5B')).toBe(
            '68f0a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b'
        );
    });

    test('ignores trailing path segments', () => {
        expect(extractConversationKey('/c/68f0a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b/something')).toBe(
            '68f0a1b2-c3d4-4e5f-8a9b-0c1d2e3f4a5b'
        );
    });

    test('a fresh chat with no URL yet maps to the pending key', () => {
        expect(extractConversationKey('/')).toBe(C.LEDGER.PENDING_KEY);
        expect(extractConversationKey('')).toBe(C.LEDGER.PENDING_KEY);
        expect(extractConversationKey('/gpts')).toBe(C.LEDGER.PENDING_KEY);
    });

    test('does not treat a short fragment as a conversation id', () => {
        expect(extractConversationKey('/c/abc')).toBe(C.LEDGER.PENDING_KEY);
    });
});
