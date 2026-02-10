/**
 * Server-based agent caller factory
 * Creates a callAgent function that calls POST /responses/:clientId on the local @repo/server
 * Per Ticket 003 specification
 */

import type {AppConfig} from '../config/types';
import type {AgentCallInput, AgentCallOutput} from '../runner/types';
import type {JSONLogger} from '../logging/jsonLogger';
import {buildPrompt} from './promptBuilder';
import {parseJSONResponse} from './sseParser';

/**
 * Creates an agent caller bound to the provided config
 * Returns a callAgent function that sends prompts to the local server
 *
 * @param config - Validated app configuration
 * @param jsonLogger - Optional JSON logger for debugging
 * @returns Object with callAgent method
 */
export function createServerAgentCaller(
    config: AppConfig,
    jsonLogger?: JSONLogger
): {
    callAgent: (input: AgentCallInput) => Promise<AgentCallOutput>;
} {
    return {
        callAgent: async (input: AgentCallInput): Promise<AgentCallOutput> => {
            const {agent_id, client_id, turn, inbox} = input;

            await jsonLogger?.debug('agent_caller', 'call_start', {
                agent_id,
                client_id,
                turn,
                inbox_size: inbox.length,
            });

            // Get agent config for system prompt
            const agentConfig = config.agents[agent_id];
            if (!agentConfig) {
                const errorMsg = `Agent config not found for ${agent_id} turn ${turn}`;
                await jsonLogger?.error('agent_caller', 'config_not_found', {
                    agent_id,
                    turn,
                }, errorMsg);
                throw new Error(errorMsg);
            }

            // Build the prompt
            const prompt = buildPrompt(agentConfig.system, inbox);

            await jsonLogger?.debug('agent_caller', 'prompt_built', {
                agent_id,
                turn,
                prompt_length: prompt.length,
                inbox_items: inbox.length,
            });

            // Prepare the request
            const useNewChat = agentConfig.new_chat ?? false;
            const url = `${config.server.url}/responses/${client_id}${useNewChat ? '/new' : ''}`;
            const requestBody = {
                input: prompt,
                stream: false,
            };

            await jsonLogger?.debug('agent_caller', 'http_request', {
                agent_id,
                client_id,
                turn,
                url,
                use_new_chat: useNewChat,
                prompt_length: prompt.length,
            });

            // Create abort controller with configurable timeout (default 360 seconds)
            const timeoutSeconds = config.server.request_timeout ?? 360;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

            const requestStartTime = Date.now();

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal,
                });

                const responseTime = Date.now() - requestStartTime;

                clearTimeout(timeoutId);

                await jsonLogger?.debug('agent_caller', 'http_response', {
                    agent_id,
                    client_id,
                    turn,
                    status: response.status,
                    content_type: response.headers.get('Content-Type'),
                    response_time_ms: responseTime,
                });

                // Handle error responses
                if (!response.ok) {
                    const errorBody = await response.text();
                    const snippet = errorBody.slice(0, 500);

                    await jsonLogger?.error('agent_caller', 'http_error', {
                        agent_id,
                        client_id,
                        turn,
                        status: response.status,
                        error_snippet: snippet.slice(0, 200),
                    });

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

                // Parse response as JSON only (no SSE)
                const contentType = response.headers.get('Content-Type') || '';
                const responseBody = await response.text();

                await jsonLogger?.debug('agent_caller', 'response_body_received', {
                    agent_id,
                    turn,
                    body_length: responseBody.length,
                    content_type: contentType,
                });

                const content = parseJSONResponse(responseBody, agent_id, turn);

                await jsonLogger?.info('agent_caller', 'call_success', {
                    agent_id,
                    client_id,
                    turn,
                    content_length: content.length,
                    response_time_ms: responseTime,
                });

                return {content};
            } catch (err) {
                clearTimeout(timeoutId);

                const responseTime = Date.now() - requestStartTime;

                // Properly extract error message
                let errorMsg: string;
                let errorDetails: Record<string, unknown> = {};

                if (err instanceof Error) {
                    errorMsg = err.message;
                    errorDetails = {
                        name: err.name,
                        stack: err.stack,
                    };
                } else if (typeof err === 'string') {
                    errorMsg = err;
                } else {
                    // Handle objects or unknown error types
                    try {
                        errorMsg = JSON.stringify(err);
                        errorDetails = {raw_error: err};
                    } catch {
                        errorMsg = String(err);
                    }
                }

                // Handle abort (timeout)
                if (err instanceof Error && err.name === 'AbortError') {
                    const timeoutSeconds = config.server.request_timeout ?? 360;
                    await jsonLogger?.error('agent_caller', 'timeout', {
                        agent_id,
                        client_id,
                        turn,
                        timeout_ms: timeoutSeconds * 1000,
                        elapsed_ms: responseTime,
                    }, `Request timed out after ${timeoutSeconds} seconds`);

                    throw new Error(`Server request timeout for ${agent_id} turn ${turn}`);
                }

                // Log other errors with full details
                await jsonLogger?.error('agent_caller', 'call_failed', {
                    agent_id,
                    client_id,
                    turn,
                    elapsed_ms: responseTime,
                    error_details: errorDetails,
                }, errorMsg);

                // Re-throw original error
                throw err;
            }
        },
    };
}
