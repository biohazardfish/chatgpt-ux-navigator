import {describe, it, expect} from 'bun:test';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
    configureDebugLogger,
    debugLog,
    debugRaw,
    flushDebugLogs,
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

describe('debug logger', () => {
    it('does not write logs when disabled', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'cgpt-nav-debug-'));
        const logPath = join(dir, 'server-debug.jsonl');

        try {
            await configureDebugLogger(false, logPath);
            debugLog('test', 'disabled_log', {foo: 'bar'});
            await flushDebugLogs();

            let readFailed = false;
            try {
                await readFile(logPath, 'utf8');
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
        const logPath = join(dir, 'server-debug.jsonl');

        try {
            await configureDebugLogger(true, logPath);
            debugLog('test', 'enabled_log', {answer: 42});
            await flushDebugLogs();

            const records = await readJsonLines(logPath);
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
            await configureDebugLogger(false, logPath);
            await rm(dir, {recursive: true, force: true});
        }
    });

    it('samples raw logs instead of writing every frame', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'cgpt-nav-debug-'));
        const logPath = join(dir, 'server-debug.jsonl');

        try {
            await configureDebugLogger(true, logPath);

            for (let i = 1; i <= 10; i += 1) {
                debugRaw('sse.raw', 'frame_sample', {idx: i}, {sampleEvery: 3});
            }

            await flushDebugLogs();
            const records = await readJsonLines(logPath);
            const samples = records.filter(r => r.category === 'sse.raw');

            expect(samples.length).toBe(3);
            expect(samples.map(r => r.meta?.idx)).toEqual([3, 6, 9]);
        } finally {
            await configureDebugLogger(false, logPath);
            await rm(dir, {recursive: true, force: true});
        }
    });

    it('truncates oversized fields and redacts base64-like keys', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'cgpt-nav-debug-'));
        const logPath = join(dir, 'server-debug.jsonl');
        const veryLong = 'x'.repeat(DEBUG_LOG_STRING_LIMIT + 25);
        const fakeBase64 = 'a'.repeat(1024);

        try {
            await configureDebugLogger(true, logPath);
            debugLog('test', 'truncate', {
                longText: veryLong,
                dataBase64: fakeBase64,
            });
            await flushDebugLogs();

            const records = await readJsonLines(logPath);
            const rec = records[0];

            expect(typeof rec.meta.longText).toBe('string');
            expect(String(rec.meta.longText)).toContain('[truncated');
            expect(rec.meta.dataBase64).toBe('[base64 length=1024]');
        } finally {
            await configureDebugLogger(false, logPath);
            await rm(dir, {recursive: true, force: true});
        }
    });
});
