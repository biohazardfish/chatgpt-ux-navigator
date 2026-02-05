import { describe, expect, it } from 'bun:test';
import { DomainParseError } from '../../src/core/domain/index.ts';
import { parseProjectDoc } from '../../src/core/parsing/project.ts';

describe('project doc parser', () => {
  it('parses required sections and preserves raw metadata', () => {
    const text = [
      'Intro line explaining the project',
      '',
      '# Project: Nexus MVP',
      '',
      '# Goals',
      '- Build a usable Nexus MVP',
      'Include plain text description as part of the same list',
      '',
      '# Constraints',
      '- Local-first architecture',
      '- Bun runtime',
      '',
      '# Non-Goals',
      '- Full autonomy',
      '- Cloud sync',
      '',
      '# Notes',
      'This extra section should survive in raw metadata',
      '',
    ].join('\n');

    const result = parseProjectDoc(text);

    expect(result.title).toBe('Nexus MVP');
    expect(result.goals).toEqual([
      'Build a usable Nexus MVP',
      'Include plain text description as part of the same list',
    ]);
    expect(result.constraints).toEqual(['Local-first architecture', 'Bun runtime']);
    expect(result.nonGoals).toEqual(['Full autonomy', 'Cloud sync']);

    expect(result.raw.preamble).toBe('Intro line explaining the project');
    const extra = result.raw.sections.find((section) => section.title === 'Notes');
    expect(extra?.body).toContain('This extra section should survive in raw metadata');
  });

  it('includes non-bulleted lines as list items', () => {
    const text = [
      '# Project: Sample Project',
      '# Goals',
      'Loose description line without a marker',
      '- Proper bullet item',
      '',
      '# Constraints',
      '- Constraint A',
      '# Non-Goals',
      '- Non-goal A',
    ].join('\n');

    const result = parseProjectDoc(text);
    expect(result.goals).toEqual([
      'Loose description line without a marker',
      'Proper bullet item',
    ]);
  });

  it('throws DomainParseError when a required section is missing', () => {
    const text = [
      '# Project: Incomplete Project',
      '# Goals',
      '- Keep iterating',
      '# Non-Goals',
      '- No cloud sync',
    ].join('\n');

    try {
      parseProjectDoc(text, { path: 'project.md' });
      throw new Error('Expected parseProjectDoc to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainParseError);
      const parseError = error as DomainParseError;
      expect(parseError.kind).toBe('missing_section');
      expect(parseError.section).toBe('Constraints');
      expect(parseError.path).toBe('project.md');
    }
  });
});
