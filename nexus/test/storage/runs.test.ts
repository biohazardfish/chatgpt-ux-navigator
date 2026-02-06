/// <reference types="bun" />

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import type { Config } from '../../src/config/config.ts';
import {
    createRunDir,
    generateRunId,
    writeRunMeta,
    writeRunPrompt,
    writeRunResponse,
} from '../../src/storage/runs.ts';

describe('run storage', () => {
    let testBaseDir: string;
    let config: Config;

    beforeEach(async () => {
        testBaseDir = join(tmpdir(), `nexus-run-storage-${Math.random().toString(36).slice(2)}`);

        config = {
            serverBaseUrl: 'http://localhost:8765',
            stateDir: testBaseDir,
            projectsDir: join(testBaseDir, 'projects'),
            runsDir: join(testBaseDir, 'runs'),
            logsDir: join(testBaseDir, 'logs'),
            logLevel: 'info',
        };

        await mkdir(config.runsDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(testBaseDir, { recursive: true, force: true });
    });

    it('generateRunId should match YYYYMMDDTHHMMSSZ-role format', () => {
        const startedAt = new Date(Date.UTC(2026, 1, 1, 13, 12, 0));
        expect(generateRunId('planner', startedAt)).toBe('20260201T131200Z-planner');
    });

    it('should create run dir under runsDir', async () => {
        const runDir = await createRunDir(config, 'test-project', '20260201T131200Z-planner');
        expect(runDir).toContain(join(config.runsDir, 'test-project'));
        expect((await stat(runDir)).isDirectory()).toBe(true);
    });

    it('should reject path traversal via projectId', async () => {
        await expectAsyncThrow(
            () => createRunDir(config, '../escape', 'run1'),
            /Path traversal attempt detected/
        );
        await expectAsyncThrow(
            () => createRunDir(config, '../../escape', 'run1'),
            /Path traversal attempt detected/
        );
    });

    it('should reject path traversal via runId', async () => {
        await expectAsyncThrow(
            () => createRunDir(config, 'test-project', '../escape'),
            /Path traversal attempt detected/
        );
        await expectAsyncThrow(
            () => createRunDir(config, 'test-project', '../../escape'),
            /Path traversal attempt detected/
        );
    });

    it('should write prompt/response/meta files (success)', async () => {
        const runDir = await createRunDir(config, 'test-project', '20260201T131200Z-planner');
        await writeRunPrompt(runDir, 'PROMPT');
        await writeRunResponse(runDir, 'RESPONSE');
        await writeRunMeta(runDir, {
            runId: '20260201T131200Z-planner',
            projectId: 'test-project',
            role: 'planner',
            responseId: 'planner',
            startedAt: '2026-02-01T13:12:00Z',
            completedAt: '2026-02-01T13:12:47Z',
            status: 'success',
        });

        const promptFile = Bun.file(join(runDir, 'prompt.txt'));
        const responseFile = Bun.file(join(runDir, 'response.txt'));
        const metaFile = Bun.file(join(runDir, 'meta.json'));

        expect(await promptFile.exists()).toBe(true);
        expect(await responseFile.exists()).toBe(true);
        expect(await metaFile.exists()).toBe(true);

        expect(await promptFile.text()).toBe('PROMPT');
        expect(await responseFile.text()).toBe('RESPONSE');
        const meta = JSON.parse(await metaFile.text());
        expect(meta.status).toBe('success');
    });

    it('should not create response.txt unless explicitly written', async () => {
        const runDir = await createRunDir(config, 'test-project', '20260201T131201Z-planner');
        await writeRunPrompt(runDir, 'PROMPT');
        await writeRunMeta(runDir, { status: 'error', error: 'boom' });

        expect(await Bun.file(join(runDir, 'prompt.txt')).exists()).toBe(true);
        expect(await Bun.file(join(runDir, 'meta.json')).exists()).toBe(true);
        expect(await Bun.file(join(runDir, 'response.txt')).exists()).toBe(false);
    });

    it('should enforce allowed meta.status set', async () => {
        const runDir = await createRunDir(config, 'test-project', '20260201T131202Z-planner');
        await expectAsyncThrow(
            () => writeRunMeta(runDir, { status: 'nope' as any }),
            /Invalid run meta status/
        );
        expect(await Bun.file(join(runDir, 'meta.json')).exists()).toBe(false);
    });
});

async function expectAsyncThrow(fn: () => Promise<unknown>, message: RegExp): Promise<void> {
    try {
        await fn();
    } catch (e: any) {
        expect(String(e?.message ?? e)).toMatch(message);
        return;
    }
    throw new Error('Expected function to throw');
}
