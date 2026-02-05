import { describe, expect, it } from 'bun:test';
import { DomainParseError } from '../../src/core/domain/index.ts';
import { parseTask } from '../../src/core/parsing/task.ts';

describe('task parser', () => {
  it('parses required sections and preserves raw metadata', () => {
    const markdown = [
      'Task preamble describing the work',
      '',
      '# Task T-003 — Design Report Format',
      '',
      '# Status',
      'Pending',
      '',
      '# Objective',
      'Define a text-based report convention that can be parsed reliably.',
      '',
      '# Assigned Roles',
      '- planner',
      '- reviewer',
      '',
      '# Related Goals',
      '- Governance',
      '- Persistence',
      '',
      '# Created At',
      '2026-02-01T13:10:00Z',
      '',
      '# Archive',
      'Legacy note preserved for raw output',
      '',
    ].join('\n');

    const result = parseTask(markdown);

    expect(result.id).toBe('T-003');
    expect(result.title).toBe('Design Report Format');
    expect(result.status).toBe('pending');
    expect(result.objective).toBe('Define a text-based report convention that can be parsed reliably.');
    expect(result.assignedRoles).toEqual(['planner', 'reviewer']);
    expect(result.relatedGoals).toEqual(['Governance', 'Persistence']);
    expect(result.createdAt).toBe('2026-02-01T13:10:00Z');

    expect(result.raw.preamble).toBe('Task preamble describing the work');
    const archiveSection = result.raw.sections.find((section) => section.title === 'Archive');
    expect(archiveSection?.body).toContain('Legacy note preserved for raw output');
  });

  it('throws when a required section is missing', () => {
    const markdown = [
      '# Task T-010 — Missing Related Goals',
      '# Status',
      'Pending',
      '# Objective',
      'Track output coverage.',
      '# Assigned Roles',
      '- planner',
      '# Created At',
      '2026-02-01T13:10:00Z',
    ].join('\n');

    try {
      parseTask(markdown, { path: 'task.md' });
      throw new Error('Expected parseTask to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainParseError);
      const parseError = error as DomainParseError;
      expect(parseError.kind).toBe('missing_section');
      expect(parseError.section).toBe('Related Goals');
      expect(parseError.path).toBe('task.md');
    }
  });

  it('throws invalid_id for malformed task headings', () => {
    const markdown = [
      '# Task 003 — Missing Prefix',
      '# Status',
      'Pending',
      '# Objective',
      'Define the output.',
      '# Assigned Roles',
      '- planner',
      '# Related Goals',
      '- Quality',
      '# Created At',
      '2026-02-01T13:10:00Z',
    ].join('\n');

    try {
      parseTask(markdown, { path: 'task.md' });
      throw new Error('Expected parseTask to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainParseError);
      const parseError = error as DomainParseError;
      expect(parseError.kind).toBe('invalid_id');
      expect(parseError.section).toBe('Task');
      expect(parseError.path).toBe('task.md');
    }
  });

  it('throws invalid_enum for unsupported status values', () => {
    const markdown = [
      '# Task T-011 — Invalid Status',
      '# Status',
      'In Review',
      '# Objective',
      'Define the output.',
      '# Assigned Roles',
      '- planner',
      '# Related Goals',
      '- Quality',
      '# Created At',
      '2026-02-01T13:10:00Z',
    ].join('\n');

    try {
      parseTask(markdown, { path: 'task.md' });
      throw new Error('Expected parseTask to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainParseError);
      const parseError = error as DomainParseError;
      expect(parseError.kind).toBe('invalid_enum');
      expect(parseError.section).toBe('Status');
      expect(parseError.path).toBe('task.md');
    }
  });

  it('throws invalid_role for unknown role values', () => {
    const markdown = [
      '# Task T-012 — Invalid Role',
      '# Status',
      'Pending',
      '# Objective',
      'Define the output.',
      '# Assigned Roles',
      '- astronaut',
      '# Related Goals',
      '- Quality',
      '# Created At',
      '2026-02-01T13:10:00Z',
    ].join('\n');

    try {
      parseTask(markdown, { path: 'task.md' });
      throw new Error('Expected parseTask to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainParseError);
      const parseError = error as DomainParseError;
      expect(parseError.kind).toBe('invalid_role');
      expect(parseError.section).toBe('Assigned Roles');
      expect(parseError.path).toBe('task.md');
    }
  });

  it('throws malformed for invalid created timestamps', () => {
    const markdown = [
      '# Task T-013 — Invalid Timestamp',
      '# Status',
      'Pending',
      '# Objective',
      'Define the output.',
      '# Assigned Roles',
      '- planner',
      '# Related Goals',
      '- Quality',
      '# Created At',
      'not-a-date',
    ].join('\n');

    try {
      parseTask(markdown, { path: 'task.md' });
      throw new Error('Expected parseTask to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainParseError);
      const parseError = error as DomainParseError;
      expect(parseError.kind).toBe('malformed');
      expect(parseError.section).toBe('Created At');
      expect(parseError.path).toBe('task.md');
    }
  });
});
