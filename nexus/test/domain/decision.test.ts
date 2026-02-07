import {describe, expect, it} from 'bun:test';
import {DomainParseError} from '../../src/core/domain/index.ts';
import {parseDecision} from '../../src/core/parsing/decision.ts';

describe('decision parser', () => {
    it('parses required sections and preserves raw metadata', () => {
        const markdown = [
            'Decision preamble note',
            '',
            '# Decision 002 — Storage Layout',
            '',
            '# Date',
            '2026-02-01',
            '',
            '# Context',
            'We need a persistent, inspectable project state.',
            '',
            'This is the second paragraph.',
            '',
            '# Options Considered',
            '1. JSON-only',
            '2. Markdown-first (chosen)',
            '',
            '# Decision',
            'Use markdown for narrative state, JSON only for metadata.',
            '',
            '# Rationale',
            'Human readability and debuggability outweigh strict schema guarantees.',
            '',
            '# Consequences',
            '- Parsing logic required',
            '- Manual edits possible',
            '',
            '# Notes',
            'Extra detail preserved for raw metadata',
            '',
        ].join('\n');

        const result = parseDecision(markdown);

        expect(result.id).toBe(2);
        expect(result.title).toBe('Storage Layout');
        expect(result.date).toBe('2026-02-01');
        expect(result.context).toBe(
            [
                'We need a persistent, inspectable project state.',
                '',
                'This is the second paragraph.',
            ].join('\n')
        );
        expect(result.options).toEqual(['JSON-only', 'Markdown-first (chosen)']);
        expect(result.decision).toBe('Use markdown for narrative state, JSON only for metadata.');
        expect(result.rationale).toBe(
            'Human readability and debuggability outweigh strict schema guarantees.'
        );
        expect(result.consequences).toEqual(['Parsing logic required', 'Manual edits possible']);

        expect(result.raw.preamble).toBe('Decision preamble note');
        const notesSection = result.raw.sections.find(section => section.title === 'Notes');
        expect(notesSection?.body).toContain('Extra detail preserved for raw metadata');
    });

    it('throws when a required section is missing', () => {
        const markdown = [
            '# Decision 003 — Missing Rationale',
            '# Date',
            '2026-02-01',
            '# Context',
            'Context body.',
            '# Options Considered',
            '- Option A',
            '# Decision',
            'Pick option A.',
            '# Consequences',
            '- New parser required',
        ].join('\n');

        try {
            parseDecision(markdown, {path: 'decision.md'});
            throw new Error('Expected parseDecision to throw');
        } catch (error) {
            expect(error).toBeInstanceOf(DomainParseError);
            const parseError = error as DomainParseError;
            expect(parseError.kind).toBe('missing_section');
            expect(parseError.section).toBe('Rationale');
            expect(parseError.path).toBe('decision.md');
        }
    });

    it('throws invalid_id for malformed decision headings', () => {
        const markdown = [
            '# Decision 0 — Invalid Id',
            '# Date',
            '2026-02-01',
            '# Context',
            'Context body.',
            '# Options Considered',
            '- Option A',
            '# Decision',
            'Pick option A.',
            '# Rationale',
            'Rationale body.',
            '# Consequences',
            '- New parser required',
        ].join('\n');

        try {
            parseDecision(markdown, {path: 'decision.md'});
            throw new Error('Expected parseDecision to throw');
        } catch (error) {
            expect(error).toBeInstanceOf(DomainParseError);
            const parseError = error as DomainParseError;
            expect(parseError.kind).toBe('invalid_id');
            expect(parseError.section).toBe('Decision');
            expect(parseError.path).toBe('decision.md');
        }
    });

    it('throws malformed for invalid dates', () => {
        const markdown = [
            '# Decision 004 — Invalid Date',
            '# Date',
            '2026-2-01',
            '# Context',
            'Context body.',
            '# Options Considered',
            '- Option A',
            '# Decision',
            'Pick option A.',
            '# Rationale',
            'Rationale body.',
            '# Consequences',
            '- New parser required',
        ].join('\n');

        try {
            parseDecision(markdown, {path: 'decision.md'});
            throw new Error('Expected parseDecision to throw');
        } catch (error) {
            expect(error).toBeInstanceOf(DomainParseError);
            const parseError = error as DomainParseError;
            expect(parseError.kind).toBe('malformed');
            expect(parseError.section).toBe('Date');
            expect(parseError.path).toBe('decision.md');
        }
    });
});
