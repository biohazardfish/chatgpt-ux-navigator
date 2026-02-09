/**
 * Server-based judge caller factory
 * Creates a callJudge function that calls POST /responses/:clientId/new on the local @repo/server
 * Per Ticket 004 specification
 */

import type {AppConfig} from '../config/types';
import type {JudgeInput, JudgeDecision} from '../runner/types';
import {buildJudgePrompt} from './judgePromptBuilder';
import {parseJudgeResponse, isParseError} from './judgeResponseParser';
import {parseSSEStream, parseJSONResponse} from './sseParser';

/**
 * Creates a judge caller bound to the provided config
 * Returns a callJudge function that sends prompts to the local server
 *
 * @param config - Validated app configuration
 * @returns Object with callJudge method
 * @throws Error if judge is not enabled in config
 */
export function createServerJudgeCaller(config: AppConfig): {
    callJudge: (input: JudgeInput) => Promise<JudgeDecision>;
} {
    // Validate judge is enabled
    if (!config.judge.enabled) {
        throw new Error('Judge is disabled in config');
    }

    // Validate required judge config
    if (!config.judge.client_id || config.judge.client_id.trim() === '') {
        throw new Error('Judge client_id is required when judge is enabled');
    }

    if (!config.judge.rubric || config.judge.rubric.trim() === '') {
        throw new Error('Judge rubric is required when judge is enabled');
    }

    return {
        callJudge: async (input: JudgeInput): Promise<JudgeDecision> => {
            const {turn, transcript} = input;
            const clientId = config.judge.client_id!;

            // Build judge prompt (first attempt)
            let prompt: string;
            try {
                prompt = buildJudgePrompt(config, transcript, false);
            } catch (err) {
                throw new Error(
                    `Judge prompt building failed at turn ${turn}: ${err instanceof Error ? err.message : String(err)}`
                );
            }

            // First attempt - use /new to start fresh temporary chat
            let judgeResponse = await callJudgeOnce(config, clientId, prompt, turn, true);
            let parsed = parseJudgeResponse(judgeResponse, config);

            // If parse/validation failed, retry once with correction prompt
            if (isParseError(parsed)) {
                // Wait a bit for any page navigation to settle
                await new Promise(resolve => setTimeout(resolve, 2000));

                const retryPrompt = buildJudgePrompt(config, transcript, true);
                // Retry WITHOUT starting a new chat - reuse the existing temporary chat
                const retryResponse = await callJudgeOnce(
                    config,
                    clientId,
                    retryPrompt,
                    turn,
                    false
                );
                parsed = parseJudgeResponse(retryResponse, config);

                // Check if retry also failed
                if (isParseError(parsed)) {
                    throw new Error('Judge output invalid after retry');
                }
            }

            // Return the parsed decision
            // Note: created_at timestamp is added by the runner when storing JudgeRecord
            return parsed as JudgeDecision;
        },
    };
}

/**
 * Internal helper to make a single judge HTTP call
 * @returns The extracted response text
 * @throws Error with specific messages per spec
 */
async function callJudgeOnce(
    config: AppConfig,
    clientId: string,
    prompt: string,
    turn: number,
    useNewChat: boolean = true
): Promise<string> {
    const url = useNewChat
        ? `${config.server.url}/responses/${clientId}/new`
        : `${config.server.url}/responses/${clientId}`;
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

            if (response.status === 404) {
                throw new Error(`Server error: 404 - judge client '${clientId}' not connected`);
            } else if (response.status === 409) {
                throw new Error(
                    `Server error: 409 - judge client '${clientId}' already has an inflight request`
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
            content = parseSSEStream(body, `judge`, turn);
        } else if (contentType.includes('application/json')) {
            // JSON fallback mode
            const body = await response.text();
            content = parseJSONResponse(body, `judge`, turn);
        } else {
            // Unknown content type, try JSON first then SSE
            const body = await response.text();
            try {
                content = parseJSONResponse(body, `judge`, turn);
            } catch {
                // Fall back to SSE parsing
                content = parseSSEStream(body, `judge`, turn);
            }
        }

        if (!content || content.trim().length === 0) {
            throw new Error('Server judge returned empty content');
        }

        return content;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}
