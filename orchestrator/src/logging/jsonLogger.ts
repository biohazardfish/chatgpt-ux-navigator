/**
 * JSONL logger for debugging and diagnostics
 * Writes structured log events to logs.jsonl in the run directory
 */

import {appendFile} from 'fs/promises';
import {join} from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEvent = {
    timestamp: string; // ISO timestamp
    level: LogLevel;
    category: string; // e.g., 'runner', 'agent_caller', 'judge_caller', 'logger'
    event: string; // e.g., 'turn_start', 'agent_call', 'agent_response', 'error'
    data?: Record<string, unknown>; // arbitrary structured data
    error?: string; // error message if applicable
};

/**
 * JSONLogger interface for writing structured logs
 */
export type JSONLogger = {
    /**
     * Write a log event to logs.jsonl
     */
    log: (level: LogLevel, category: string, event: string, data?: Record<string, unknown>, error?: string) => Promise<void>;

    /**
     * Convenience methods for specific log levels
     */
    debug: (category: string, event: string, data?: Record<string, unknown>) => Promise<void>;
    info: (category: string, event: string, data?: Record<string, unknown>) => Promise<void>;
    warn: (category: string, event: string, data?: Record<string, unknown>, error?: string) => Promise<void>;
    error: (category: string, event: string, data?: Record<string, unknown>, error?: string) => Promise<void>;
};

/**
 * Create a JSON logger that writes to logs.jsonl in the run directory
 *
 * @param runDir - Absolute path to the run directory
 * @param debugMode - If true, also print debug logs to console
 * @param nowISO - Function to get current ISO timestamp (for testing)
 */
export function createJSONLogger(
    runDir: string,
    debugMode: boolean = false,
    nowISO: () => string = () => new Date().toISOString()
): JSONLogger {
    const logFilePath = join(runDir, 'logs.jsonl');

    const writeLog = async (logEvent: LogEvent): Promise<void> => {
        const line = JSON.stringify(logEvent) + '\n';

        // Write to file
        try {
            await appendFile(logFilePath, line, 'utf-8');
        } catch (error) {
            // If logging fails, print to stderr but don't crash
            console.error('Failed to write log:', error);
        }

        // Print to console if debug mode or if error/warn
        if (debugMode || logEvent.level === 'error' || logEvent.level === 'warn') {
            const prefix = `[${logEvent.timestamp}] [${logEvent.level.toUpperCase()}] [${logEvent.category}/${logEvent.event}]`;
            const dataStr = logEvent.data ? ` ${JSON.stringify(logEvent.data)}` : '';
            const errorStr = logEvent.error ? ` ERROR: ${logEvent.error}` : '';
            console.error(`${prefix}${dataStr}${errorStr}`);
        }
    };

    const log = async (
        level: LogLevel,
        category: string,
        event: string,
        data?: Record<string, unknown>,
        error?: string
    ): Promise<void> => {
        const logEvent: LogEvent = {
            timestamp: nowISO(),
            level,
            category,
            event,
            data,
            error,
        };
        await writeLog(logEvent);
    };

    return {
        log,
        debug: (category, event, data) => log('debug', category, event, data),
        info: (category, event, data) => log('info', category, event, data),
        warn: (category, event, data, error) => log('warn', category, event, data, error),
        error: (category, event, data, error) => log('error', category, event, data, error),
    };
}
