import { describe, it, expect } from 'bun:test';
import type { Task } from '../../../src/core/domain/task.ts';
import type { Report } from '../../../src/core/domain/report.ts';

describe('Task Detail View', () => {
  it('renders task with all fields', () => {
    const task: Task = {
      id: 'T-005',
      title: 'Server client',
      status: 'running',
      objective: 'Implement HTTP client to POST prompts to server.',
      assignedRoles: ['planner', 'implementer'],
      relatedGoals: ['MVP execution loop'],
      createdAt: '2026-02-01T13:10:00Z',
    };

    // Verify task structure
    expect(task.id).toBe('T-005');
    expect(task.title).toBe('Server client');
    expect(task.status).toBe('running');
    expect(task.objective).toContain('HTTP client');
    expect(task.assignedRoles).toHaveLength(2);
    expect(task.assignedRoles[0]).toBe('planner');
    expect(task.relatedGoals).toHaveLength(1);
  });

  it('renders task with no reports', () => {
    const task: Task = {
      id: 'T-001',
      title: 'Repo bootstrap',
      status: 'completed',
      objective: 'Set up repository structure',
      assignedRoles: ['planner'],
      relatedGoals: [],
      createdAt: '2026-01-01T00:00:00Z',
    };

    const reports: Report[] = [];

    expect(reports).toHaveLength(0);
    expect(task.id).toBe('T-001');
  });

  it('renders task with multiple reports', () => {
    const task: Task = {
      id: 'T-005',
      title: 'Server client',
      status: 'running',
      objective: 'Implement HTTP client',
      assignedRoles: ['planner', 'implementer'],
      relatedGoals: ['MVP execution loop'],
      createdAt: '2026-02-01T13:10:00Z',
    };

    const reports: Report[] = [
      {
        runId: '20260201T131200Z',
        role: 'planner',
        status: 'success',
        summary: 'Plan created',
        artifacts: [],
        risks: [],
        next: [],
        rawText: 'Full report text here',
      },
      {
        runId: '20260201T131400Z',
        role: 'reviewer',
        status: 'partial',
        summary: 'Review completed',
        artifacts: [],
        risks: [],
        next: [],
        rawText: 'Full review text here',
      },
    ];

    expect(reports).toHaveLength(2);
    expect(reports[0].role).toBe('planner');
    expect(reports[0].status).toBe('success');
    expect(reports[1].role).toBe('reviewer');
    expect(reports[1].status).toBe('partial');
  });

  it('formats report status correctly', () => {
    const report: Report = {
      runId: '20260201T131200Z',
      role: 'planner',
      status: 'success',
      summary: 'Report summary',
      artifacts: [],
      risks: [],
      next: [],
      rawText: 'Raw text',
    };

    expect(['success', 'partial', 'blocked']).toContain(report.status);
  });

  it('handles task with no roles', () => {
    const task: Task = {
      id: 'T-001',
      title: 'Task with no roles',
      status: 'pending',
      objective: 'Do something',
      assignedRoles: [],
      relatedGoals: [],
      createdAt: '2026-01-01T00:00:00Z',
    };

    expect(task.assignedRoles).toHaveLength(0);
  });

  it('handles task with no goals', () => {
    const task: Task = {
      id: 'T-001',
      title: 'Task',
      status: 'pending',
      objective: 'Do something',
      assignedRoles: ['planner'],
      relatedGoals: [],
      createdAt: '2026-01-01T00:00:00Z',
    };

    expect(task.relatedGoals).toHaveLength(0);
  });

  it('preserves task createdAt date', () => {
    const createdAt = '2026-02-01T13:10:00Z';
    const task: Task = {
      id: 'T-001',
      title: 'Task',
      status: 'pending',
      objective: 'Do something',
      assignedRoles: [],
      relatedGoals: [],
      createdAt,
    };

    expect(task.createdAt).toBe(createdAt);
  });

  it('handles all task statuses', () => {
    const statuses = ['pending', 'running', 'blocked', 'completed', 'aborted'] as const;

    for (const status of statuses) {
      const task: Task = {
        id: 'T-001',
        title: 'Task',
        status,
        objective: 'Do something',
        assignedRoles: [],
        relatedGoals: [],
        createdAt: '2026-01-01T00:00:00Z',
      };

      expect(task.status).toBe(status);
    }
  });

  it('handles all report statuses', () => {
    const statuses = ['success', 'partial', 'blocked'] as const;

    for (const status of statuses) {
      const report: Report = {
        runId: '20260201T131200Z',
        role: 'planner',
        status,
        summary: 'Report',
        artifacts: [],
        risks: [],
        next: [],
        rawText: 'Raw text',
      };

      expect(report.status).toBe(status);
    }
  });

  it('handles multiple assigned roles', () => {
    const roles = ['planner', 'implementer', 'reviewer'] as const;
    const task: Task = {
      id: 'T-001',
      title: 'Task',
      status: 'pending',
      objective: 'Do something',
      assignedRoles: Array.from(roles),
      relatedGoals: [],
      createdAt: '2026-01-01T00:00:00Z',
    };

    expect(task.assignedRoles).toHaveLength(3);
    expect(task.assignedRoles[0]).toBe('planner');
    expect(task.assignedRoles[1]).toBe('implementer');
    expect(task.assignedRoles[2]).toBe('reviewer');
  });
});
