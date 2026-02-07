import {describe, it, expect, beforeEach, afterEach} from 'bun:test';
import {rm, mkdir, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createProject, loadProject, ProjectData} from '../../src/storage/project';
import {Config} from '../../src/config/config';

describe('Project Storage', () => {
    let testBaseDir: string;
    let config: Config;

    beforeEach(async () => {
        testBaseDir = join(tmpdir(), `nexus-test-${Math.random().toString(36).slice(2)}`);
        const projectsDir = join(testBaseDir, 'projects');
        await mkdir(projectsDir, {recursive: true});

        config = {
            serverBaseUrl: 'http://localhost:8765',
            stateDir: testBaseDir,
            projectsDir: projectsDir,
            runsDir: join(testBaseDir, 'runs'),
            logsDir: join(testBaseDir, 'logs'),
            logLevel: 'info',
        };
    });

    afterEach(async () => {
        await rm(testBaseDir, {recursive: true, force: true});
    });

    it('should create a project with correct structure', async () => {
        const projectId = 'test-project';
        const data: ProjectData = {
            title: 'Test Project',
            goals: ['Goal 1', 'Goal 2'],
            constraints: ['Constraint 1'],
            nonGoals: ['Non-Goal 1'],
        };

        await createProject(config, projectId, data);

        const projectDir = join(config.projectsDir, projectId);
        expect(await Bun.file(join(projectDir, 'meta.json')).exists()).toBe(true);
        expect(await Bun.file(join(projectDir, 'project.md')).exists()).toBe(true);
        expect(await Bun.file(join(projectDir, 'plan.md')).exists()).toBe(true);
        expect(await Bun.file(join(projectDir, 'notes.md')).exists()).toBe(true);

        expect((await stat(join(projectDir, 'decisions'))).isDirectory()).toBe(true);
        expect((await stat(join(projectDir, 'tasks'))).isDirectory()).toBe(true);
        expect((await stat(join(projectDir, 'reports'))).isDirectory()).toBe(true);

        const meta = JSON.parse(await Bun.file(join(projectDir, 'meta.json')).text());
        expect(meta.projectId).toBe(projectId);
        expect(meta.version).toBe(1);
        expect(meta.status).toBe('active');
        expect(meta.createdAt).toBeDefined();
    });

    it('should load a created project', async () => {
        const projectId = 'load-test';
        const data: ProjectData = {
            title: 'Load Test',
            goals: ['Goal 1'],
            constraints: [],
            nonGoals: [],
        };

        await createProject(config, projectId, data);
        const project = await loadProject(config, projectId);

        expect(project.meta.projectId).toBe(projectId);
        expect(project.meta.version).toBe(1);
        expect(project.projectMd).toContain('# Project: Load Test');
        expect(project.projectMd).toContain('- Goal 1');
        expect(project.planMd).toContain('# Current Plan');
        expect(project.notesMd).toContain('# Project Notes');
    });

    it('should throw error if project already exists', async () => {
        const projectId = 'existing-project';
        const data: ProjectData = {
            title: 'Existing',
            goals: [],
            constraints: [],
            nonGoals: [],
        };

        await createProject(config, projectId, data);
        expect(createProject(config, projectId, data)).rejects.toThrow(/already exists/);
    });

    it('should throw error if project ID is invalid', async () => {
        const data: ProjectData = {title: 'Invalid', goals: [], constraints: [], nonGoals: []};
        expect(createProject(config, 'Invalid ID', data)).rejects.toThrow(/Invalid project ID/);
    });
});
