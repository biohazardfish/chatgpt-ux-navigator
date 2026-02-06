import { describe, expect, it } from 'bun:test';

import {
  ReportParseError,
  parseReport,
} from '../../src/core/report/index.ts';

describe('parseReport', () => {
  it('parses valid report', () => {
    const rawReport = [
      '# Report — Planner',
      '',
      'STATUS: success',
      '',
      'SUMMARY:',
      'Defined a minimal, parseable report structure.',
      '',
      'Captured multi-line summary across sections.',
      '',
      'ARTIFACTS:',
      '- Proposed markdown template',
      '',
      'RISKS:',
      '- LLMs may deviate from the format',
      '',
      'NEXT:',
      '- Validate with reviewer role',
      '',
    ].join('\n');

    const report = parseReport({
      expectedRole: 'planner',
      rawText: rawReport,
      runId: 'run-123',
    });

    expect(report.runId).toBe('run-123');
    expect(report.role).toBe('planner');
    expect(report.status).toBe('success');
    expect(report.summary).toBe(
      [
        'Defined a minimal, parseable report structure.',
        '',
        'Captured multi-line summary across sections.',
      ].join('\n'),
    );
    expect(report.artifacts).toEqual(['Proposed markdown template']);
    expect(report.risks).toEqual(['LLMs may deviate from the format']);
    expect(report.next).toEqual(['Validate with reviewer role']);
    expect(report.rawText).toBe(rawReport);
  });

  it('handles empty bullet sections', () => {
    const rawReport = [
      '# Report — Reviewer',
      '',
      'STATUS: partial',
      '',
      'SUMMARY:',
      'Outlined steps for validation but artifacts remain pending.',
      '',
      'ARTIFACTS:',
      '',
      'RISKS:',
      '',
      'NEXT:',
      '',
    ].join('\n');

    const report = parseReport({
      expectedRole: 'reviewer',
      rawText: rawReport,
    });

    expect(report.runId).toBe('');
    expect(report.role).toBe('reviewer');
    expect(report.status).toBe('partial');
    expect(report.summary).toBe('Outlined steps for validation but artifacts remain pending.');
    expect(report.artifacts).toEqual([]);
    expect(report.risks).toEqual([]);
    expect(report.next).toEqual([]);
    expect(report.rawText).toBe(rawReport);
  });

  it('throws missing header error when header is absent', () => {
    const rawReport = [
      'STATUS: success',
      '',
      'SUMMARY:',
      'Done',
      '',
      'ARTIFACTS:',
      '- Output',
      '',
      'RISKS:',
      '- Edge',
      '',
      'NEXT:',
      '- More',
    ].join('\n');

    expectParseError(
      {
        expectedRole: 'planner',
        rawText: rawReport,
      },
      (error) => {
        expect(error.type).toBe('missing-header');
        expect(error.section).toBe('Report');
        expect(error.line).toBe(1);
      },
    );
  });

  it('throws invalid-role when header role does not match expectedRole', () => {
    const rawReport = [
      '# Report — Planner',
      '',
      'STATUS: success',
      '',
      'SUMMARY:',
      'Multi-role conflict',
      '',
      'ARTIFACTS:',
      '- None',
      '',
      'RISKS:',
      '- Format drift',
      '',
      'NEXT:',
      '- Align roles',
    ].join('\n');

    expectParseError(
      {
        expectedRole: 'reviewer',
        rawText: rawReport,
      },
      (error) => {
        expect(error.type).toBe('invalid-role');
        expect(error.details).toEqual({ expected: 'reviewer', actual: 'planner' });
        expect(error.line).toBe(1);
      },
    );
  });

  it('throws missing-section when RISKS section is omitted', () => {
    const rawReport = [
      '# Report — Planner',
      '',
      'STATUS: success',
      '',
      'SUMMARY:',
      'Complete run-through',
      '',
      'ARTIFACTS:',
      '- Template',
    ].join('\n');

    expectParseError(
      {
        expectedRole: 'planner',
        rawText: rawReport,
      },
      (error) => {
        expect(error.type).toBe('missing-section');
        expect(error.section).toBe('Risks');
      },
    );
  });

  it('throws invalid status error for unsupported status values', () => {
    const rawReport = [
      '# Report — Planner',
      '',
      'STATUS: done',
      '',
      'SUMMARY:',
      'Status is invalid',
      '',
      'ARTIFACTS:',
      '- Template',
      '',
      'RISKS:',
      '- Drift',
      '',
      'NEXT:',
      '- Fix',
    ].join('\n');

    expectParseError(
      {
        expectedRole: 'planner',
        rawText: rawReport,
      },
      (error) => {
        expect(error.type).toBe('invalid-status');
        expect(error.section).toBe('Status');
        expect(error.line).toBe(3);
      },
    );
  });

  it('throws section order error when sections appear out of order', () => {
    const rawReport = [
      '# Report — Planner',
      '',
      'STATUS: success',
      '',
      'SUMMARY:',
      'Ordering fails later',
      '',
      'ARTIFACTS:',
      '- Template',
      '',
      'NEXT:',
      '- Should come last',
      '',
      'RISKS:',
      '- Section misplaced',
    ].join('\n');

    expectParseError(
      {
        expectedRole: 'planner',
        rawText: rawReport,
      },
      (error) => {
        expect(error.type).toBe('section-order');
        expect(error.section).toBe('Next');
        expect(error.line).toBe(11);
      },
    );
  });

  it('throws malformed-bullets when bullet prefixes are missing', () => {
    const rawReport = [
      '# Report — Planner',
      '',
      'STATUS: success',
      '',
      'SUMMARY:',
      'Bad bullets',
      '',
      'ARTIFACTS:',
      'artifact without prefix',
      '',
      'RISKS:',
      '- Drifts',
      '',
      'NEXT:',
      '- Fix artifacts',
    ].join('\n');

    expectParseError(
      {
        expectedRole: 'planner',
        rawText: rawReport,
      },
      (error) => {
        expect(error.type).toBe('malformed-bullets');
        expect(error.section).toBe('Artifacts');
        expect(error.line).toBe(9);
      },
    );
  });
});

function expectParseError(
  params: Parameters<typeof parseReport>[0],
  assertions: (error: ReportParseError) => void,
) {
  try {
    parseReport(params);
    throw new Error('Expected parseReport to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(ReportParseError);
    assertions(error as ReportParseError);
  }
}
