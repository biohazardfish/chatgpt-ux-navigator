import {appendFile, mkdir, readFile, rename} from 'node:fs/promises';
import {extname, join} from 'node:path';

type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

type DebugRecord = {
    timestamp: string;
    level: DebugLevel;
    category: string;
    event: string;
    meta?: Record<string, unknown>;
};

type DebugLoggerState = {
    enabled: boolean;
    logDir: string;
    writeChain: Promise<void>;
    rawSampleEvery: number;
    rawCounter: number;
    clientLogs: Map<string, ClientLogState>;
};

type ClientLogState = {
    filePath: string;
    lineCount: number;
};

export const DEBUG_LOG_RAW_SAMPLE_EVERY = 20;
export const DEBUG_LOG_MAX_LINES = 100_000;
export const DEBUG_LOG_STRING_LIMIT = 500;
export const DEBUG_LOG_ARRAY_LIMIT = 20;
export const DEBUG_LOG_OBJECT_KEYS_LIMIT = 40;

const state: DebugLoggerState = {
    enabled: false,
    logDir: '',
    writeChain: Promise.resolve(),
    rawSampleEvery: DEBUG_LOG_RAW_SAMPLE_EVERY,
    rawCounter: 0,
    clientLogs: new Map(),
};

function extractClientId(meta: Record<string, unknown> | undefined): string {
    const raw = meta?.clientId;
    if (typeof raw !== 'string') return 'server';
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : 'server';
}

function sanitizeClientIdForFile(clientId: string): string {
    const clean = clientId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    if (clean.length === 0) return 'server';
    return clean;
}

function clientLogFilePath(clientId: string): string {
    const safeClientId = sanitizeClientIdForFile(clientId);
    return join(state.logDir, `server-debug-${safeClientId}.jsonl`);
}

function countLines(content: string): number {
    if (content.length === 0) return 0;
    const newlineCount = content.split('\n').length - 1;
    if (content.endsWith('\n')) return newlineCount;
    return newlineCount + 1;
}

async function getOrInitClientLogState(clientId: string): Promise<ClientLogState> {
    const existing = state.clientLogs.get(clientId);
    if (existing) return existing;

    const filePath = clientLogFilePath(clientId);
    let lineCount = 0;
    try {
        const content = await readFile(filePath, 'utf8');
        lineCount = countLines(content);
    } catch {
        lineCount = 0;
    }

    const next: ClientLogState = {filePath, lineCount};
    state.clientLogs.set(clientId, next);
    return next;
}

async function rotateIfNeeded(clientLog: ClientLogState): Promise<void> {
    if (clientLog.lineCount < DEBUG_LOG_MAX_LINES) return;

    const ext = extname(clientLog.filePath) || '.jsonl';
    const base = ext ? clientLog.filePath.slice(0, -ext.length) : clientLog.filePath;
    const rotatedPath = `${base}.${Date.now()}${ext}`;

    try {
        await rename(clientLog.filePath, rotatedPath);
    } catch {
        // Ignore rename failures and continue writing a fresh file.
    }

    clientLog.lineCount = 0;
}

function truncateString(value: string): string {
    if (value.length <= DEBUG_LOG_STRING_LIMIT) return value;
    return `${value.slice(0, DEBUG_LOG_STRING_LIMIT)}... [truncated ${value.length - DEBUG_LOG_STRING_LIMIT} chars]`;
}

function sanitizeValue(value: unknown, depth: number = 0): unknown {
    if (value == null) return value;

    if (typeof value === 'string') {
        return truncateString(value);
    }

    if (typeof value !== 'object') {
        return value;
    }

    if (depth > 5) {
        return '[max_depth]';
    }

    if (Array.isArray(value)) {
        const result: unknown[] = [];
        const limit = Math.min(value.length, DEBUG_LOG_ARRAY_LIMIT);
        for (let i = 0; i < limit; i += 1) {
            result.push(sanitizeValue(value[i], depth + 1));
        }
        if (value.length > DEBUG_LOG_ARRAY_LIMIT) {
            result.push(`[truncated ${value.length - DEBUG_LOG_ARRAY_LIMIT} items]`);
        }
        return result;
    }

    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const out: Record<string, unknown> = {};
    const limit = Math.min(keys.length, DEBUG_LOG_OBJECT_KEYS_LIMIT);

    for (let i = 0; i < limit; i += 1) {
        const key = keys[i];
        if (!key) continue;
        const val = obj[key];

        if (/base64/i.test(key) && typeof val === 'string') {
            out[key] = `[base64 length=${val.length}]`;
            continue;
        }

        out[key] = sanitizeValue(val, depth + 1);
    }

    if (keys.length > DEBUG_LOG_OBJECT_KEYS_LIMIT) {
        out._truncated_keys = keys.length - DEBUG_LOG_OBJECT_KEYS_LIMIT;
    }

    return out;
}

function writeRecord(record: DebugRecord, printToConsole: boolean): void {
    const line = JSON.stringify(record) + '\n';
    const clientId = extractClientId(record.meta);
    state.writeChain = state.writeChain
        .then(async () => {
            const clientLog = await getOrInitClientLogState(clientId);
            await rotateIfNeeded(clientLog);
            await appendFile(clientLog.filePath, line, 'utf8');
            clientLog.lineCount += 1;
        })
        .catch(err => {
            console.warn('[debug] failed to append log line', String(err));
        });

    if (!printToConsole) return;

    const method =
        record.level === 'warn' || record.level === 'error' ? console.error : console.log;
    method(`[${record.category}]`, record.event, JSON.stringify(record.meta || {}));
}

function shouldPrintToConsole(level: DebugLevel): boolean {
    return level !== 'debug';
}

function makeRecord(
    category: string,
    event: string,
    meta: Record<string, unknown>,
    level: DebugLevel
): DebugRecord {
    const sanitizedMeta = sanitizeValue(meta) as Record<string, unknown>;
    return {
        timestamp: new Date().toISOString(),
        level,
        category,
        event,
        meta: sanitizedMeta,
    };
}

export async function configureDebugLogger(enabled: boolean, logDir: string): Promise<void> {
    state.enabled = enabled;
    state.logDir = logDir;
    state.rawCounter = 0;
    state.clientLogs.clear();

    if (!enabled) {
        return;
    }

    try {
        await mkdir(state.logDir, {recursive: true});
    } catch (err) {
        console.warn('[debug] failed to create log directory', String(err));
    }
}

export function isDebugEnabled(): boolean {
    return state.enabled;
}

export function getDebugLogDir(): string {
    return state.logDir;
}

export async function flushDebugLogs(): Promise<void> {
    await state.writeChain;
}

export function debugLog(
    category: string,
    event: string,
    meta: Record<string, unknown> = {},
    level: DebugLevel = 'debug'
): void {
    if (!state.enabled) return;

    const record = makeRecord(category, event, meta, level);
    writeRecord(record, shouldPrintToConsole(level));
}

export function debugSummary(
    category: string,
    event: string,
    meta: Record<string, unknown> = {},
    level: DebugLevel = 'debug'
): void {
    debugLog(category, event, meta, level);
}

export function debugRaw(
    category: string,
    event: string,
    meta: Record<string, unknown> = {},
    opts: {force?: boolean; sampleEvery?: number} = {}
): boolean {
    if (!state.enabled) return false;

    const sampleEvery = opts.sampleEvery ?? state.rawSampleEvery;
    const force = opts.force === true;

    state.rawCounter += 1;
    const sampled = force || (sampleEvery > 0 && state.rawCounter % sampleEvery === 0);
    if (!sampled) return false;

    const record = makeRecord(category, event, meta, 'debug');
    writeRecord(record, false);
    return true;
}

export function sanitizeDebugMeta(meta: Record<string, unknown>): Record<string, unknown> {
    return sanitizeValue(meta) as Record<string, unknown>;
}
