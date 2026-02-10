/**
 * Server-based judge caller factory
 * Creates a callJudge function that calls POST /responses/:clientId/new on the local @repo/server
 * Per Ticket 004 specification
 */

import type {AppConfig} from '../config/types';
import type {JudgeInput, JudgeDecision} from '../runner/types';
import type {JSONLogger} from '../logging/jsonLogger';
import {buildJudgePrompt} from './judgePromptBuilder';
import {buildJudgeSummaryPrompt} from './judgeSummaryPromptBuilder';
import {parseJudgeResponse, isParseError} from './judgeResponseParser';
import {parseJudgeSummaryResponse, isSummaryParseError} from './judgeSummaryResponseParser';
import {parseJSONResponse} from './sseParser';

/**
 * Creates a judge caller bound to the provided config
 * Returns a callJudge function that sends prompts to the local server
 *
 * @param config - Validated app configuration
 * @param jsonLogger - Optional JSON logger for debugging
 * @returns Object with callJudge method
 * @throws Error if judge is not enabled in config
 */
export function createServerJudgeCaller(
    config: AppConfig,
    jsonLogger?: JSONLogger
): {
    callJudge: (input: JudgeInput) => Promise<JudgeDecision>;
} {
    let rollingSummary = '';

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

    if (config.judge.summary?.enabled && !config.judge.summary.prompt) {
        throw new Error('Judge summary prompt is required when summary is enabled');
    }

    return {
        callJudge: async (input: JudgeInput): Promise<JudgeDecision> => {
            const {turn, transcript, round_transcript} = input;
            const clientId = config.judge.client_id!;

            await jsonLogger?.debug('judge_caller', 'call_start', {
                round: turn,
                transcript_length: transcript.length,
                round_transcript_length: round_transcript.length,
                client_id: clientId,
            });

            if (config.judge.summary?.enabled) {
                const summaryWindow = config.judge.summary.window?.type ?? 'last_round';
                const summaryTranscript =
                    summaryWindow === 'last_n_turns'
                        ? transcript.slice(-((config.judge.summary.window?.n ?? 1)))
                        : round_transcript;

                const summaryPrompt = buildJudgeSummaryPrompt({
                    config,
                    roundIndex: turn,
                    rollingSummary,
                    roundTranscript: summaryTranscript,
                });

                await jsonLogger?.debug('judge_caller', 'summary_prompt_built', {
                    round: turn,
                    prompt_length: summaryPrompt.length,
                });

                let summaryResponse = await callJudgeOnce(
                    config,
                    clientId,
                    summaryPrompt,
                    turn,
                    true,
                    jsonLogger
                );

                let summaryParsed = parseJudgeSummaryResponse(summaryResponse);

                if (isSummaryParseError(summaryParsed)) {
                    const errorDetails =
                        'details' in summaryParsed
                            ? summaryParsed.details
                            : summaryParsed.type === 'empty_response'
                                ? 'Summary output was empty'
                                : 'Invalid summary output';

                    await jsonLogger?.warn('judge_caller', 'summary_parse_failed_retrying', {
                        round: turn,
                        error: errorDetails,
                    });

                    await new Promise(resolve => setTimeout(resolve, 2000));

                    const retryPrompt = `${summaryPrompt}\n\nYOUR PREVIOUS OUTPUT WAS INVALID.\nReturn only the rolling summary text with no extra wrappers.`;

                    summaryResponse = await callJudgeOnce(
                        config,
                        clientId,
                        retryPrompt,
                        turn,
                        true,
                        jsonLogger
                    );

                    summaryParsed = parseJudgeSummaryResponse(summaryResponse);

                    if (isSummaryParseError(summaryParsed)) {
                        const retryError =
                            'details' in summaryParsed
                                ? summaryParsed.details
                                : summaryParsed.type === 'empty_response'
                                    ? 'Summary output was empty'
                                    : 'Invalid summary output';
                        await jsonLogger?.error('judge_caller', 'summary_parse_failed_after_retry', {
                            round: turn,
                            error: retryError,
                        });
                        throw new Error('Judge summary output invalid after retry');
                    }

                    await jsonLogger?.info('judge_caller', 'summary_retry_succeeded', {
                        round: turn,
                    });
                }

                const maxChars = config.judge.summary.max_chars ?? 8000;
                const summaryValue = (summaryParsed as {rolling_summary: string}).rolling_summary;
                rollingSummary = summaryValue.slice(0, maxChars).trim();

                await jsonLogger?.info('judge_caller', 'summary_updated', {
                    round: turn,
                    summary_length: rollingSummary.length,
                });
            }

            // Build judge prompt (first attempt)
            let prompt: string;
            try {
                prompt = buildJudgePrompt(config, round_transcript, rollingSummary, turn, false);
                await jsonLogger?.debug('judge_caller', 'prompt_built', {
                    round: turn,
                    prompt_length: prompt.length,
                });
            } catch (err) {
                const errorMsg = `Judge prompt building failed at turn ${turn}: ${err instanceof Error ? err.message : String(err)}`;
                await jsonLogger?.error('judge_caller', 'prompt_build_failed', {
                    round: turn,
                }, errorMsg);
                throw new Error(errorMsg);
            }

            // First attempt - use /new to start fresh temporary chat
            await jsonLogger?.debug('judge_caller', 'first_attempt', {
                round: turn,
                use_new_chat: true,
            });

            let judgeResponse = await callJudgeOnce(config, clientId, prompt, turn, true, jsonLogger);
            let parsed = parseJudgeResponse(judgeResponse, config);

            // If parse/validation failed, retry once with correction prompt
            if (isParseError(parsed)) {
                const errorDetails = 'details' in parsed ? parsed.details : 'Invalid judge output';

                await jsonLogger?.warn('judge_caller', 'parse_failed_retrying', {
                    round: turn,
                    error: errorDetails,
                });

                // Wait a bit for any page navigation to settle
                await new Promise(resolve => setTimeout(resolve, 2000));

                const retryPrompt = buildJudgePrompt(
                    config,
                    round_transcript,
                    rollingSummary,
                    turn,
                    true,
                    errorDetails
                );
                await jsonLogger?.debug('judge_caller', 'retry_prompt_built', {
                    round: turn,
                    retry_prompt_length: retryPrompt.length,
                });

                // Retry WITHOUT starting a new chat - reuse the existing temporary chat
                const retryResponse = await callJudgeOnce(
                    config,
                    clientId,
                    retryPrompt,
                    turn,
                    false,
                    jsonLogger
                );
                parsed = parseJudgeResponse(retryResponse, config);

                // Check if retry also failed
                if (isParseError(parsed)) {
                    const retryErrorDetails = 'details' in parsed ? parsed.details : 'Invalid judge output';
                    await jsonLogger?.error('judge_caller', 'parse_failed_after_retry', {
                        round: turn,
                        error: retryErrorDetails,
                    });
                    throw new Error('Judge output invalid after retry');
                }

                await jsonLogger?.info('judge_caller', 'retry_succeeded', {
                    round: turn,
                });
            }

            await jsonLogger?.info('judge_caller', 'call_success', {
                round: turn,
                should_stop: (parsed as JudgeDecision).should_stop,
                scores: (parsed as JudgeDecision).scores,
            });

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
    useNewChat: boolean = true,
    jsonLogger?: JSONLogger
): Promise<string> {
    const url = useNewChat
        ? `${config.server.url}/responses/${clientId}/new`
        : `${config.server.url}/responses/${clientId}`;
    const requestBody = {
        input: prompt,
        stream: false,
    };

    await jsonLogger?.debug('judge_caller', 'http_request', {
        round: turn,
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

        await jsonLogger?.debug('judge_caller', 'http_response', {
            round: turn,
            status: response.status,
            content_type: response.headers.get('Content-Type'),
            response_time_ms: responseTime,
        });

        // Handle error responses
        if (!response.ok) {
            const errorBody = await response.text();
            const snippet = errorBody.slice(0, 500);

            await jsonLogger?.error('judge_caller', 'http_error', {
                round: turn,
                status: response.status,
                error_snippet: snippet.slice(0, 200),
            });

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

        // Parse response as JSON only (no SSE)
        const contentType = response.headers.get('Content-Type') || '';
        const responseBody = await response.text();

        await jsonLogger?.debug('judge_caller', 'response_body_received', {
            round: turn,
            body_length: responseBody.length,
            content_type: contentType,
        });

        const content = parseJSONResponse(responseBody, `judge`, turn);

        if (!content || content.trim().length === 0) {
            await jsonLogger?.error('judge_caller', 'empty_content', {
                round: turn,
            }, 'Judge returned empty content');
            throw new Error('Server judge returned empty content');
        }

        await jsonLogger?.info('judge_caller', 'http_success', {
            round: turn,
            content_length: content.length,
            response_time_ms: responseTime,
        });

        return content;
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
            await jsonLogger?.error('judge_caller', 'timeout', {
                turn,
                timeout_ms: timeoutSeconds * 1000,
                elapsed_ms: responseTime,
            }, `Request timed out after ${timeoutSeconds} seconds`);
        } else {
            await jsonLogger?.error('judge_caller', 'http_failed', {
                round: turn,
                elapsed_ms: responseTime,
                error_details: errorDetails,
            }, errorMsg);
        }

        throw err;
    }
}
