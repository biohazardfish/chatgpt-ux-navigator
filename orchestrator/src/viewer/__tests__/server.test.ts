import {afterEach, describe, expect, it} from 'bun:test';
import {mkdtemp, mkdir, rm, writeFile} from 'fs/promises';
import {join} from 'path';
import {tmpdir} from 'os';
import {startViewer} from '../server';

const TEST_PREFIX = 'nexus-viewer-server-';
let tempDir: string | null = null;
let server: Bun.Server | null = null;
let baseUrl = '';
let runsRoot = '';

afterEach(async () => {
    if (server) {
        server.stop();
        server = null;
    }

    if (tempDir) {
        await rm(tempDir, {recursive: true, force: true});
        tempDir = null;
    }
});

describe('viewer server', () => {
    it('GET /api/runs returns runs_root and list', async () => {
        await startTestServer();

        const response = await fetch(`${baseUrl}/api/runs`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.runs_root).toBe(runsRoot);
        expect(Array.isArray(body.runs)).toBe(true);
        expect(body.runs.length).toBe(1);
        expect(body.runs[0].folder_name).toBe('2026-02-12T10-00-00Z_a');
        expect(body.runs[0].run_id).toBe('a');
    });

    it('GET /api/run without run param returns 400', async () => {
        await startTestServer();

        const response = await fetch(`${baseUrl}/api/run`);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toContain('Missing required query parameter: run');
    });

    it('GET /api/run with traversal run returns 400', async () => {
        await startTestServer();

        const response = await fetch(`${baseUrl}/api/run?run=../x`);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toContain('Invalid run folder name');
    });

    it('GET /api/run for missing run returns 404', async () => {
        await startTestServer();

        const response = await fetch(`${baseUrl}/api/run?run=missing`);
        const body = await response.json();

        expect(response.status).toBe(404);
        expect(body.error).toBeTruthy();
    });

    it('static routes return expected content-type', async () => {
        await startTestServer();

        const htmlResponse = await fetch(`${baseUrl}/`);
        expect(htmlResponse.status).toBe(200);
        expect(htmlResponse.headers.get('content-type')).toContain('text/html');

        const jsResponse = await fetch(`${baseUrl}/app.js`);
        expect(jsResponse.status).toBe(200);
        expect(jsResponse.headers.get('content-type')).toContain('application/javascript');

        const cssResponse = await fetch(`${baseUrl}/viewer.css`);
        expect(cssResponse.status).toBe(200);
        expect(cssResponse.headers.get('content-type')).toContain('text/css');
    });
});

async function startTestServer(): Promise<void> {
    if (server) {
        return;
    }

    tempDir = await mkdtemp(join(tmpdir(), TEST_PREFIX));
    runsRoot = tempDir;

    const runDir = join(tempDir, '2026-02-12T10-00-00Z_a');
    await mkdir(join(runDir, 'messages'), {recursive: true});

    await writeFile(
        join(runDir, 'run.json'),
        JSON.stringify({
            run_id: 'a',
            started_at: '2026-02-12T10:00:00.000Z',
            total_turns: 1,
        }) + '\n',
        'utf-8'
    );

    await writeFile(
        join(runDir, 'messages/0001_alpha.md'),
        [
            '---',
            'turn: 1',
            'speaker: alpha',
            'client_id: client-1',
            'created_at: 2026-02-12T00:00:00.000Z',
            'received_turns: [0]',
            '---',
            '',
            'hello',
            '',
        ].join('\n'),
        'utf-8'
    );

    const port = 20000 + Math.floor(Math.random() * 20000);
    baseUrl = `http://127.0.0.1:${port}`;
    server = await startViewer({runsRoot, port});
}
