import type {Project} from '../domain/project.ts';
import type {Task} from '../domain/task.ts';
import type {PromptContext} from './types.ts';
import {MAX_NOTES_LINES, truncateLines} from './limits.ts';

export interface BuildPromptContextParams {
    project: Project;
    task: Task;
}

/**
 * Build a deterministic PromptContext from a Project and Task.
 *
 * Selection rules:
 * - taskObjective: verbatim from task (required)
 * - goals: all project goals in order (required)
 * - planExcerpt: plan status + phase titles (required)
 * - constraints: from project constraints (optional, omit if empty)
 * - notes: only assumptions + clarifications (optional, truncated to MAX_NOTES_LINES)
 *
 * Throws if required data is missing.
 */
export function buildPromptContext(params: BuildPromptContextParams): PromptContext {
    const {project, task} = params;

    const objective = task.objective.trim();
    if (objective.length === 0) {
        throw new Error('Task objective is required but was empty');
    }

    const goals = project.projectDoc.goals;
    if (goals.length === 0) {
        throw new Error('Project goals are required but were empty');
    }

    const planStatus = project.plan.status;
    if (!planStatus) {
        throw new Error('Plan status is required but was missing');
    }

    const planExcerpt = [
        `Status: ${planStatus}`,
        ...project.plan.phases,
    ];

    const constraints = project.projectDoc.constraints;

    const rawNotes = [
        ...project.notes.assumptions,
        ...project.notes.clarifications,
    ];
    const notes = truncateLines(rawNotes, MAX_NOTES_LINES);

    return {
        taskObjective: objective,
        goals,
        planExcerpt,
        constraints,
        notes,
    };
}
