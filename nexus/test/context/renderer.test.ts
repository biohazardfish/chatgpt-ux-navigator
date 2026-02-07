import {describe, expect, it} from 'bun:test';

import {renderPromptContext} from '../../src/core/context/renderer.ts';
import {MAX_TOTAL_CONTEXT_LINES, TRUNCATION_MARKER} from '../../src/core/context/limits.ts';
import type {PromptContext} from '../../src/core/context/types.ts';

function makeContext(overrides?: Partial<PromptContext>): PromptContext {
    return {
        taskObjective: 'Build the feature',
        goals: ['Goal A', 'Goal B'],
        planExcerpt: ['Status: approved', 'Phase 1', 'Phase 2'],
        constraints: [],
        notes: [],
        ...overrides,
    };
}

describe('renderPromptContext', () => {
    it('renders all required sections in correct order', () => {
        const ctx = makeContext();
        const output = renderPromptContext(ctx);
        const lines = output.split('\n');

        expect(lines[0]).toBe('PROJECT CONTEXT');
        expect(output).toContain('TASK OBJECTIVE:');
        expect(output).toContain('Build the feature');
        expect(output).toContain('GOALS:');
        expect(output).toContain('- Goal A');
        expect(output).toContain('- Goal B');
        expect(output).toContain('PLAN (approved):');
        expect(output).toContain('- Phase 1');
        expect(output).toContain('- Phase 2');
    });

    it('omits CONSTRAINTS section when empty', () => {
        const ctx = makeContext({constraints: []});
        const output = renderPromptContext(ctx);

        expect(output).not.toContain('CONSTRAINTS:');
    });

    it('includes CONSTRAINTS section when non-empty', () => {
        const ctx = makeContext({constraints: ['No external deps', 'Budget limit']});
        const output = renderPromptContext(ctx);

        expect(output).toContain('CONSTRAINTS:');
        expect(output).toContain('- No external deps');
        expect(output).toContain('- Budget limit');
    });

    it('omits NOTES section when empty', () => {
        const ctx = makeContext({notes: []});
        const output = renderPromptContext(ctx);

        expect(output).not.toContain('NOTES:');
    });

    it('includes NOTES section when non-empty', () => {
        const ctx = makeContext({notes: ['Assume X', 'Clarify Y']});
        const output = renderPromptContext(ctx);

        expect(output).toContain('NOTES:');
        expect(output).toContain('- Assume X');
        expect(output).toContain('- Clarify Y');
    });

    it('preserves truncation marker in notes without bullet prefix', () => {
        const ctx = makeContext({notes: ['Note 1', TRUNCATION_MARKER]});
        const output = renderPromptContext(ctx);

        expect(output).toContain('- Note 1');
        expect(output).toContain(TRUNCATION_MARKER);
        expect(output).not.toContain(`- ${TRUNCATION_MARKER}`);
    });

    it('extracts plan status from planExcerpt correctly', () => {
        const ctx = makeContext({
            planExcerpt: ['Status: draft', 'Alpha', 'Beta'],
        });
        const output = renderPromptContext(ctx);

        expect(output).toContain('PLAN (draft):');
        expect(output).toContain('- Alpha');
        expect(output).toContain('- Beta');
    });

    it('shows "unknown" status when planExcerpt format is unexpected', () => {
        const ctx = makeContext({
            planExcerpt: ['something unexpected'],
        });
        const output = renderPromptContext(ctx);

        expect(output).toContain('PLAN (unknown):');
    });

    it('produces deterministic output for identical input', () => {
        const ctx = makeContext({
            constraints: ['C1'],
            notes: ['N1', 'N2'],
        });

        const output1 = renderPromptContext(ctx);
        const output2 = renderPromptContext(ctx);

        expect(output1).toBe(output2);
    });

    it('truncates total output when exceeding MAX_TOTAL_CONTEXT_LINES', () => {
        const manyPhases = Array.from({length: 120}, (_, i) => `Phase ${i + 1}`);
        const ctx = makeContext({
            planExcerpt: ['Status: approved', ...manyPhases],
        });
        const output = renderPromptContext(ctx);
        const lines = output.split('\n');

        expect(lines.length).toBe(MAX_TOTAL_CONTEXT_LINES);
        expect(lines[lines.length - 1]).toBe(TRUNCATION_MARKER);
    });

    it('does not truncate when exactly at MAX_TOTAL_CONTEXT_LINES', () => {
        // Build a context that produces exactly MAX_TOTAL_CONTEXT_LINES lines.
        // Base structure without optional sections:
        // Line 1: PROJECT CONTEXT
        // Line 2: (blank)
        // Line 3: TASK OBJECTIVE:
        // Line 4: <objective>
        // Line 5: (blank)
        // Line 6: GOALS:
        // Line 7: - Goal A
        // Line 8: (blank)
        // Line 9: PLAN (approved):
        // Lines 10..N: - Phase X
        // That's 9 fixed lines + phase count.
        // To hit exactly MAX_TOTAL_CONTEXT_LINES, we need (MAX_TOTAL_CONTEXT_LINES - 9) phases.
        const phaseCount = MAX_TOTAL_CONTEXT_LINES - 9;
        const phases = Array.from({length: phaseCount}, (_, i) => `Phase ${i + 1}`);
        const ctx = makeContext({
            goals: ['Goal A'],
            planExcerpt: ['Status: approved', ...phases],
            constraints: [],
            notes: [],
        });
        const output = renderPromptContext(ctx);
        const lines = output.split('\n');

        expect(lines.length).toBe(MAX_TOTAL_CONTEXT_LINES);
        expect(lines[lines.length - 1]).not.toBe(TRUNCATION_MARKER);
    });

    it('output is diff-friendly (no trailing whitespace on lines)', () => {
        const ctx = makeContext({
            constraints: ['C1'],
            notes: ['N1'],
        });
        const output = renderPromptContext(ctx);
        const lines = output.split('\n');

        for (const line of lines) {
            expect(line).toBe(line.trimEnd());
        }
    });
});
