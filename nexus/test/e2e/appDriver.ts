/**
 * App driver for E2E smoke tests.
 *
 * Provides helpers to set up a temp project on disk, write tasks,
 * build a Config, and load fixture report text. This module does NOT
 * mock anything — mocking is the caller's responsibility.
 */

import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import type {Config} from '../../src/config/config.ts';
import {createProject} from '../../src/storage/project.ts';
import {
    PLAN_FILE,
    TASKS_DIR,
    TASK_FILE,
} from '../../src/storage/layout.ts';
import type {Role} from '../../src/core/domain/role.ts';

// ---------------------------------------------------------------------------
// Config helper
// ---------------------------------------------------------------------------

export function makeTestConfig(stateDir: string): Config {
    return {
        serverBaseUrl: 'http://localhost:8765',
        stateDir,
        projectsDir: join(stateDir, 'projects'),
        runsDir: join(stateDir, 'runs'),
        logsDir: join(stateDir, 'logs'),
        logLevel: 'info',
    };
}

// ---------------------------------------------------------------------------
// Project setup
// ---------------------------------------------------------------------------

export interface SetupProjectOpts {
    goals?: string[];
    constraints?: string[];
    nonGoals?: string[];
    /** If true the plan status is set to "approved" (required for task assignment). */
    approvePlan?: boolean;
    planPhases?: string[];
}

/**
 * Create a project skeleton on disk using the real `createProject` storage
 * function, then optionally overwrite `plan.md` so the plan status is
 * "Approved" (required by `assignTaskForExecution`).
 */
export async function setupProject(
    config: Config,
    projectId: string,
    opts: SetupProjectOpts = {}
): Promise<void> {
    // Ensure projectsDir exists
    await mkdir(config.projectsDir, {recursive: true});

    await createProject(config, projectId, {
        title: projectId,
        goals: opts.goals ?? ['Deliver MVP end-to-end'],
        constraints: opts.constraints ?? [],
        nonGoals: opts.nonGoals ?? [],
    });

    if (opts.approvePlan) {
        const phases = opts.planPhases ?? ['- Phase 1: core implementation'];
        const planMd = [
            '# Current Plan',
            '',
            '# Status',
            '',
            'Approved',
            '',
            '# Phases',
            '',
            ...phases,
            '',
            '# Notes',
            '',
        ].join('\n');

        const planPath = join(config.projectsDir, projectId, PLAN_FILE);
        await Bun.write(planPath, planMd);
    }
}

// ---------------------------------------------------------------------------
// Task writing
// ---------------------------------------------------------------------------

export interface WriteTaskOpts {
    objective: string;
    roles: Role[];
    status?: string;
    relatedGoals?: string[];
}

/**
 * Write a task.md file at the expected path for a given task ID.
 * Uses the markdown format that `parseTask` requires.
 */
export async function writeTask(
    config: Config,
    projectId: string,
    taskId: string,
    opts: WriteTaskOpts
): Promise<void> {
    const status = opts.status ?? 'pending';
    const relatedGoals = opts.relatedGoals ?? ['Deliver MVP end-to-end'];

    const taskDir = join(config.projectsDir, projectId, TASKS_DIR, taskId);
    await mkdir(join(taskDir, 'reports'), {recursive: true});

    const markdown = [
        `# Task ${taskId} — E2E smoke test task`,
        '',
        '# Status',
        status,
        '',
        '# Objective',
        opts.objective,
        '',
        '# Assigned Roles',
        ...opts.roles.map(r => `- ${r}`),
        '',
        '# Related Goals',
        ...relatedGoals.map(g => `- ${g}`),
        '',
        '# Created At',
        '2026-02-08T00:00:00.000Z',
        '',
    ].join('\n');

    await Bun.write(join(taskDir, TASK_FILE), markdown);
}

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(import.meta.dir, '..', 'fixtures', 'reports');

export async function loadFixture(name: string): Promise<string> {
    const fixturePath = join(FIXTURES_DIR, name);
    const file = Bun.file(fixturePath);
    if (!(await file.exists())) {
        throw new Error(`Fixture not found: ${fixturePath}`);
    }
    return file.text();
}
