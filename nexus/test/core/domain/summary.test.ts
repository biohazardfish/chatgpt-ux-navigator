import { describe, it, expect } from 'bun:test';
import { summarizeProject } from '../../../src/core/domain/summary.ts';
import type { Project } from '../../../src/core/domain/project.ts';

describe('summarizeProject', () => {
  const emptyProject: Project = {
    meta: { version: 1, projectId: 'test', createdAt: '', lastUpdatedAt: '', status: 'active' },
    projectDoc: { title: 'Test', goals: [], constraints: [], nonGoals: [] },
    plan: { status: 'draft', phases: [], notes: [] },
    tasks: [],
    decisions: [],
    notes: { assumptions: [], clarifications: [], lessonsLearned: [], projectNotes: [] },
  };

  it('calculates counts correctly for empty project', () => {
    const summary = summarizeProject(emptyProject);
    expect(summary.goalCount).toBe(0);
    expect(summary.taskCounts.pending).toBe(0);
    expect(summary.activityState).toBe('idle');
  });

  it('calculates task counts correctly', () => {
    const project = {
      ...emptyProject,
      tasks: [
        { id: '1', status: 'pending' },
        { id: '2', status: 'running' },
        { id: '3', status: 'completed' },
        { id: '4', status: 'completed' },
        { id: '5', status: 'blocked' },
      ] as any[],
    };

    const summary = summarizeProject(project);
    expect(summary.taskCounts.pending).toBe(1);
    expect(summary.taskCounts.running).toBe(1);
    expect(summary.taskCounts.completed).toBe(2);
    expect(summary.taskCounts.blocked).toBe(1);
  });

  it('derives activity state: running', () => {
    const project = {
      ...emptyProject,
      tasks: [{ id: '1', status: 'running' }] as any[],
    };
    expect(summarizeProject(project).activityState).toBe('running');
  });

  it('derives activity state: blocked', () => {
    const project = {
      ...emptyProject,
      tasks: [{ id: '1', status: 'blocked' }] as any[],
    };
    expect(summarizeProject(project).activityState).toBe('blocked');
  });

  it('derives activity state: idle', () => {
    const project = {
      ...emptyProject,
      tasks: [{ id: '1', status: 'pending' }] as any[],
    };
    expect(summarizeProject(project).activityState).toBe('idle');
  });

  it('prioritizes running over blocked', () => {
    const project = {
      ...emptyProject,
      tasks: [
        { id: '1', status: 'running' },
        { id: '2', status: 'blocked' },
      ] as any[],
    };
    expect(summarizeProject(project).activityState).toBe('running');
  });
});
