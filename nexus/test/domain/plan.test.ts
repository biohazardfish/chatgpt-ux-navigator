import { describe, expect, it } from 'bun:test';
import { DomainParseError } from '../../src/core/domain/index.ts';
import { parsePlan } from '../../src/core/parsing/plan.ts';

describe('plan parser', () => {
  it('parses required sections, canonical status, and preserves raw metadata', () => {
    const text = [
      'Project plan preamble describing intent',
      '',
      '# Current Plan',
      'This plan covers the next two release cycles.',
      '',
      '# Status',
      'Approved',
      '',
      '# Phases',
      '1. Bootstrap the repo',
      '2. Define core domain model',
      '- Build a minimal CLI',
      '',
      '# Notes',
      'Keep the plan concise and review after each phase.',
      '- Document transitions between states',
      '',
      '# Archive',
      'Legacy note preserved for raw output',
      '',
    ].join('\n');

    const result = parsePlan(text);

    expect(result.status).toBe('approved');
    expect(result.phases).toEqual([
      'Bootstrap the repo',
      'Define core domain model',
      'Build a minimal CLI',
    ]);
    expect(result.notes).toEqual([
      'Keep the plan concise and review after each phase.',
      'Document transitions between states',
    ]);

    expect(result.raw.preamble).toBe('Project plan preamble describing intent');
    const archiveSection = result.raw.sections.find((section) => section.title === 'Archive');
    expect(archiveSection?.body).toContain('Legacy note preserved for raw output');
  });

  it('throws when a required section is missing', () => {
    const text = [
      '# Current Plan',
      '# Status',
      'Draft',
      '# Phases',
      '- Initial research',
    ].join('\n');

    try {
      parsePlan(text, { path: 'plan.md' });
      throw new Error('Expected parsePlan to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainParseError);
      const parseError = error as DomainParseError;
      expect(parseError.kind).toBe('missing_section');
      expect(parseError.section).toBe('Notes');
      expect(parseError.path).toBe('plan.md');
    }
  });

  it('throws invalid_enum for unsupported status values', () => {
    const text = [
      '# Current Plan',
      '# Status',
      'In Review',
      '# Phases',
      '- Prepare fixtures',
      '# Notes',
      '- Monitor feedback',
    ].join('\n');

    try {
      parsePlan(text, { path: 'plan.md' });
      throw new Error('Expected parsePlan to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainParseError);
      const parseError = error as DomainParseError;
      expect(parseError.kind).toBe('invalid_enum');
      expect(parseError.section).toBe('Status');
      expect(parseError.path).toBe('plan.md');
      expect(parseError.details).toEqual({ expected: ['draft', 'approved', 'superseded'] });
    }
  });
});
