/**
 * Server-based agent caller factory
 * Creates a callAgent function that calls POST /responses/:clientId on the local @repo/server
 * Per Ticket 003 specification
 */

import type {AppConfig} from '../config/types';
import type {AgentCallInput, AgentCallOutput} from '../runner/types';
import {buildPrompt} from './promptBuilder';
import {parseSSEStream, parseJSONResponse} from './sseParser';

/**
 * Creates an agent caller bound to the provided config
 * Returns a callAgent function that sends prompts to the local server
 *
 * @param config - Validated app configuration
 * @returns Object with callAgent method
 */
export function createServerAgentCaller(config: AppConfig): {
    callAgent: (input: AgentCallInput) => Promise<AgentCallOutput>;
} {
    return {
        callAgent: async (input: AgentCallInput): Promise<AgentCallOutput> => {
            const {agent_id, client_id, turn, inbox} = input;

            // Get agent config for system prompt
            const agentConfig = config.agents[agent_id];
            if (!agentConfig) {
                throw new Error(`Agent config not found for ${agent_id} turn ${turn}`);
            }

            // Build the prompt
            const prompt = buildPrompt(agentConfig.system, inbox);

            // Prepare the request
            const url = `${config.server.url}/responses/${client_id}`;
            const requestBody = {
                input: prompt,
                stream: true,
            };

            // Create abort controller for 120-second timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120 * 1000);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                // Handle error responses
                if (!response.ok) {
                    const errorBody = await response.text();
                    const snippet = errorBody.slice(0, 500);

                    if (response.status === 400) {
                        throw new Error(
                            `Server error: 400 - missing or invalid prompt for ${agent_id} turn ${turn}`
                        );
                    } else if (response.status === 404) {
                        throw new Error(
                            `Server error: 404 - client '${client_id}' not connected for ${agent_id} turn ${turn}`
                        );
                    } else if (response.status === 409) {
                        throw new Error(
                            `Server error: 409 - client '${client_id}' already has an inflight request for ${agent_id} turn ${turn}`
                        );
                    } else {
                        throw new Error(`Server error: ${response.status} ${snippet}`);
                    }
                }

                // Parse response based on content type
                const contentType = response.headers.get('Content-Type') || '';
                let content: string;

                if (contentType.includes('text/event-stream')) {
                    // SSE streaming mode
                    const body = await response.text();
                    content = parseSSEStream(body, agent_id, turn);
                } else if (contentType.includes('application/json')) {
                    // JSON fallback mode
                    const body = await response.text();
                    content = parseJSONResponse(body, agent_id, turn);
                } else {
                    // Unknown content type, try JSON first then SSE
                    const body = await response.text();
                    try {
                        content = parseJSONResponse(body, agent_id, turn);
                    } catch {
                        // Fall back to SSE parsing
                        content = parseSSEStream(body, agent_id, turn);
                    }
                }

                return {content};
            } catch (err) {
                clearTimeout(timeoutId);

                // Handle abort (timeout)
                if (err instanceof Error && err.name === 'AbortError') {
                    throw new Error(`Server request timeout for ${agent_id} turn ${turn}`);
                }

                // Re-throw other errors
                throw err;
            }
        },
    };
}
