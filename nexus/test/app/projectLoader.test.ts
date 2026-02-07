import {describe, it, expect, beforeEach, afterEach} from 'bun:test';
import {mkdtemp, rm, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import type {Config} from '../../src/config/config.ts';
import {
    DECISIONS_DIR,
    META_FILE,
    NOTES_FILE,
    PLAN_FILE,
    PROJECT_FILE,
    TASKS_DIR,
    TASK_FILE,
} from '../../src/storage/layout.ts';
import {listProjectIds, loadInitialProject, loadProjectById} from '../../src/app/projectLoader.ts';
import type {TaskStatus} from '../../src/core/domain/status.ts';

describe('projectLoader', () => {
    let tempDir: string;
    let config: Config;

    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'nexus-project-loader-'));
        config = {
            serverBaseUrl: 'http://localhost:8765',
            stateDir: tempDir,
            projectsDir: join(tempDir, 'projects'),
            runsDir: join(tempDir, 'runs'),
            logsDir: join(tempDir, 'logs'),
            logLevel: 'info',
        };
        await mkdir(config.projectsDir, {recursive: true});
    });

    afterEach(async () => {
        await rm(tempDir, {recursive: true, force: true});
    });

    it('lists valid project ids only', async () => {
        await createProjectFixture(config, {projectId: 'alpha-project'});
        await createProjectFixture(config, {projectId: 'demo-project'});
        await mkdir(join(config.projectsDir, 'invalid id'), {recursive: true});
        await Bun.write(join(config.projectsDir, 'README.md'), '# docs');

        const ids = await listProjectIds(config);

        expect(ids).toEqual(['alpha-project', 'demo-project']);
    });

    it('loader-success aggregates stats for valid project', async () => {
        const projectId = 'demo-dashboard';
        await createProjectFixture(config, {projectId});

        const result = await loadProjectById(config, projectId);
        expect(result.kind).toBe('success');

        if (result.kind !== 'success') {
            throw new Error('Expected loader success');
        }

        expect(result.project.meta.projectId).toBe(projectId);
        expect(result.project.tasks).toHaveLength(5);
        expect(result.summary.taskCounts.pending).toBe(2);
        expect(result.summary.taskCounts.running).toBe(1);
        expect(result.summary.taskCounts.blocked).toBe(1);
        expect(result.summary.taskCounts.completed).toBe(1);
        expect(result.summary.taskCounts.aborted).toBe(0);
        expect(result.summary.activityState).toBe('running');
        expect(result.summary.decisionCount).toBe(2);
        expect(result.summary.notesCounts.assumptions).toBe(2);
        expect(result.summary.notesCounts.clarifications).toBe(1);
        expect(result.summary.notesCounts.lessonsLearned).toBe(2);
        expect(result.summary.notesCounts.projectNotes).toBe(1);
        expect(result.summary.goalCount).toBe(3);
    });

    it('loader-error surfaces descriptive parse message', async () => {
        const projectId = 'broken-plan';
        await createProjectFixture(config, {projectId, invalidPlan: true});

        const result = await loadProjectById(config, projectId);
        expect(result.kind).toBe('error');
        if (result.kind !== 'error') {
            throw new Error('Expected loader error');
        }

        expect(result.errorMessage).toContain('Plan status is missing');
    });

    it('loader-fallback selects single project when preferred is missing', async () => {
        const projectId = 'solo-project';
        await createProjectFixture(config, {projectId});

        const result = await loadInitialProject({
            config,
            preferredProjectId: 'missing-project',
        });

        expect(result.projectId).toBe(projectId);
        expect(result.project).toBeDefined();
        expect(result.availableProjectIds).toEqual([projectId]);
    });

    it('loadInitialProject leaves selection undefined when multiple projects available', async () => {
        await createProjectFixture(config, {projectId: 'alpha'});
        await createProjectFixture(config, {projectId: 'bravo'});

        const result = await loadInitialProject({
            config,
            preferredProjectId: 'does-not-exist',
        });

        expect(result.projectId).toBeUndefined();
        expect(result.project).toBeUndefined();
        expect(result.availableProjectIds.sort()).toEqual(['alpha', 'bravo']);
    });
});

interface TaskSeed {
    id: string;
    status: TaskStatus;
    title?: string;
}

interface ProjectFixtureOptions {
    projectId: string;
    tasks?: TaskSeed[];
    invalidPlan?: boolean;
}

async function createProjectFixture(config: Config, options: ProjectFixtureOptions): Promise<void> {
    const projectDir = join(config.projectsDir, options.projectId);
    await mkdir(projectDir, {recursive: true});
    await mkdir(join(projectDir, TASKS_DIR), {recursive: true});
    await mkdir(join(projectDir, DECISIONS_DIR), {recursive: true});

    await Bun.write(
        join(projectDir, META_FILE),
        JSON.stringify(
            {
                version: 1,
                projectId: options.projectId,
                createdAt: '2026-02-01T00:00:00.000Z',
                lastUpdatedAt: '2026-02-02T00:00:00.000Z',
                status: 'active',
            },
            null,
            2
        )
    );

    await Bun.write(join(projectDir, PROJECT_FILE), buildProjectMarkdown());
    await Bun.write(join(projectDir, PLAN_FILE), buildPlanMarkdown(options.invalidPlan ?? false));
    await Bun.write(join(projectDir, NOTES_FILE), buildNotesMarkdown());

    const tasks = options.tasks ?? defaultTasks;
    for (const task of tasks) {
        await writeTask(projectDir, task);
    }

    await writeDecision(projectDir, 1, 'Adopt OpenTUI Layout');
    await writeDecision(projectDir, 2, 'Instrument Loader Errors');
}

const defaultTasks: TaskSeed[] = [
    {id: 'T-001', status: 'pending', title: 'Seed backlog'},
    {id: 'T-002', status: 'pending', title: 'Draft plan'},
    {id: 'T-003', status: 'running', title: 'Implement loader'},
    {id: 'T-004', status: 'blocked', title: 'Resolve parsing bug'},
    {id: 'T-005', status: 'completed', title: 'Write docs'},
];

function buildProjectMarkdown(): string {
    return [
        '# Project: Dashboard Improvements',
        '',
        '# Goals',
        '- Build loader',
        '- Wire TUI state',
        '- Render dashboard',
        '',
        '# Constraints',
        '- Read-only state',
        '',
        '# Non-Goals',
        '- Editing tasks',
        '',
    ].join('\n');
}

function buildPlanMarkdown(invalidStatus: boolean): string {
    const statusBody = invalidStatus ? '' : 'Approved';
    return [
        '# Current Plan',
        '',
        '# Status',
        statusBody,
        '',
        '# Phases',
        '1. Loader foundation',
        '2. State wiring',
        '3. Dashboard polish',
        '',
        '# Notes',
        '- Verify loader in isolation',
        '',
    ].join('\n');
}

function buildNotesMarkdown(): string {
    return [
        '# Project Notes',
        '- Loader boot sequence documented',
        '',
        '# Assumptions',
        '- Projects stored locally',
        '- Parsers validated',
        '',
        '# Clarifications',
        '- Dashboard stays read-only',
        '',
        '# Lessons Learned',
        '- Share summary helpers',
        '- Guard missing files',
        '',
    ].join('\n');
}

async function writeTask(projectDir: string, task: TaskSeed): Promise<void> {
    const taskDir = join(projectDir, TASKS_DIR, task.id);
    await mkdir(taskDir, {recursive: true});
    const content = [
        `# Task ${task.id} — ${task.title ?? task.id}`,
        '',
        '# Status',
        task.status,
        '',
        '# Objective',
        'Ensure loader correctness',
        '',
        '# Assigned Roles',
        '- planner',
        '',
        '# Related Goals',
        '- Build loader',
        '',
        '# Created At',
        '2026-02-01T00:00:00.000Z',
        '',
    ].join('\n');

    await Bun.write(join(taskDir, TASK_FILE), content);
}

async function writeDecision(projectDir: string, id: number, title: string): Promise<void> {
    const decisionsDir = join(projectDir, DECISIONS_DIR);
    await mkdir(decisionsDir, {recursive: true});
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const content = [
        `# Decision ${String(id).padStart(3, '0')} — ${title}`,
        '',
        '# Date',
        '2026-02-03',
        '',
        '# Context',
        'Need consistent loader behavior.',
        '',
        '# Options Considered',
        '- Throw on errors',
        '- Return descriptive error',
        '',
        '# Decision',
        'Return descriptive error',
        '',
        '# Rationale',
        'Keeps dashboard responsive.',
        '',
        '# Consequences',
        '- Requires new tests',
        '',
    ].join('\n');

    await Bun.write(join(decisionsDir, `${String(id).padStart(3, '0')}-${slug}.md`), content);
}
