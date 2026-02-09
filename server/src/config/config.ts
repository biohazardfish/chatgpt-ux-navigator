export type AppConfig = {
    port: number;
    promptsDir: string;
    filesRoot: string;

    // If true, /responses will return a single JSON response (no SSE streaming),
    // regardless of request body `stream`.
    noStream: boolean;

    // If true, emit raw upstream events as response.event (for debugging).
    // Default: false (hides internal protocol events from clients).
    debugEvents: boolean;

    // Request timeout in seconds for agent/judge responses.
    // Default: 360 seconds (6 minutes).
    requestTimeout: number;
};

export function makeConfig(partial: Partial<AppConfig>): AppConfig {
    return {
        port: partial.port ?? 8765,
        promptsDir: partial.promptsDir ?? process.cwd(),
        filesRoot: partial.filesRoot ?? process.cwd(),
        noStream: partial.noStream ?? false,
        debugEvents: partial.debugEvents ?? false,
        requestTimeout: partial.requestTimeout ?? 360,
    };
}
