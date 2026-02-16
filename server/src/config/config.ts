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

    // Optional directory for persisted debug logs.
    // Logs are written per client as server-debug-<clientId>.jsonl
    // and rotated when a file reaches 100_000 lines.
    // Default: ./logs
    debugLogDir: string;

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
        debugLogDir: partial.debugLogDir ?? resolve(process.cwd(), 'logs'),
        requestTimeout: partial.requestTimeout ?? 360,
    };
}
