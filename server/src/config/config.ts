import {resolve} from 'node:path';

export type AppConfig = {
    port: number;
    promptsDir: string;
    filesRoot: string;
    imagesDir: string;

    // If true, /responses will return a single JSON response (no SSE streaming),
    // regardless of request body `stream`.
    noStream: boolean;

    // If true, enable server debug diagnostics.
    // This includes server-side debug logs and raw upstream events as response.event.
    debug: boolean;

    // Optional JSONL file path for persisted debug logs.
    // Default: ./logs/server-debug.jsonl
    debugLogFile: string;

    // Request timeout in seconds for agent/judge responses.
    // Default: 360 seconds (6 minutes).
    requestTimeout: number;

};

export function makeConfig(partial: Partial<AppConfig>): AppConfig {
    return {
        port: partial.port ?? 8765,
        promptsDir: partial.promptsDir ?? process.cwd(),
        filesRoot: partial.filesRoot ?? process.cwd(),
        imagesDir: partial.imagesDir ?? resolve(process.cwd(), 'images'),
        noStream: partial.noStream ?? false,
        debug: partial.debug ?? false,
        debugLogFile:
            partial.debugLogFile ??
            resolve(process.cwd(), 'logs', 'server-debug.jsonl'),
        requestTimeout: partial.requestTimeout ?? 360,
    };
}
