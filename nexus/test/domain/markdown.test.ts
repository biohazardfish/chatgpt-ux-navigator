import {describe, expect, it} from 'bun:test';
import {DomainParseError} from '../../src/core/domain/index.ts';
import {
    extractSections,
    normalizeMarkdown,
    parseBulletList,
    parseSingleLine,
    requireSection,
} from '../../src/core/parsing/markdown.ts';

describe('markdown helpers', () => {
    it('normalizes CRLF to LF', () => {
        expect(normalizeMarkdown('Line 1\r\nLine 2')).toBe('Line 1\nLine 2');
    });

    it('extracts multiple headings and captures bodies', () => {
        const text = [
            'Intro line',
            '',
            '# Goals',
            '- Build the MVP',
            '',
            '# Constraints',
            'Local-first',
            '',
            'Plain text only',
            '',
            '## Notes',
            'Line one',
        ].join('\n');

        const result = extractSections(text);
        expect(result.preamble).toBe('Intro line');
        expect(result.sections).toHaveLength(3);

        expect(result.sections[0]).toEqual({
            heading: 'Goals',
            level: 1,
            body: '- Build the MVP',
        });

        expect(result.sections[1]).toEqual({
            heading: 'Constraints',
            level: 1,
            body: 'Local-first\n\nPlain text only',
        });

        expect(result.sections[2]).toEqual({
            heading: 'Notes',
            level: 2,
            body: 'Line one',
        });
    });

    it('throws when required section is missing', () => {
        const result = extractSections('# Goals\n- Keep it simple');
        const map = new Map(result.sections.map(section => [section.heading, section]));

        try {
            requireSection(map, 'Constraints');
            throw new Error('Expected requireSection to throw');
        } catch (error) {
            expect(error).toBeInstanceOf(DomainParseError);
            const err = error as DomainParseError;
            expect(err.kind).toBe('missing_section');
            expect(err.section).toBe('Constraints');
        }
    });

    it('parses bullet lists with mixed styles', () => {
        const text = [
            '  - First item  ',
            '* Second item',
            '1. Third item',
            ' 2. Fourth item',
            'Plain item',
            '',
        ].join('\n');

        expect(parseBulletList(text)).toEqual([
            'First item',
            'Second item',
            'Third item',
            'Fourth item',
            'Plain item',
        ]);
    });

    it('returns the first non-empty trimmed line', () => {
        const text = '\n  \n First line \n Second line';
        expect(parseSingleLine(text)).toBe('First line');
    });
});
