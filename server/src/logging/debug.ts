import {appendFile, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

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
    logFile: string;
    writeChain: Promise<void>;
    rawSampleEvery: number;
    rawCounter: number;
};

export const DEBUG_LOG_RAW_SAMPLE_EVERY = 20;
export const DEBUG_LOG_STRING_LIMIT = 500;
export const DEBUG_LOG_ARRAY_LIMIT = 20;
export const DEBUG_LOG_OBJECT_KEYS_LIMIT = 40;

const state: DebugLoggerState = {
    enabled: false,
    logFile: '',
    writeChain: Promise.resolve(),
    rawSampleEvery: DEBUG_LOG_RAW_SAMPLE_EVERY,
    rawCounter: 0,
};

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
    state.writeChain = state.writeChain
        .then(() => appendFile(state.logFile, line, 'utf8'))
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

export async function configureDebugLogger(enabled: boolean, logFile: string): Promise<void> {
    state.enabled = enabled;
    state.logFile = logFile;
    state.rawCounter = 0;

    if (!enabled) {
        return;
    }

    try {
        await mkdir(dirname(logFile), {recursive: true});
    } catch (err) {
        console.warn('[debug] failed to create log directory', String(err));
    }
}

export function isDebugEnabled(): boolean {
    return state.enabled;
}

export function getDebugLogFile(): string {
    return state.logFile;
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
