import {resolve} from 'node:path';

export type AppConfig = {
    port: number;
    promptsDir: string;
    filesRoot: string;
    imagesDir: string;

    // If true, /responses will return a single JSON response (no SSE streaming),
    // regardless of request body `stream`.
    noStream: boolean;

    // If true, emit raw upstream events as response.event (for debugging).
    // Default: false (hides internal protocol events from clients).
    debugEvents: boolean;

    // Request timeout in seconds for agent/judge responses.
    // Default: 360 seconds (6 minutes).
    requestTimeout: number;

    // If true, emit server-side debug logs for response/WS flow.
    // Enabled by passing --debug to the server process.
    debugLogs: boolean;
};

export function makeConfig(partial: Partial<AppConfig>): AppConfig {
    return {
        port: partial.port ?? 8765,
        promptsDir: partial.promptsDir ?? process.cwd(),
        filesRoot: partial.filesRoot ?? process.cwd(),
        imagesDir: partial.imagesDir ?? resolve(process.cwd(), 'images'),
        noStream: partial.noStream ?? false,
        debugEvents: partial.debugEvents ?? false,
        requestTimeout: partial.requestTimeout ?? 360,
        debugLogs: partial.debugLogs ?? false,
    };
}
