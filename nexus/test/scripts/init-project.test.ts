import {expect, describe, it, afterEach} from 'bun:test';
import {rm, readdir, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {parseProjectDoc} from '../../src/core/parsing/project.ts';
import {parsePlan} from '../../src/core/parsing/plan.ts';
import {parseNotes} from '../../src/core/parsing/notes.ts';
import {parseTask} from '../../src/core/parsing/task.ts';
import {parseDecision} from '../../src/core/parsing/decision.ts';
import {$ } from 'bun';

const TEST_STATE_DIR = join(import.meta.dir, 'init_test_state');
const SCRIPT_PATH = join(import.meta.dir, '..', '..', 'scripts', 'init-project.ts');

describe('init-project script', () => {
    afterEach(async () => {
        await rm(TEST_STATE_DIR, {recursive: true, force: true});
    });

    it('should create the full directory structure', async () => {
        await $`bun run ${SCRIPT_PATH} ${TEST_STATE_DIR} short-film`;

        const statDir = await stat(TEST_STATE_DIR);
        expect(statDir.isDirectory()).toBe(true);

        const projectDir = join(TEST_STATE_DIR, 'projects', 'short-film');

        // Check directories exist
        for (const dir of ['tasks', 'decisions', 'reports']) {
            const s = await stat(join(projectDir, dir));
            expect(s.isDirectory()).toBe(true);
        }

        for (const dir of ['runs', 'logs']) {
            const s = await stat(join(TEST_STATE_DIR, dir));
            expect(s.isDirectory()).toBe(true);
        }

        // Check task subdirectories
        for (const taskId of ['T-001', 'T-002', 'T-003']) {
            const s = await stat(join(projectDir, 'tasks', taskId));
            expect(s.isDirectory()).toBe(true);
        }
    });

    it('should create parseable project.md', async () => {
        await $`bun run ${SCRIPT_PATH} ${TEST_STATE_DIR} short-film`;

        const content = await Bun.file(
            join(TEST_STATE_DIR, 'projects', 'short-film', 'project.md')
        ).text();

        const doc = parseProjectDoc(content);
        expect(doc.title).toBe('Write a Short Film Script');
        expect(doc.goals.length).toBeGreaterThanOrEqual(3);
        expect(doc.constraints.length).toBeGreaterThanOrEqual(3);
        expect(doc.nonGoals.length).toBeGreaterThanOrEqual(1);
    });

    it('should create parseable plan.md', async () => {
        await $`bun run ${SCRIPT_PATH} ${TEST_STATE_DIR} short-film`;

        const content = await Bun.file(
            join(TEST_STATE_DIR, 'projects', 'short-film', 'plan.md')
        ).text();

        const plan = parsePlan(content);
        expect(plan.status).toBe('draft');
        expect(plan.phases.length).toBeGreaterThanOrEqual(3);
        expect(plan.notes.length).toBeGreaterThanOrEqual(1);
    });

    it('should create parseable notes.md', async () => {
        await $`bun run ${SCRIPT_PATH} ${TEST_STATE_DIR} short-film`;

        const content = await Bun.file(
            join(TEST_STATE_DIR, 'projects', 'short-film', 'notes.md')
        ).text();

        const notes = parseNotes(content);
        expect(notes.projectNotes.length).toBeGreaterThanOrEqual(1);
        expect(notes.assumptions.length).toBeGreaterThanOrEqual(1);
        expect(notes.clarifications.length).toBeGreaterThanOrEqual(1);
    });

    it('should create parseable task files', async () => {
        await $`bun run ${SCRIPT_PATH} ${TEST_STATE_DIR} short-film`;

        const tasksBase = join(TEST_STATE_DIR, 'projects', 'short-film', 'tasks');

        for (const taskId of ['T-001', 'T-002', 'T-003']) {
            const content = await Bun.file(join(tasksBase, taskId, 'task.md')).text();
            const task = parseTask(content);
            expect(task.id).toBe(taskId);
            expect(task.status).toBe('pending');
            expect(task.objective.length).toBeGreaterThan(0);
            expect(task.assignedRoles.length).toBeGreaterThanOrEqual(1);
            expect(task.relatedGoals.length).toBeGreaterThanOrEqual(1);
        }
    });

    it('should create parseable decision file', async () => {
        await $`bun run ${SCRIPT_PATH} ${TEST_STATE_DIR} short-film`;

        const content = await Bun.file(
            join(TEST_STATE_DIR, 'projects', 'short-film', 'decisions', '001-genre-and-setting.md')
        ).text();

        const decision = parseDecision(content);
        expect(decision.id).toBe(1);
        expect(decision.title).toBe('Genre and Setting');
        expect(decision.options.length).toBeGreaterThanOrEqual(2);
        expect(decision.consequences.length).toBeGreaterThanOrEqual(1);
    });

    it('should create valid meta.json', async () => {
        await $`bun run ${SCRIPT_PATH} ${TEST_STATE_DIR} short-film`;

        const content = await Bun.file(
            join(TEST_STATE_DIR, 'projects', 'short-film', 'meta.json')
        ).text();

        const meta = JSON.parse(content);
        expect(meta.id).toBe('short-film');
        expect(meta.status).toBe('active');
        expect(meta.createdAt).toBeDefined();
        expect(new Date(meta.createdAt).getTime()).not.toBeNaN();
    });

    it('should create config.jsonc with correct project reference', async () => {
        await $`bun run ${SCRIPT_PATH} ${TEST_STATE_DIR} short-film`;

        const content = await Bun.file(join(TEST_STATE_DIR, 'config.jsonc')).text();
        expect(content).toContain('"lastProjectId": "short-film"');
    });

    it('should not overwrite existing files (idempotent)', async () => {
        // First run
        await $`bun run ${SCRIPT_PATH} ${TEST_STATE_DIR} short-film`;

        // Modify a file
        const projectPath = join(TEST_STATE_DIR, 'projects', 'short-film', 'project.md');
        const original = await Bun.file(projectPath).text();
        const modified = original + '\n## Custom Section\n- My custom content\n';
        await Bun.write(projectPath, modified);

        // Second run
        await $`bun run ${SCRIPT_PATH} ${TEST_STATE_DIR} short-film`;

        // File should not be overwritten
        const afterSecondRun = await Bun.file(projectPath).text();
        expect(afterSecondRun).toBe(modified);
    });

    it('should accept a custom project id', async () => {
        await $`bun run ${SCRIPT_PATH} ${TEST_STATE_DIR} my-custom-project`;

        const projectDir = join(TEST_STATE_DIR, 'projects', 'my-custom-project');
        const s = await stat(projectDir);
        expect(s.isDirectory()).toBe(true);

        const content = await Bun.file(join(projectDir, 'project.md')).text();
        const doc = parseProjectDoc(content);
        expect(doc.title).toBe('Write a Short Film Script');
    });

    it('should reject invalid project ids', async () => {
        const result =
            await $`bun run ${SCRIPT_PATH} ${TEST_STATE_DIR} INVALID_ID`.nothrow().quiet();
        expect(result.exitCode).not.toBe(0);
    });
});
