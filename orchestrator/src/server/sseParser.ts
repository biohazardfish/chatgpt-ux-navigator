/**
 * Response parser for OpenAI-compatible JSON responses
 * Handles JSON mode only (SSE parsing removed after migration to JSON-only)
 * Per Ticket 003 specification
 */

/**
 * Parsed SSE event structure
 */
type SSEEvent = {
    event: string;
    data: Record<string, unknown>;
};

/**
 * @deprecated SSE parsing is no longer used. Orchestrator now uses JSON-only responses.
 * This function is kept for backward compatibility and testing only.
 *
 * Parses a complete SSE stream and extracts the response text
 * Handles OpenAI Responses API format with priority:
 * 1. response.completed → data.response.output_text
 * 2. response.output_text.done → data.text
 * 3. Accumulated deltas from response.output_text.delta
 *
 * @param body - The response body as text
 * @param agentId - Agent ID for error context
 * @param turn - Turn number for error context
 * @returns The extracted and trimmed response text
 * @throws Error if response is empty or parsing fails
 */
export function parseSSEStream(body: string, agentId: string, turn: number): string {
    let accumulatedText = '';
    let finalText: string | null = null;

    // Split body into lines and parse events
    const lines = body.split('\n');
    let currentEvent: SSEEvent | null = null;

    for (const line of lines) {
        if (line === '') {
            // Blank line marks end of event
            if (currentEvent) {
                const {event, data} = currentEvent;

                // Handle each event type per spec
                if (event === 'response.output_text.delta') {
                    const delta = data.delta as string | undefined;
                    if (delta) {
                        accumulatedText += delta;
                    }
                } else if (event === 'response.output_text.done') {
                    // Prefer this over accumulated deltas
                    finalText = (data.text as string) || '';
                } else if (event === 'response.completed') {
                    // Highest priority - full response object
                    const response = data.response as {output_text?: string | null} | undefined;
                    if (response?.output_text) {
                        finalText = response.output_text;
                    }
                } else if (event === 'response.error') {
                    // Extract error and throw with full details
                    const errorMsg =
                        (data.message as string) || (data.error as string) || 'Unknown error';
                    const errorDetails = JSON.stringify(data, null, 2);
                    throw new Error(
                        `Server agent error for ${agentId} turn ${turn}: ${errorMsg}\nDetails: ${errorDetails}`
                    );
                }
                // Ignore other events (informational)
            }
            currentEvent = null;
        } else if (line.startsWith('event: ')) {
            // Start new event
            const eventType = line.slice(7).trim();
            if (eventType === '[DONE]') {
                // Stream termination signal
                break;
            }
            currentEvent = {
                event: eventType,
                data: {},
            };
        } else if (line.startsWith('data: ') && currentEvent) {
            // Parse data line
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
                // Alternative stream termination
                break;
            }
            try {
                currentEvent.data = JSON.parse(dataStr);
            } catch {
                // Ignore parse errors in data lines
                // (some events may have unparseable data)
            }
        }
    }

    // Determine final text based on priority
    const extractedText = finalText ?? accumulatedText;
    const trimmed = extractedText.trimEnd();

    if (trimmed.length < 1) {
        throw new Error(`Server agent returned empty content: ${agentId} turn ${turn}`);
    }

    return trimmed;
}

/**
 * Parses a JSON response (non-streaming fallback)
 * Used when server responds with Content-Type: application/json
 *
 * @param body - The JSON response body as text
 * @param agentId - Agent ID for error context
 * @param turn - Turn number for error context
 * @returns The extracted and trimmed response text
 * @throws Error if response is empty or parsing fails
 */
export function parseJSONResponse(body: string, agentId: string, turn: number): string {
    let response: unknown;
    try {
        response = JSON.parse(body);
    } catch (err) {
        throw new Error(
            `Failed to parse JSON response for ${agentId} turn ${turn}: ${err instanceof Error ? err.message : String(err)}`
        );
    }

    // The server returns the response object directly (not nested under a "response" key)
    // Response structure: { id, status, output_text, output: [...], ... }
    const responseObj = response as {output_text?: string; status?: string; error?: unknown} | null;

    // Check for error status
    if (responseObj?.status === 'error') {
        // Extract error message from server response
        // Server error format: { error: { message: "..." } } or { error: "string" }
        let errorMsg = 'Unknown error';
        if (responseObj?.error) {
            if (typeof responseObj.error === 'string') {
                errorMsg = responseObj.error;
            } else if (typeof responseObj.error === 'object' && responseObj.error !== null) {
                const errorObj = responseObj.error as {message?: string};
                errorMsg = errorObj.message || JSON.stringify(responseObj.error);
            } else {
                errorMsg = String(responseObj.error);
            }
        }
        throw new Error(`Server agent error for ${agentId} turn ${turn}: ${errorMsg}`);
    }

    const outputText = responseObj?.output_text ?? '';
    const trimmed = String(outputText).trimEnd();

    if (trimmed.length < 1) {
        throw new Error(`Server agent returned empty content: ${agentId} turn ${turn}`);
    }

    return trimmed;
}
