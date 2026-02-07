import {describe, it, expect, beforeEach, afterEach} from 'bun:test';
import {rm, mkdir, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Config} from '../../src/config/config';
import {recordDecision, DecisionRecordingError} from '../../src/storage/decisionRecorder';
import {parseDecision} from '../../src/core/parsing/decision';
import {DECISIONS_DIR, META_FILE} from '../../src/storage/layout';
import type {DecisionInput} from '../../src/core/domain/decision';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function makeConfig(baseDir: string): Config {
    return {
        serverBaseUrl: 'http://localhost:8765',
        stateDir: baseDir,
        projectsDir: join(baseDir, 'projects'),
        runsDir: join(baseDir, 'runs'),
        logsDir: join(baseDir, 'logs'),
        logLevel: 'info',
    };
}

function makeInput(overrides?: Partial<DecisionInput>): DecisionInput {
    return {
        projectId: 'test-project',
        title: 'Task T-005 Resolution',
        context: 'Task T-005 produced conflicting reports between Planner and Reviewer.',
        options: ['Accept as-is', 'Request revisions', 'Abort task'],
        decision: 'Accept as-is',
        rationale: 'All reports indicate successful completion.',
        consequences: ['Task is marked as completed', 'Work proceeds to downstream tasks'],
        ...overrides,
    };
}

async function setupProject(config: Config, projectId: string): Promise<void> {
    const projectDir = join(config.projectsDir, projectId);
    await mkdir(projectDir, {recursive: true});
    await mkdir(join(projectDir, DECISIONS_DIR), {recursive: true});

    const meta = {
        version: 1,
        projectId,
        createdAt: '2026-02-01T12:00:00Z',
        lastUpdatedAt: '2026-02-01T12:00:00Z',
        status: 'active',
    };
    await Bun.write(join(projectDir, META_FILE), JSON.stringify(meta, null, 2));
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('recordDecision', () => {
    let testBaseDir: string;
    let config: Config;

    beforeEach(async () => {
        testBaseDir = join(tmpdir(), `nexus-decision-rec-${Math.random().toString(36).slice(2)}`);
        config = makeConfig(testBaseDir);
        await mkdir(config.projectsDir, {recursive: true});
    });

    afterEach(async () => {
        await rm(testBaseDir, {recursive: true, force: true});
    });

    // -------------------------------------------------------------------------
    // Sequential numbering
    // -------------------------------------------------------------------------

    it('should assign 001 for the first decision', async () => {
        await setupProject(config, 'test-project');
        const input = makeInput();

        const decision = await recordDecision(config, input);

        expect(decision.id).toBe(1);
    });

    it('should increment sequential IDs for multiple decisions', async () => {
        await setupProject(config, 'test-project');

        const d1 = await recordDecision(config, makeInput({title: 'First Decision'}));
        const d2 = await recordDecision(config, makeInput({title: 'Second Decision'}));
        const d3 = await recordDecision(config, makeInput({title: 'Third Decision'}));

        expect(d1.id).toBe(1);
        expect(d2.id).toBe(2);
        expect(d3.id).toBe(3);
    });

    // -------------------------------------------------------------------------
    // File creation and naming
    // -------------------------------------------------------------------------

    it('should create a decision file with correct slug', async () => {
        await setupProject(config, 'test-project');
        const input = makeInput({taskId: 'T-005', title: 'Task T-005 Resolution'});

        await recordDecision(config, input);

        const decisionsDir = join(config.projectsDir, 'test-project', DECISIONS_DIR);
        const files = await readdir(decisionsDir);
        const decisionFiles = files.filter((f) => !f.startsWith('.'));

        expect(decisionFiles).toHaveLength(1);
        expect(decisionFiles[0]).toBe('001-task-t-005.md');
    });

    it('should use title for slug when taskId is not provided', async () => {
        await setupProject(config, 'test-project');
        const input = makeInput({taskId: undefined, title: 'Use Bun for Server'});

        await recordDecision(config, input);

        const decisionsDir = join(config.projectsDir, 'test-project', DECISIONS_DIR);
        const files = await readdir(decisionsDir);
        const decisionFiles = files.filter((f) => !f.startsWith('.'));

        expect(decisionFiles[0]).toBe('001-use-bun-for-server.md');
    });

    // -------------------------------------------------------------------------
    // File content and parseability
    // -------------------------------------------------------------------------

    it('should produce a file that matches DecisionInput fields', async () => {
        await setupProject(config, 'test-project');
        const input = makeInput();

        const decision = await recordDecision(config, input);

        expect(decision.title).toBe(input.title);
        expect(decision.context).toBe(input.context);
        expect(decision.options).toEqual(input.options);
        expect(decision.decision).toBe(input.decision);
        expect(decision.rationale).toBe(input.rationale);
        expect(decision.consequences).toEqual(input.consequences);
    });

    it('should write a file parseable by the decision parser', async () => {
        await setupProject(config, 'test-project');
        const input = makeInput();

        await recordDecision(config, input);

        const decisionsDir = join(config.projectsDir, 'test-project', DECISIONS_DIR);
        const files = await readdir(decisionsDir);
        const decisionFile = files.find((f) => !f.startsWith('.'));
        const filePath = join(decisionsDir, decisionFile!);
        const markdown = await Bun.file(filePath).text();

        const parsed = parseDecision(markdown, {path: filePath});

        expect(parsed.id).toBe(1);
        expect(parsed.title).toBe(input.title);
        expect(parsed.context).toBe(input.context);
        expect(parsed.options).toEqual(input.options);
        expect(parsed.decision).toBe(input.decision);
        expect(parsed.rationale).toBe(input.rationale);
        expect(parsed.consequences).toEqual(input.consequences);
    });

    it('should include a valid date in YYYY-MM-DD format', async () => {
        await setupProject(config, 'test-project');

        const decision = await recordDecision(config, makeInput());

        expect(decision.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    // -------------------------------------------------------------------------
    // Immutability — collision detection
    // -------------------------------------------------------------------------

    it('should never overwrite an existing decision file', async () => {
        await setupProject(config, 'test-project');
        const decisionsDir = join(config.projectsDir, 'test-project', DECISIONS_DIR);

        // Record two decisions with the same input — each should get a unique file
        const input = makeInput({taskId: 'T-005'});
        const d1 = await recordDecision(config, input);
        const d2 = await recordDecision(config, input);

        // IDs must be different (monotonic)
        expect(d1.id).toBe(1);
        expect(d2.id).toBe(2);

        // Both files must exist and have distinct content
        const files = (await readdir(decisionsDir)).filter((f) => !f.startsWith('.')).sort();
        expect(files).toHaveLength(2);
        expect(files[0]).toBe('001-task-t-005.md');
        expect(files[1]).toBe('002-task-t-005.md');

        // Verify the first file was not overwritten
        const content1 = await Bun.file(join(decisionsDir, files[0])).text();
        expect(content1).toContain('Decision 001');
    });

    // -------------------------------------------------------------------------
    // Metadata update
    // -------------------------------------------------------------------------

    it('should update meta.json lastUpdatedAt', async () => {
        await setupProject(config, 'test-project');
        const metaPath = join(config.projectsDir, 'test-project', META_FILE);
        const metaBefore = JSON.parse(await Bun.file(metaPath).text());
        const beforeTimestamp = metaBefore.lastUpdatedAt;

        // Small delay to ensure timestamp differs
        await new Promise((resolve) => setTimeout(resolve, 10));

        await recordDecision(config, makeInput());

        const metaAfter = JSON.parse(await Bun.file(metaPath).text());
        expect(metaAfter.lastUpdatedAt).not.toBe(beforeTimestamp);
        expect(new Date(metaAfter.lastUpdatedAt).getTime()).toBeGreaterThan(
            new Date(beforeTimestamp).getTime()
        );
    });

    it('should preserve other meta.json fields when updating', async () => {
        await setupProject(config, 'test-project');
        const metaPath = join(config.projectsDir, 'test-project', META_FILE);
        const metaBefore = JSON.parse(await Bun.file(metaPath).text());

        await recordDecision(config, makeInput());

        const metaAfter = JSON.parse(await Bun.file(metaPath).text());
        expect(metaAfter.version).toBe(metaBefore.version);
        expect(metaAfter.projectId).toBe(metaBefore.projectId);
        expect(metaAfter.createdAt).toBe(metaBefore.createdAt);
        expect(metaAfter.status).toBe(metaBefore.status);
    });

    // -------------------------------------------------------------------------
    // Atomic write behavior
    // -------------------------------------------------------------------------

    it('should not leave temp files after successful write', async () => {
        await setupProject(config, 'test-project');

        await recordDecision(config, makeInput());

        const decisionsDir = join(config.projectsDir, 'test-project', DECISIONS_DIR);
        const files = await readdir(decisionsDir);
        const tempFiles = files.filter((f) => f.startsWith('.tmp-'));

        expect(tempFiles).toHaveLength(0);
    });

    // -------------------------------------------------------------------------
    // Validation errors
    // -------------------------------------------------------------------------

    it('should throw on missing projectId', async () => {
        const input = makeInput({projectId: ''});
        await expect(recordDecision(config, input)).rejects.toThrow(DecisionRecordingError);
        await expect(recordDecision(config, input)).rejects.toThrow('projectId');
    });

    it('should throw on missing title', async () => {
        await setupProject(config, 'test-project');
        const input = makeInput({title: ''});
        await expect(recordDecision(config, input)).rejects.toThrow(DecisionRecordingError);
        await expect(recordDecision(config, input)).rejects.toThrow('title');
    });

    it('should throw on missing context', async () => {
        await setupProject(config, 'test-project');
        const input = makeInput({context: ''});
        await expect(recordDecision(config, input)).rejects.toThrow(DecisionRecordingError);
        await expect(recordDecision(config, input)).rejects.toThrow('context');
    });

    it('should throw on empty options array', async () => {
        await setupProject(config, 'test-project');
        const input = makeInput({options: []});
        await expect(recordDecision(config, input)).rejects.toThrow(DecisionRecordingError);
        await expect(recordDecision(config, input)).rejects.toThrow('options');
    });

    it('should throw on empty decision', async () => {
        await setupProject(config, 'test-project');
        const input = makeInput({decision: ''});
        await expect(recordDecision(config, input)).rejects.toThrow(DecisionRecordingError);
        await expect(recordDecision(config, input)).rejects.toThrow('decision');
    });

    it('should throw on empty rationale', async () => {
        await setupProject(config, 'test-project');
        const input = makeInput({rationale: ''});
        await expect(recordDecision(config, input)).rejects.toThrow(DecisionRecordingError);
        await expect(recordDecision(config, input)).rejects.toThrow('rationale');
    });

    it('should throw on empty consequences array', async () => {
        await setupProject(config, 'test-project');
        const input = makeInput({consequences: []});
        await expect(recordDecision(config, input)).rejects.toThrow(DecisionRecordingError);
        await expect(recordDecision(config, input)).rejects.toThrow('consequences');
    });

    it('should throw on missing meta.json', async () => {
        // Create project dir without meta.json
        const projectDir = join(config.projectsDir, 'no-meta');
        await mkdir(join(projectDir, DECISIONS_DIR), {recursive: true});

        const input = makeInput({projectId: 'no-meta'});
        await expect(recordDecision(config, input)).rejects.toThrow(DecisionRecordingError);
        await expect(recordDecision(config, input)).rejects.toThrow('meta.json');
    });

    // -------------------------------------------------------------------------
    // Security
    // -------------------------------------------------------------------------

    it('should reject project IDs that traverse outside projects root', async () => {
        const input = makeInput({projectId: '../../../etc'});
        await expect(recordDecision(config, input)).rejects.toThrow(DecisionRecordingError);
        await expect(recordDecision(config, input)).rejects.toThrow('outside projects root');
    });

    // -------------------------------------------------------------------------
    // Decisions directory auto-creation
    // -------------------------------------------------------------------------

    it('should create decisions directory if it does not exist', async () => {
        // Create project with meta.json but no decisions dir
        const projectDir = join(config.projectsDir, 'test-project');
        await mkdir(projectDir, {recursive: true});

        const meta = {
            version: 1,
            projectId: 'test-project',
            createdAt: '2026-02-01T12:00:00Z',
            lastUpdatedAt: '2026-02-01T12:00:00Z',
            status: 'active',
        };
        await Bun.write(join(projectDir, META_FILE), JSON.stringify(meta, null, 2));

        const decision = await recordDecision(config, makeInput());

        expect(decision.id).toBe(1);

        const decisionsDir = join(projectDir, DECISIONS_DIR);
        const files = await readdir(decisionsDir);
        expect(files.filter((f) => !f.startsWith('.'))).toHaveLength(1);
    });
});
