import {describe, it, expect} from 'bun:test';
import {sanitizeAssistantText} from '../src/http/responses/sanitize';

describe('sanitizeAssistantText', () => {
    it('returns trimmed text when no sentinel marker', () => {
        expect(sanitizeAssistantText('  Hello world  ')).toBe('Hello world');
    });

    it('removes v1 prefix from text', () => {
        expect(sanitizeAssistantText('v1No marker')).toBe('No marker');
    });

    it('removes finished_successfully suffix and v1 prefix', () => {
        const raw = 'v1The rain rehearses on the roof finished_successfully';
        expect(sanitizeAssistantText(raw)).toBe('The rain rehearses on the roof');
    });

    it('removes all occurrences of finished_successfully', () => {
        const raw =
            'search("How about Iphone 16 Pro Max?")finished_successfullyHere\'s the clean answer. finished_successfullyhttps://example.com';
        expect(sanitizeAssistantText(raw)).toBe(
            'search("How about Iphone 16 Pro Max?")Here\'s the clean answer. https://example.com'
        );
    });

    it('returns empty when only marker remains', () => {
        expect(sanitizeAssistantText('  finished_successfully  ')).toBe('');
    });

    it('removes finished_successfully from mid-stream deltas', () => {
        const raw = 'through just fine.finished_successfully';
        expect(sanitizeAssistantText(raw)).toBe('through just fine.');
    });

    it('handles text with both version and marker', () => {
        const raw =
            'v1Hello! 👋  \nLooks like your `curl` request got through successfully.finished_successfully';
        expect(sanitizeAssistantText(raw)).toBe(
            'Hello! 👋  \nLooks like your `curl` request got through successfully.'
        );
    });

    it('removes multiple occurrences of finished_successfully', () => {
        const raw = 'finished_successfullyHello finished_successfully World';
        expect(sanitizeAssistantText(raw)).toBe('Hello  World');
    });

    it('removes leading thought preamble with a second', () => {
        const raw = 'Thought for a second\nThe answer starts here.';
        expect(sanitizeAssistantText(raw)).toBe('The answer starts here.');
    });

    it('removes leading thought preamble with a couple of seconds', () => {
        const raw = 'Thought for a couple of seconds\nThe answer starts here.';
        expect(sanitizeAssistantText(raw)).toBe('The answer starts here.');
    });

    it('removes leading thought preamble with punctuation', () => {
        const raw = 'Thought for 3 seconds: The answer starts here.';
        expect(sanitizeAssistantText(raw)).toBe('The answer starts here.');
    });

    it('does not remove thought text when not at start', () => {
        const raw = 'The model said: Thought for a second before replying.';
        expect(sanitizeAssistantText(raw)).toBe(
            'The model said: Thought for a second before replying.'
        );
    });
});
