import {describe, expect, it} from 'bun:test';
import {DomainParseError} from '../../src/core/domain/index.ts';
import {parseNotes} from '../../src/core/parsing/notes.ts';

describe('notes parser', () => {
    it('parses all required sections and preserves raw metadata', () => {
        const markdown = [
            'Project memory preamble for context',
            '',
            '# Project Notes',
            '- Keep conversations short',
            '- Capture decisions in reports',
            '',
            '# Assumptions',
            '- Sessions reset when the app reloads',
            '',
            '# Clarifications',
            '- Reports should focus on outcomes',
            '',
            '# Lessons Learned',
            '- Keep the domain model pure',
            '',
            '# Archive',
            'Legacy section preserved for raw output',
            '',
        ].join('\n');

        const result = parseNotes(markdown);

        expect(result.projectNotes).toEqual([
            'Keep conversations short',
            'Capture decisions in reports',
        ]);
        expect(result.assumptions).toEqual(['Sessions reset when the app reloads']);
        expect(result.clarifications).toEqual(['Reports should focus on outcomes']);
        expect(result.lessonsLearned).toEqual(['Keep the domain model pure']);

        expect(result.raw.preamble).toBe('Project memory preamble for context');
        const archiveSection = result.raw.sections.find(section => section.title === 'Archive');
        expect(archiveSection?.body).toContain('Legacy section preserved for raw output');
    });

    it('returns empty arrays when sections have no bullet content', () => {
        const markdown = [
            '# Project Notes',
            '',
            '# Assumptions',
            '',
            '# Clarifications',
            '',
            '# Lessons Learned',
            '',
        ].join('\n');

        const result = parseNotes(markdown);

        expect(result.projectNotes).toEqual([]);
        expect(result.assumptions).toEqual([]);
        expect(result.clarifications).toEqual([]);
        expect(result.lessonsLearned).toEqual([]);
    });

    it('handles mixed bullet styles within sections', () => {
        const markdown = [
            '# Project Notes',
            '1. First note',
            '- Second note',
            '* Third note',
            '',
            '# Assumptions',
            '1. Numeric assumption',
            '- Dashed assumption',
            '	* Tabbed star assumption',
            '',
            '# Clarifications',
            '    1. Indented numbered clarification',
            '- Clarification bullet',
            '',
            '# Lessons Learned',
            '1. Lesson with number',
            '* Lesson with star',
            '',
        ].join('\n');

        const result = parseNotes(markdown);

        expect(result.projectNotes).toEqual(['First note', 'Second note', 'Third note']);
        expect(result.assumptions).toEqual([
            'Numeric assumption',
            'Dashed assumption',
            'Tabbed star assumption',
        ]);
        expect(result.clarifications).toEqual([
            'Indented numbered clarification',
            'Clarification bullet',
        ]);
        expect(result.lessonsLearned).toEqual(['Lesson with number', 'Lesson with star']);
    });

    it('throws a DomainParseError when a required heading is missing', () => {
        const markdown = [
            '# Project Notes',
            '- Entry',
            '# Assumptions',
            '- Entry',
            '# Clarifications',
            '- Entry',
        ].join('\n');

        try {
            parseNotes(markdown, {path: 'notes.md'});
            throw new Error('Expected parseNotes to throw');
        } catch (error) {
            expect(error).toBeInstanceOf(DomainParseError);
            const parseError = error as DomainParseError;
            expect(parseError.kind).toBe('missing_section');
            expect(parseError.section).toBe('Lessons Learned');
            expect(parseError.path).toBe('notes.md');
        }
    });
});
