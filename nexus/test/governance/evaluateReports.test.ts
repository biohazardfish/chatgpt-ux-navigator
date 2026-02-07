import {describe, expect, it} from 'bun:test';

import {evaluateReports, GovernanceError} from '../../src/core/governance/evaluateReports.ts';
import type {Report} from '../../src/core/domain/report.ts';
import type {Task} from '../../src/core/domain/task.ts';
import type {Project} from '../../src/core/domain/project.ts';
import type {Role} from '../../src/core/domain/role.ts';
import type {ReportStatus} from '../../src/core/domain/status.ts';

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

function createReport(role: Role, status: ReportStatus, summary = 'Test summary'): Report {
    return {
        runId: `run-${role}`,
        role,
        status,
        summary,
        artifacts: [],
        risks: [],
        next: [],
        rawText: `# Report — ${role}\n\nSTATUS: ${status}\n\nSUMMARY:\n${summary}`,
    };
}

function createTask(roles: Role[], id = 'T-001'): Task {
    return {
        id,
        title: 'Test task',
        status: 'running',
        objective: 'Test objective',
        assignedRoles: roles,
        relatedGoals: [],
        createdAt: '2025-01-01T00:00:00Z',
    };
}

function createProject(): Project {
    return {
        meta: {
            version: 1,
            projectId: 'test-project',
            createdAt: '2025-01-01T00:00:00Z',
            lastUpdatedAt: '2025-01-01T00:00:00Z',
            status: 'active',
        },
        projectDoc: {
            title: 'Test Project',
            goals: ['Goal 1'],
            constraints: [],
            nonGoals: [],
        },
        plan: {
            status: 'approved',
            phases: [],
            notes: [],
        },
        notes: {
            projectNotes: [],
            assumptions: [],
            clarifications: [],
            lessonsLearned: [],
        },
        tasks: [],
        decisions: [],
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('evaluateReports', () => {
    const project = createProject();

    // -------------------------------------------------------------------------
    // Validation
    // -------------------------------------------------------------------------

    describe('validation', () => {
        it('throws GovernanceError when no reports are provided', () => {
            const task = createTask(['planner']);

            try {
                evaluateReports({project, task, reports: []});
                throw new Error('Expected to throw');
            } catch (error) {
                expect(error).toBeInstanceOf(GovernanceError);
                const e = error as GovernanceError;
                expect(e.message).toContain('No reports provided');
                expect(e.message).toContain('T-001');
            }
        });

        it('throws GovernanceError when report role is not in assigned roles', () => {
            const task = createTask(['planner']);
            const reports = [createReport('reviewer', 'success')];

            try {
                evaluateReports({project, task, reports});
                throw new Error('Expected to throw');
            } catch (error) {
                expect(error).toBeInstanceOf(GovernanceError);
                const e = error as GovernanceError;
                expect(e.message).toContain("Report role 'reviewer'");
                expect(e.message).toContain('not in assigned roles');
            }
        });

        it('throws GovernanceError when a required role has no report', () => {
            const task = createTask(['planner', 'reviewer']);
            const reports = [createReport('planner', 'success')];

            try {
                evaluateReports({project, task, reports});
                throw new Error('Expected to throw');
            } catch (error) {
                expect(error).toBeInstanceOf(GovernanceError);
                const e = error as GovernanceError;
                expect(e.message).toContain("Missing report for assigned role 'reviewer'");
            }
        });
    });

    // -------------------------------------------------------------------------
    // Single-report tasks
    // -------------------------------------------------------------------------

    describe('single-report tasks', () => {
        it('returns accept when single report is success', () => {
            const task = createTask(['planner']);
            const reports = [createReport('planner', 'success')];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('accept');
            expect(result.summary.taskId).toBe('T-001');
            expect(result.summary.outcome).toBe('accept');
            expect(result.summary.reportStatuses).toEqual({planner: 'success'});
        });

        it('returns partial when single report is partial', () => {
            const task = createTask(['implementer']);
            const reports = [createReport('implementer', 'partial')];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('partial');
            expect(result.summary.outcome).toBe('partial');
            expect(result.summary.reportStatuses).toEqual({implementer: 'partial'});
        });

        it('returns blocked when single report is blocked', () => {
            const task = createTask(['reviewer']);
            const reports = [createReport('reviewer', 'blocked')];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('blocked');
            expect(result.summary.outcome).toBe('blocked');
            expect(result.summary.reportStatuses).toEqual({reviewer: 'blocked'});
        });
    });

    // -------------------------------------------------------------------------
    // Multi-report tasks
    // -------------------------------------------------------------------------

    describe('multi-report tasks', () => {
        it('returns accept when all reports are success', () => {
            const task = createTask(['planner', 'reviewer']);
            const reports = [
                createReport('planner', 'success'),
                createReport('reviewer', 'success'),
            ];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('accept');
            expect(result.summary.reportStatuses).toEqual({
                planner: 'success',
                reviewer: 'success',
            });
        });

        it('returns partial when all reports are partial', () => {
            const task = createTask(['planner', 'implementer']);
            const reports = [
                createReport('planner', 'partial'),
                createReport('implementer', 'partial'),
            ];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('partial');
        });

        it('returns blocked when any report is blocked', () => {
            const task = createTask(['planner', 'reviewer']);
            const reports = [
                createReport('planner', 'success'),
                createReport('reviewer', 'blocked'),
            ];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('blocked');
            expect(result.summary.rationale).toContain('blocker');
        });

        it('returns blocked when blocked appears with partial', () => {
            const task = createTask(['implementer', 'reviewer']);
            const reports = [
                createReport('implementer', 'partial'),
                createReport('reviewer', 'blocked'),
            ];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('blocked');
        });

        it('returns escalate when reports disagree (success vs partial)', () => {
            const task = createTask(['planner', 'reviewer']);
            const reports = [
                createReport('planner', 'success'),
                createReport('reviewer', 'partial'),
            ];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('escalate');
            expect(result.summary.rationale).toContain('conflict');
        });

        it('returns accept for three roles all success', () => {
            const task = createTask(['planner', 'implementer', 'reviewer']);
            const reports = [
                createReport('planner', 'success'),
                createReport('implementer', 'success'),
                createReport('reviewer', 'success'),
            ];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('accept');
        });

        it('returns blocked when one of three is blocked', () => {
            const task = createTask(['planner', 'implementer', 'reviewer']);
            const reports = [
                createReport('planner', 'success'),
                createReport('implementer', 'blocked'),
                createReport('reviewer', 'success'),
            ];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('blocked');
        });
    });

    // -------------------------------------------------------------------------
    // ApprovalRequest generation
    // -------------------------------------------------------------------------

    describe('approval request', () => {
        it('generates ApprovalRequest on escalation', () => {
            const task = createTask(['planner', 'reviewer'], 'T-042');
            const reports = [
                createReport('planner', 'success', 'Everything looks good'),
                createReport('reviewer', 'partial', 'Needs more work'),
            ];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('escalate');
            expect(result.approvalRequest).toBeDefined();

            const req = result.approvalRequest!;
            expect(req.id).toBe('task-T-042-resolution');
            expect(req.type).toBe('task-acceptance');
            expect(req.title).toBe('Resolve task T-042');
            expect(req.context).toContain('conflict');
            expect(req.context).toContain('Everything looks good');
            expect(req.context).toContain('Needs more work');
            expect(req.options).toHaveLength(3);
            expect(req.options[0]).toEqual({
                id: 'accept',
                label: 'Accept as-is',
                action: 'accept',
            });
            expect(req.options[1]).toEqual({
                id: 'revise',
                label: 'Request revisions',
                action: 'revise',
            });
            expect(req.options[2]).toEqual({
                id: 'abort',
                label: 'Abort task',
                action: 'abort',
            });
        });

        it('does not generate ApprovalRequest for accept outcome', () => {
            const task = createTask(['planner']);
            const reports = [createReport('planner', 'success')];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('accept');
            expect(result.approvalRequest).toBeUndefined();
        });

        it('does not generate ApprovalRequest for partial outcome', () => {
            const task = createTask(['implementer']);
            const reports = [createReport('implementer', 'partial')];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('partial');
            expect(result.approvalRequest).toBeUndefined();
        });

        it('does not generate ApprovalRequest for blocked outcome', () => {
            const task = createTask(['reviewer']);
            const reports = [createReport('reviewer', 'blocked')];

            const result = evaluateReports({project, task, reports});

            expect(result.outcome).toBe('blocked');
            expect(result.approvalRequest).toBeUndefined();
        });
    });

    // -------------------------------------------------------------------------
    // GovernanceSummary
    // -------------------------------------------------------------------------

    describe('governance summary', () => {
        it('includes taskId and outcome in summary', () => {
            const task = createTask(['planner'], 'T-099');
            const reports = [createReport('planner', 'success')];

            const result = evaluateReports({project, task, reports});

            expect(result.summary.taskId).toBe('T-099');
            expect(result.summary.outcome).toBe('accept');
        });

        it('includes rationale string', () => {
            const task = createTask(['planner']);
            const reports = [createReport('planner', 'success')];

            const result = evaluateReports({project, task, reports});

            expect(typeof result.summary.rationale).toBe('string');
            expect(result.summary.rationale.length).toBeGreaterThan(0);
        });

        it('maps all report roles to statuses', () => {
            const task = createTask(['planner', 'implementer', 'reviewer']);
            const reports = [
                createReport('planner', 'success'),
                createReport('implementer', 'success'),
                createReport('reviewer', 'success'),
            ];

            const result = evaluateReports({project, task, reports});

            expect(result.summary.reportStatuses).toEqual({
                planner: 'success',
                implementer: 'success',
                reviewer: 'success',
            });
        });
    });
});
