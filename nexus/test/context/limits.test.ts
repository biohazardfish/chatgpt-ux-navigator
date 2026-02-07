import {describe, expect, it} from 'bun:test';

import {truncateLines, TRUNCATION_MARKER} from '../../src/core/context/limits.ts';

describe('truncateLines', () => {
    it('returns lines unchanged when under the limit', () => {
        const lines = ['a', 'b', 'c'];
        expect(truncateLines(lines, 5)).toEqual(['a', 'b', 'c']);
    });

    it('returns lines unchanged when exactly at the limit', () => {
        const lines = ['a', 'b', 'c'];
        expect(truncateLines(lines, 3)).toEqual(['a', 'b', 'c']);
    });

    it('truncates and appends marker when over the limit', () => {
        const lines = ['a', 'b', 'c', 'd', 'e'];
        const result = truncateLines(lines, 3);
        expect(result).toEqual(['a', 'b', TRUNCATION_MARKER]);
        expect(result.length).toBe(3);
    });

    it('returns only the marker when max is 0 and lines is non-empty', () => {
        const lines = ['a', 'b'];
        expect(truncateLines(lines, 0)).toEqual([TRUNCATION_MARKER]);
    });

    it('returns empty array when max is negative', () => {
        expect(truncateLines(['a'], -1)).toEqual([]);
    });

    it('returns empty array for empty input regardless of max', () => {
        expect(truncateLines([], 10)).toEqual([]);
        expect(truncateLines([], 0)).toEqual([]);
    });

    it('handles max of 1 by returning only the marker', () => {
        const lines = ['a', 'b', 'c'];
        expect(truncateLines(lines, 1)).toEqual([TRUNCATION_MARKER]);
    });

    it('handles single line within limit', () => {
        expect(truncateLines(['only'], 1)).toEqual(['only']);
    });

    it('does not mutate the original array', () => {
        const lines = ['a', 'b', 'c', 'd'];
        const copy = [...lines];
        truncateLines(lines, 2);
        expect(lines).toEqual(copy);
    });
});
