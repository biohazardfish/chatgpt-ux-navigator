/**
 * Unit tests for judgeSummaryResponseParser
 */

import {describe, it, expect} from 'bun:test';
import {parseJudgeSummaryResponse, isSummaryParseError} from '../judgeSummaryResponseParser';

describe('parseJudgeSummaryResponse', () => {
    it('parses valid json code block', () => {
        const input = '```json\n{"rolling_summary":"Keep this"}\n```';
        const result = parseJudgeSummaryResponse(input);
        expect(isSummaryParseError(result)).toBe(false);
        if (!isSummaryParseError(result)) {
            expect(result.rolling_summary).toBe('Keep this');
        }
    });

    it('accepts plain text response', () => {
        const result = parseJudgeSummaryResponse('Plain summary text');
        expect(isSummaryParseError(result)).toBe(false);
        if (!isSummaryParseError(result)) {
            expect(result.rolling_summary).toBe('Plain summary text');
        }
    });

    it('fails on extra keys in json', () => {
        const input = '```json\n{"rolling_summary":"Ok","extra":1}\n```';
        const result = parseJudgeSummaryResponse(input);
        expect(isSummaryParseError(result)).toBe(true);
    });

    it('fails on empty rolling_summary', () => {
        const input = '```json\n{"rolling_summary":""}\n```';
        const result = parseJudgeSummaryResponse(input);
        expect(isSummaryParseError(result)).toBe(true);
    });

    it('fails on empty response', () => {
        const result = parseJudgeSummaryResponse('   ');
        expect(isSummaryParseError(result)).toBe(true);
    });
});
