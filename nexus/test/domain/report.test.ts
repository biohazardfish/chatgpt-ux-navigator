import { describe, expect, it } from 'bun:test';
import { DomainParseError } from '../../src/core/domain/index.ts';
import { parseReport } from '../../src/core/parsing/report.ts';

describe('report parser', () => {
  it('parses required sections and preserves raw metadata', () => {
    const markdown = [
      '# Report — Planner',
      '',
      'STATUS: success',
      '',
      'SUMMARY:',
      'Captured the report format details.',
      '',
      'Second paragraph clarifies expected sections.',
      '',
      'ARTIFACTS:',
      '- Proposed template',
      '',
      'RISKS:',
      '- LLMs may drift from format',
      '',
      'NEXT:',
      '- Validate with reviewer role',
      '',
      'NOTES:',
      'Extra detail preserved in raw metadata.',
      '',
    ].join('\n');

    const result = parseReport(markdown);

    expect(result.role).toBe('planner');
    expect(result.status).toBe('success');
    expect(result.summary).toBe(
      [
        'Captured the report format details.',
        '',
        'Second paragraph clarifies expected sections.',
      ].join('\n'),
    );
    expect(result.artifacts).toEqual(['Proposed template']);
    expect(result.risks).toEqual(['LLMs may drift from format']);
    expect(result.next).toEqual(['Validate with reviewer role']);
    expect(result.rawText).toBe(markdown);

    const notesSection = result.raw.sections.find((section) =>
      section.title.toLowerCase().startsWith('notes'),
    );
    expect(notesSection?.body).toContain('Extra detail preserved in raw metadata.');
  });

  it('throws when a required section is missing', () => {
    const markdown = [
      '# Report — Planner',
      'STATUS: success',
      'SUMMARY:',
      'Captured the report format details.',
      'ARTIFACTS:',
      '- Proposed template',
      'NEXT:',
      '- Validate with reviewer role',
    ].join('\n');

    try {
      parseReport(markdown, { path: 'report.md' });
      throw new Error('Expected parseReport to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainParseError);
      const parseError = error as DomainParseError;
      expect(parseError.kind).toBe('missing_section');
      expect(parseError.section).toBe('Risks');
      expect(parseError.path).toBe('report.md');
    }
  });

  it('throws invalid_enum for unsupported status values', () => {
    const markdown = [
      '# Report — Planner',
      'STATUS: In Review',
      'SUMMARY:',
      'Captured the report format details.',
      'ARTIFACTS:',
      '- Proposed template',
      'RISKS:',
      '- LLMs may drift from format',
      'NEXT:',
      '- Validate with reviewer role',
    ].join('\n');

    try {
      parseReport(markdown, { path: 'report.md' });
      throw new Error('Expected parseReport to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainParseError);
      const parseError = error as DomainParseError;
      expect(parseError.kind).toBe('invalid_enum');
      expect(parseError.section).toBe('Status');
      expect(parseError.path).toBe('report.md');
    }
  });

  it('throws invalid_role for unknown roles', () => {
    const markdown = [
      '# Report — Astronaut',
      'STATUS: success',
      'SUMMARY:',
      'Captured the report format details.',
      'ARTIFACTS:',
      '- Proposed template',
      'RISKS:',
      '- LLMs may drift from format',
      'NEXT:',
      '- Validate with reviewer role',
    ].join('\n');

    try {
      parseReport(markdown, { path: 'report.md' });
      throw new Error('Expected parseReport to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainParseError);
      const parseError = error as DomainParseError;
      expect(parseError.kind).toBe('invalid_role');
      expect(parseError.section).toBe('Report');
      expect(parseError.path).toBe('report.md');
    }
  });

  it('throws when the report heading is missing', () => {
    const markdown = [
      'STATUS: success',
      'SUMMARY:',
      'Captured the report format details.',
      'ARTIFACTS:',
      '- Proposed template',
      'RISKS:',
      '- LLMs may drift from format',
      'NEXT:',
      '- Validate with reviewer role',
    ].join('\n');

    try {
      parseReport(markdown, { path: 'report.md' });
      throw new Error('Expected parseReport to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainParseError);
      const parseError = error as DomainParseError;
      expect(parseError.kind).toBe('missing_section');
      expect(parseError.section).toBe('Report');
      expect(parseError.path).toBe('report.md');
    }
  });
});
