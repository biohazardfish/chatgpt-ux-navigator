import {expect, describe, it, beforeEach, afterEach} from 'bun:test';
import {rm, mkdir, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createTask, markBlocked, updateTaskStatus} from '../../src/storage/task.ts';
import {TASK_FILE, TASKS_DIR, REPORTS_DIR} from '../../src/storage/layout.ts';
import {parseTask} from '../../src/core/parsing/task.ts';
import type {Config} from '../../src/config/config.ts';

const TEST_STATE_DIR = join(import.meta.dir, 'test_state');

const mockConfig: Config = {
    serverBaseUrl: 'http://localhost:8765',
    stateDir: TEST_STATE_DIR,
    projectsDir: join(TEST_STATE_DIR, 'projects'),
    runsDir: join(TEST_STATE_DIR, 'runs'),
    logsDir: join(TEST_STATE_DIR, 'logs'),
    logLevel: 'info',
};

describe('task storage', () => {
    beforeEach(async () => {
        await mkdir(mockConfig.projectsDir, {recursive: true});
    });

    afterEach(async () => {
        await rm(TEST_STATE_DIR, {recursive: true, force: true});
    });

    it('should create a task with sequential ID', async () => {
        const projectId = 'test-project';
        const taskId1 = await createTask(mockConfig, projectId, 'First Task');
        expect(taskId1).toBe('T-001');

        const taskId2 = await createTask(mockConfig, projectId, 'Second Task');
        expect(taskId2).toBe('T-002');

        const taskPath1 = join(mockConfig.projectsDir, projectId, TASKS_DIR, taskId1);
        const taskFile1 = Bun.file(join(taskPath1, TASK_FILE));
        expect(await taskFile1.exists()).toBe(true);

        const content1 = await taskFile1.text();
        expect(content1).toContain('# Task T-001 — First Task');
        expect(content1).toContain('# Status\n');
        expect(content1).toContain('pending');

        const parsed = parseTask(content1);
        expect(parsed.id).toBe('T-001');
        expect(parsed.title).toBe('First Task');
        expect(parsed.status).toBe('pending');

        const reportsDir1 = join(taskPath1, REPORTS_DIR);
        const reportsStat = await stat(reportsDir1);
        expect(reportsStat.isDirectory()).toBe(true);
    });

    it('should update task status', async () => {
        const projectId = 'test-project';
        const taskId = await createTask(mockConfig, projectId, 'Status Test');

        await updateTaskStatus(mockConfig, projectId, taskId, 'running');

        const taskFile = Bun.file(
            join(mockConfig.projectsDir, projectId, TASKS_DIR, taskId, TASK_FILE)
        );
        const content = await taskFile.text();
        expect(content).toContain('# Status\n');
        const parsed = parseTask(content);
        expect(parsed.status).toBe('running');
    });

    it('should reject invalid status values', async () => {
        const projectId = 'test-project';
        const taskId = await createTask(mockConfig, projectId, 'Invalid Status Test');

        expect(updateTaskStatus(mockConfig, projectId, taskId, 'in_progress')).rejects.toThrow(
            /Invalid task status/i
        );
    });

    it('should preserve other metadata when updating status', async () => {
        const projectId = 'test-project';
        const taskId = await createTask(mockConfig, projectId, 'Metadata Test');

        const taskFilePath = join(mockConfig.projectsDir, projectId, TASKS_DIR, taskId, TASK_FILE);
        const originalContent = await Bun.file(taskFilePath).text();
        const originalParsed = parseTask(originalContent);

        await updateTaskStatus(mockConfig, projectId, taskId, 'completed');

        const updatedContent = await Bun.file(taskFilePath).text();
        const updatedParsed = parseTask(updatedContent);

        expect(updatedParsed.status).toBe('completed');
        expect(updatedParsed.id).toBe(originalParsed.id);
        expect(updatedParsed.title).toBe(originalParsed.title);
        expect(updatedParsed.objective).toBe(originalParsed.objective);
        expect(updatedParsed.assignedRoles).toEqual(originalParsed.assignedRoles);
        expect(updatedParsed.relatedGoals).toEqual(originalParsed.relatedGoals);
        expect(updatedParsed.createdAt).toBe(originalParsed.createdAt);
    });

    it('marks a task blocked with deterministic reason', async () => {
        const projectId = 'test-project';
        const taskId = await createTask(mockConfig, projectId, 'Blocked Test');

        await markBlocked(mockConfig, projectId, taskId, 'Waiting on dependency');
        await markBlocked(mockConfig, projectId, taskId, 'Waiting on approval');

        const taskFilePath = join(mockConfig.projectsDir, projectId, TASKS_DIR, taskId, TASK_FILE);
        const content = await Bun.file(taskFilePath).text();

        const parsed = parseTask(content);
        expect(parsed.status).toBe('blocked');

        const reasonMatches = content.match(/# Blocked Reason/g) ?? [];
        expect(reasonMatches.length).toBe(1);
        expect(content).toContain('Waiting on approval');
        expect(content).not.toContain('Waiting on dependency');
    });
});
