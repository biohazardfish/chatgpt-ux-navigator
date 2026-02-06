/// <reference lib="dom" />
import {describe, it, expect, beforeEach, afterEach} from 'bun:test';
import {mkdir, rm, readdir, stat} from 'fs/promises';
import {join} from 'path';
import {tmpdir} from 'os';

import type {Config} from '../../src/config/config.ts';
import {executeSessionRun} from '../../src/server/runExecutor.ts';
import {ServerClientError} from '../../src/server/errors.ts';

type FetchFn = typeof globalThis.fetch;

describe('executeSessionRun', () => {
    let testBaseDir: string;
    let config: Config;
    let originalFetch: FetchFn;

    beforeEach(async () => {
        originalFetch = globalThis.fetch;
        testBaseDir = join(tmpdir(), `nexus-run-executor-${Math.random().toString(36).slice(2)}`);
        config = {
            serverBaseUrl: 'http://localhost:8765',
            stateDir: testBaseDir,
            projectsDir: join(testBaseDir, 'projects'),
            runsDir: join(testBaseDir, 'runs'),
            logsDir: join(testBaseDir, 'logs'),
            logLevel: 'info',
        };
        await mkdir(config.runsDir, {recursive: true});
    });

    afterEach(async () => {
        globalThis.fetch = originalFetch;
        await rm(testBaseDir, {recursive: true, force: true});
    });

    it('persists prompt/response/meta on success (temporary chat)', async () => {
        let seenUrl = '';
        globalThis.fetch = (async (input: Parameters<FetchFn>[0]) => {
            seenUrl = typeof input === 'string' ? input : input.toString();
            return new Response(JSON.stringify({output_text: 'OUT', status: 'ok'}), {
                status: 200,
                headers: {'Content-Type': 'application/json; charset=utf-8'},
            });
        }) as unknown as FetchFn;

        const result = await executeSessionRun({
            config,
            projectId: 'test-project',
            taskId: 'T-001',
            role: 'planner',
            responseId: 'planner',
            prompt: 'PROMPT',
            useTemporaryChat: true,
        });

        expect(seenUrl).toBe('http://localhost:8765/responses/planner/new');
        expect(result.runId).toMatch(/^\d{8}T\d{6}Z-planner$/);

        const promptPath = join(result.runDir, 'prompt.txt');
        const responsePath = join(result.runDir, 'response.txt');
        const metaPath = join(result.runDir, 'meta.json');

        expect(await Bun.file(promptPath).exists()).toBe(true);
        expect(await Bun.file(responsePath).exists()).toBe(true);
        expect(await Bun.file(metaPath).exists()).toBe(true);

        expect(await Bun.file(promptPath).text()).toBe('PROMPT');
        expect(await Bun.file(responsePath).text()).toBe('OUT');

        const meta = JSON.parse(await Bun.file(metaPath).text());
        expect(meta.status).toBe('success');
        expect(meta.runId).toBe(result.runId);
        expect(meta.projectId).toBe('test-project');
        expect(meta.taskId).toBe('T-001');
        expect(meta.role).toBe('planner');
        expect(meta.responseId).toBe('planner');
        expect(meta.startedAt).toMatch(/Z$/);
        expect(meta.completedAt).toMatch(/Z$/);

        const promptStat = await stat(promptPath);
        const responseStat = await stat(responsePath);
        const metaStat = await stat(metaPath);
        expect(metaStat.mtimeMs).toBeGreaterThanOrEqual(promptStat.mtimeMs);
        expect(metaStat.mtimeMs).toBeGreaterThanOrEqual(responseStat.mtimeMs);
    });

    it('writes meta.json with status:error and no response.txt on server error, then rethrows', async () => {
        globalThis.fetch = (async () => {
            return new Response('Not Found', {status: 404});
        }) as unknown as FetchFn;

        let caught: unknown;
        try {
            await executeSessionRun({
                config,
                projectId: 'test-project',
                role: 'planner',
                responseId: 'planner',
                prompt: 'PROMPT',
                useTemporaryChat: false,
            });
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(ServerClientError);
        const serverError = caught as ServerClientError;
        expect(serverError.kind).toBe('http_error');
        expect(serverError.status).toBe(404);

        const runDir = await getOnlyRunDir(config.runsDir, 'test-project');
        const promptPath = join(runDir, 'prompt.txt');
        const responsePath = join(runDir, 'response.txt');
        const metaPath = join(runDir, 'meta.json');

        expect(await Bun.file(promptPath).exists()).toBe(true);
        expect(await Bun.file(responsePath).exists()).toBe(false);
        expect(await Bun.file(metaPath).exists()).toBe(true);

        const meta = JSON.parse(await Bun.file(metaPath).text());
        expect(meta.status).toBe('error');
        expect(typeof meta.error).toBe('string');
        expect(meta.error).toContain('HTTP 404');
        expect(meta.role).toBe('planner');
        expect(meta.responseId).toBe('planner');

        const promptStat = await stat(promptPath);
        const metaStat = await stat(metaPath);
        expect(metaStat.mtimeMs).toBeGreaterThanOrEqual(promptStat.mtimeMs);
    });

    it('writes meta.json with status:timeout and no response.txt on timeout, then rethrows', async () => {
        globalThis.fetch = (async () => {
            const timeoutError = new Error('aborted');
            (timeoutError as any).name = 'AbortError';
            throw timeoutError;
        }) as unknown as FetchFn;

        let caught: unknown;
        try {
            await executeSessionRun({
                config,
                projectId: 'test-project',
                role: 'planner',
                responseId: 'planner',
                prompt: 'PROMPT',
                useTemporaryChat: true,
            });
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(ServerClientError);
        const serverError = caught as ServerClientError;
        expect(serverError.kind).toBe('timeout');

        const runDir = await getOnlyRunDir(config.runsDir, 'test-project');
        const responsePath = join(runDir, 'response.txt');
        const metaPath = join(runDir, 'meta.json');

        expect(await Bun.file(responsePath).exists()).toBe(false);
        expect(await Bun.file(metaPath).exists()).toBe(true);

        const meta = JSON.parse(await Bun.file(metaPath).text());
        expect(meta.status).toBe('timeout');
        expect(typeof meta.error).toBe('string');
    });
});

async function getOnlyRunDir(runsDir: string, projectId: string): Promise<string> {
    const projectRunsDir = join(runsDir, projectId);
    const entries = await readdir(projectRunsDir);
    expect(entries.length).toBe(1);
    return join(projectRunsDir, entries[0]);
}
