import {describe, expect, it} from 'bun:test';

import {buildPromptContext} from '../../src/core/context/builder.ts';
import {MAX_NOTES_LINES, TRUNCATION_MARKER} from '../../src/core/context/limits.ts';
import type {Project} from '../../src/core/domain/project.ts';
import type {Task} from '../../src/core/domain/task.ts';
import type {Notes} from '../../src/core/domain/notes.ts';

function makeTask(overrides?: Partial<Task>): Task {
    return {
        id: 'T-001',
        title: 'Test Task',
        status: 'running',
        objective: 'Do the thing',
        assignedRoles: ['planner'],
        relatedGoals: ['g1'],
        createdAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function makeProject(overrides?: {
    goals?: string[];
    constraints?: string[];
    planStatus?: 'draft' | 'approved' | 'superseded';
    phases?: string[];
    notes?: Partial<Notes>;
}): Project {
    return {
        meta: {
            version: 1,
            projectId: 'test-project',
            createdAt: '2026-01-01T00:00:00.000Z',
            lastUpdatedAt: '2026-01-01T00:00:00.000Z',
            status: 'active',
        },
        projectDoc: {
            title: 'Test Project',
            goals: overrides?.goals ?? ['Goal A', 'Goal B'],
            constraints: overrides?.constraints ?? [],
            nonGoals: [],
        },
        plan: {
            status: overrides?.planStatus ?? 'approved',
            phases: overrides?.phases ?? ['Phase 1', 'Phase 2'],
            notes: [],
        },
        notes: {
            projectNotes: [],
            assumptions: overrides?.notes?.assumptions ?? [],
            clarifications: overrides?.notes?.clarifications ?? [],
            lessonsLearned: overrides?.notes?.lessonsLearned ?? [],
        },
        tasks: [],
        decisions: [],
    };
}

describe('buildPromptContext', () => {
    it('includes all required sections with correct values', () => {
        const project = makeProject({
            goals: ['Ship MVP', 'Pass review'],
            planStatus: 'approved',
            phases: ['Design', 'Implement', 'Test'],
        });
        const task = makeTask({objective: 'Build the widget'});

        const ctx = buildPromptContext({project, task});

        expect(ctx.taskObjective).toBe('Build the widget');
        expect(ctx.goals).toEqual(['Ship MVP', 'Pass review']);
        expect(ctx.planExcerpt).toEqual([
            'Status: approved',
            'Design',
            'Implement',
            'Test',
        ]);
    });

    it('preserves goal order from project', () => {
        const project = makeProject({goals: ['Z goal', 'A goal', 'M goal']});
        const task = makeTask();

        const ctx = buildPromptContext({project, task});

        expect(ctx.goals).toEqual(['Z goal', 'A goal', 'M goal']);
    });

    it('includes constraints when present', () => {
        const project = makeProject({constraints: ['No external deps', 'Must be fast']});
        const task = makeTask();

        const ctx = buildPromptContext({project, task});

        expect(ctx.constraints).toEqual(['No external deps', 'Must be fast']);
    });

    it('returns empty constraints when none exist', () => {
        const project = makeProject({constraints: []});
        const task = makeTask();

        const ctx = buildPromptContext({project, task});

        expect(ctx.constraints).toEqual([]);
    });

    it('includes only assumptions and clarifications in notes', () => {
        const project = makeProject({
            notes: {
                assumptions: ['Assume X'],
                clarifications: ['Clarify Y'],
                lessonsLearned: ['Learned Z'],
            },
        });
        const task = makeTask();

        const ctx = buildPromptContext({project, task});

        expect(ctx.notes).toContain('Assume X');
        expect(ctx.notes).toContain('Clarify Y');
        expect(ctx.notes).not.toContain('Learned Z');
    });

    it('returns empty notes when assumptions and clarifications are empty', () => {
        const project = makeProject({
            notes: {
                assumptions: [],
                clarifications: [],
                lessonsLearned: ['Some lesson'],
            },
        });
        const task = makeTask();

        const ctx = buildPromptContext({project, task});

        expect(ctx.notes).toEqual([]);
    });

    it('truncates notes when exceeding MAX_NOTES_LINES', () => {
        const manyNotes = Array.from({length: 20}, (_, i) => `Note ${i + 1}`);
        const project = makeProject({
            notes: {
                assumptions: manyNotes,
                clarifications: [],
            },
        });
        const task = makeTask();

        const ctx = buildPromptContext({project, task});

        expect(ctx.notes.length).toBe(MAX_NOTES_LINES);
        expect(ctx.notes[ctx.notes.length - 1]).toBe(TRUNCATION_MARKER);
    });

    it('does not truncate notes at exactly MAX_NOTES_LINES', () => {
        const exactNotes = Array.from({length: MAX_NOTES_LINES}, (_, i) => `Note ${i + 1}`);
        const project = makeProject({
            notes: {
                assumptions: exactNotes,
                clarifications: [],
            },
        });
        const task = makeTask();

        const ctx = buildPromptContext({project, task});

        expect(ctx.notes.length).toBe(MAX_NOTES_LINES);
        expect(ctx.notes).not.toContain(TRUNCATION_MARKER);
    });

    it('throws when task objective is empty', () => {
        const project = makeProject();
        const task = makeTask({objective: ''});

        expect(() => buildPromptContext({project, task})).toThrow(
            'Task objective is required but was empty'
        );
    });

    it('throws when task objective is whitespace-only', () => {
        const project = makeProject();
        const task = makeTask({objective: '   '});

        expect(() => buildPromptContext({project, task})).toThrow(
            'Task objective is required but was empty'
        );
    });

    it('throws when project goals are empty', () => {
        const project = makeProject({goals: []});
        const task = makeTask();

        expect(() => buildPromptContext({project, task})).toThrow(
            'Project goals are required but were empty'
        );
    });

    it('trims whitespace from task objective', () => {
        const project = makeProject();
        const task = makeTask({objective: '  Build it  '});

        const ctx = buildPromptContext({project, task});

        expect(ctx.taskObjective).toBe('Build it');
    });

    it('produces deterministic output for identical input', () => {
        const project = makeProject({
            goals: ['G1', 'G2'],
            constraints: ['C1'],
            phases: ['P1', 'P2'],
            notes: {assumptions: ['A1'], clarifications: ['CL1']},
        });
        const task = makeTask({objective: 'Do something'});

        const ctx1 = buildPromptContext({project, task});
        const ctx2 = buildPromptContext({project, task});

        expect(ctx1).toEqual(ctx2);
    });
});
