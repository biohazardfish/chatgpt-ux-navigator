import {describe, it, expect} from 'bun:test';
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
    configureDebugLogger,
    debugLog,
    debugRaw,
    flushDebugLogs,
    DEBUG_LOG_MAX_LINES,
    DEBUG_LOG_STRING_LIMIT,
} from '../src/logging/debug';

async function readJsonLines(filePath: string): Promise<any[]> {
    const raw = await readFile(filePath, 'utf8');
    return raw
        .trim()
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line));
}

function clientLogPath(logDir: string, clientId: string): string {
    return join(logDir, `server-debug-${clientId}.jsonl`);
}

describe('debug logger', () => {
    it('does not write logs when disabled', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'cgpt-nav-debug-'));
        const logDir = join(dir, 'logs');
        const serverLogPath = clientLogPath(logDir, 'server');

        try {
            await configureDebugLogger(false, logDir);
            debugLog('test', 'disabled_log', {foo: 'bar'});
            await flushDebugLogs();

            let readFailed = false;
            try {
                await readFile(serverLogPath, 'utf8');
            } catch {
                readFailed = true;
            }

            expect(readFailed).toBe(true);
        } finally {
            await rm(dir, {recursive: true, force: true});
        }
    });

    it('writes one JSONL record when enabled', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'cgpt-nav-debug-'));
        const logDir = join(dir, 'logs');
        const serverLogPath = clientLogPath(logDir, 'server');

        try {
            await configureDebugLogger(true, logDir);
            debugLog('test', 'enabled_log', {answer: 42});
            await flushDebugLogs();

            const records = await readJsonLines(serverLogPath);
            const firstLine = records[0];
            if (!firstLine) {
                throw new Error('Missing JSONL log line');
            }
            const record = firstLine as {
                level: string;
                category: string;
                event: string;
                meta: {answer: number};
                timestamp: string;
            };

            expect(record.level).toBe('debug');
            expect(record.category).toBe('test');
            expect(record.event).toBe('enabled_log');
            expect(record.meta.answer).toBe(42);
            expect(typeof record.timestamp).toBe('string');
        } finally {
            await configureDebugLogger(false, logDir);
            await rm(dir, {recursive: true, force: true});
        }
    });

    it('samples raw logs instead of writing every frame', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'cgpt-nav-debug-'));
        const logDir = join(dir, 'logs');
        const clientLogPathA = clientLogPath(logDir, 'clientA');
        const clientLogPathB = clientLogPath(logDir, 'clientB');

        try {
            await configureDebugLogger(true, logDir);

            debugLog('test', 'client_a_event', {clientId: 'clientA'});
            debugLog('test', 'client_b_event', {clientId: 'clientB'});
            debugLog('test', 'client_a_event_2', {clientId: 'clientA'});

            for (let i = 1; i <= 10; i += 1) {
                debugRaw('sse.raw', 'frame_sample', {clientId: 'clientA', idx: i}, {sampleEvery: 3});
            }

            await flushDebugLogs();
            const recordsA = await readJsonLines(clientLogPathA);
            const recordsB = await readJsonLines(clientLogPathB);
            const samples = recordsA.filter(r => r.category === 'sse.raw');

            expect(recordsB.length).toBe(1);
            expect(recordsA.filter(r => r.event === 'client_a_event').length).toBe(1);
            expect(recordsA.filter(r => r.event === 'client_a_event_2').length).toBe(1);
            expect(samples.length).toBe(3);
            expect(samples.map(r => r.meta?.idx)).toEqual([3, 6, 9]);
        } finally {
            await configureDebugLogger(false, logDir);
            await rm(dir, {recursive: true, force: true});
        }
    });

    it('truncates oversized fields and redacts base64-like keys', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'cgpt-nav-debug-'));
        const logDir = join(dir, 'logs');
        const clientPath = clientLogPath(logDir, 'client_rotate');
        const veryLong = 'x'.repeat(DEBUG_LOG_STRING_LIMIT + 25);
        const fakeBase64 = 'a'.repeat(1024);

        try {
            await configureDebugLogger(true, logDir);
            debugLog('test', 'truncate', {
                clientId: 'client_rotate',
                longText: veryLong,
                dataBase64: fakeBase64,
            });
            await flushDebugLogs();

            const records = await readJsonLines(clientPath);
            const rec = records[0];

            expect(typeof rec.meta.longText).toBe('string');
            expect(String(rec.meta.longText)).toContain('[truncated');
            expect(rec.meta.dataBase64).toBe('[base64 length=1024]');
        } finally {
            await configureDebugLogger(false, logDir);
            await rm(dir, {recursive: true, force: true});
        }
    });

    it('rotates a client log when line limit is reached', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'cgpt-nav-debug-'));
        const logDir = join(dir, 'logs');
        const clientPath = clientLogPath(logDir, 'rotate_me');

        try {
            await mkdir(logDir, {recursive: true});
            await writeFile(clientPath, '{}\n'.repeat(DEBUG_LOG_MAX_LINES), 'utf8');
            await configureDebugLogger(true, logDir);

            debugLog('test', 'after_rotate', {clientId: 'rotate_me'});
            await flushDebugLogs();

            const currentRecords = await readJsonLines(clientPath);
            expect(currentRecords.length).toBe(1);
            expect(currentRecords[0]?.event).toBe('after_rotate');

            const entries = await readdir(logDir);
            const rotatedFiles = entries.filter(
                name =>
                    /^server-debug-rotate_me\.\d+\.jsonl$/.test(name) &&
                    name !== 'server-debug-rotate_me.jsonl'
            );
            expect(rotatedFiles.length).toBe(1);
        } finally {
            await configureDebugLogger(false, logDir);
            await rm(dir, {recursive: true, force: true});
        }
    });
});
