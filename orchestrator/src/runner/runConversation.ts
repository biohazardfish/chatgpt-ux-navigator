/**
 * Core runner engine for Nexus orchestration
 * Implements deterministic round-robin execution with per-agent pending inbox queues
 *
 * Based on Ticket 002 — Core Runner Engine spec
 */

import type {AppConfig} from '../config/types';
import type {
    AgentMessage,
    AgentCallInput,
    InboxItem,
    JudgeRecord,
    RunnerDeps,
    RunResult,
    RunState,
    ResumeState,
} from './types';

/**
 * Execute a conversation run from a validated AppConfig
 *
 * @param config - Validated application configuration (from Ticket 001)
 * @param deps - Injected dependencies (callAgent, callJudge, nowISO)
 * @returns Promise<RunResult> - Final transcript, judge records, and stop reason
 * @throws Error if configuration is invalid or dependencies fail
 */
export async function runConversation(config: AppConfig, deps: RunnerDeps): Promise<RunResult> {
    // Validate dependencies
    if (config.judge.enabled && !deps.callJudge) {
        throw new Error('Missing dependency: callJudge');
    }

    const logger = deps.jsonLogger;

    await logger?.info('runner', 'run_start', {
        max_turns: config.termination.max_turns,
        judge_enabled: config.judge.enabled,
        agents: config.workflow.order,
    });

    const state = initializeState(config);

    await logger?.debug('runner', 'state_initialized', {
        starting_agent: config.workflow.start,
        agent_count: config.workflow.order.length,
    });

    return runConversationInternal(config, deps, state, {
        round: 1,
        turnsInRound: 0,
        roundStartIndex: 0,
    });
}

/**
 * Resume a conversation run from an existing state
 */
export async function runConversationFromState(
    config: AppConfig,
    deps: RunnerDeps,
    resume: ResumeState
): Promise<RunResult> {
    if (config.judge.enabled && !deps.callJudge) {
        throw new Error('Missing dependency: callJudge');
    }

    const logger = deps.jsonLogger;

    await logger?.info('runner', 'run_resume', {
        turn: resume.state.turn,
        round: resume.round,
        turns_in_round: resume.turns_in_round,
        transcript_length: resume.state.transcript.length,
    });

    if (resume.state.turn > config.termination.max_turns) {
        await logger?.warn('runner', 'resume_already_completed', {
            turn: resume.state.turn,
            max_turns: config.termination.max_turns,
        });

        return {
            transcript: resume.state.transcript,
            judge: resume.state.judge_records,
            stop_reason: 'max_turns',
            total_turns: resume.state.transcript.length,
        };
    }

    return runConversationInternal(config, deps, resume.state, {
        round: resume.round,
        turnsInRound: resume.turns_in_round,
        roundStartIndex: resume.round_start_index,
        fullContextInbox: resume.full_context_inbox,
    });
}

async function runConversationInternal(
    config: AppConfig,
    deps: RunnerDeps,
    state: RunState,
    runtime: {
        round: number;
        turnsInRound: number;
        roundStartIndex: number;
        fullContextInbox?: InboxItem[];
    }
): Promise<RunResult> {
    const logger = deps.jsonLogger;

    const agentsPerRound = config.workflow.order.length;
    let turnsInRound = runtime.turnsInRound;
    let round = runtime.round;
    let abortAfterRound = false;
    let roundStartIndex = runtime.roundStartIndex;

    while (true) {
        const speaker = config.workflow.order[state.speaker_idx];

        await logger?.debug('runner', 'turn_start', {
            turn: state.turn,
            round,
            speaker,
            speaker_idx: state.speaker_idx,
            turns_in_round: turnsInRound,
        });

        // Deliver inbox to current speaker
        const fullContextInbox = runtime.fullContextInbox;
        const inbox = fullContextInbox ?? state.pending[speaker];
        state.pending[speaker] = [];

        if (fullContextInbox) {
            runtime.fullContextInbox = undefined;
            await logger?.info('runner', 'resume_full_context_used', {
                turn: state.turn,
                speaker,
                inbox_size: inbox.length,
            });
        }

        await logger?.debug('runner', 'inbox_delivered', {
            turn: state.turn,
            speaker,
            inbox_size: inbox.length,
            inbox_turns: inbox.map(i => i.turn),
        });

        // Call agent with current turn and inbox
        let agentOutput;
        let agentFailed = false;
        try {
            const client_id = config.agents[speaker].client_id;

            await logger?.debug('runner', 'agent_call_start', {
                turn: state.turn,
                agent_id: speaker,
                client_id,
                inbox_size: inbox.length,
            });

            agentOutput = await deps.callAgent({
                agent_id: speaker,
                client_id,
                turn: state.turn,
                inbox,
            });

            await logger?.info('runner', 'agent_call_success', {
                turn: state.turn,
                agent_id: speaker,
                client_id,
                content_length: agentOutput.content.length,
            });
        } catch (error) {
            // Properly extract error message
            let errorMsg: string;
            let errorStack: string | undefined;
            let errorDetails: Record<string, unknown> = {};

            if (error instanceof Error) {
                errorMsg = error.message;
                errorStack = error.stack;
                errorDetails = {
                    name: error.name,
                };
            } else if (typeof error === 'string') {
                errorMsg = error;
            } else {
                // Handle objects or unknown error types
                try {
                    errorMsg = JSON.stringify(error);
                    errorDetails = {raw_error: error};
                } catch {
                    errorMsg = String(error);
                }
            }

            await logger?.error(
                'runner',
                'agent_call_failed',
                {
                    turn: state.turn,
                    agent_id: speaker,
                    client_id: config.agents[speaker].client_id,
                    round,
                    turns_in_round: turnsInRound,
                    error_details: errorDetails,
                },
                errorMsg
            );

            // Log full error stack for debugging
            if (errorStack) {
                await logger?.debug('runner', 'agent_error_stack', {
                    turn: state.turn,
                    agent_id: speaker,
                    stack: errorStack,
                });
            }

            // Agent failure: mark for abort after round completes
            agentFailed = true;
            abortAfterRound = true;

            await logger?.warn('runner', 'abort_after_round_scheduled', {
                turn: state.turn,
                round,
                reason: 'agent_failure',
            });
        }

        // Calculate next speaker index (needed for message delivery and state advancement)
        const next_idx = (state.speaker_idx + 1) % config.workflow.order.length;

        // Only process agent output if call succeeded
        if (!agentFailed) {
            // Validate agent output
            const content = agentOutput!.content.trim();
            if (!content || content.length === 0) {
                await logger?.error(
                    'runner',
                    'agent_output_invalid',
                    {
                        turn: state.turn,
                        agent_id: speaker,
                    },
                    'Agent returned empty content'
                );

                throw new Error(`Agent output invalid: ${speaker} turn ${state.turn}`);
            }

            // Append to transcript
            const message: AgentMessage = {
                turn: state.turn,
                speaker,
                content: agentOutput!.content,
                created_at: deps.nowISO(),
            };
            state.transcript.push(message);

            await logger?.debug('runner', 'message_added_to_transcript', {
                turn: state.turn,
                speaker,
                transcript_length: state.transcript.length,
            });

            // Write turn to disk immediately if writer is provided
            if (deps.writeTurn) {
                // Calculate which turns this agent received
                const received_turns: number[] = [];
                for (const item of inbox) {
                    if (item.turn > 0) {
                        // Skip seed prompt (turn 0)
                        received_turns.push(item.turn);
                    }
                }

                await logger?.debug('runner', 'writing_turn_to_disk', {
                    turn: state.turn,
                    speaker,
                    received_turns,
                });

                await deps.writeTurn(message, received_turns);

                await logger?.debug('runner', 'turn_written_to_disk', {
                    turn: state.turn,
                    speaker,
                });
            }

            // Queue this message for all other agents.
            // This ensures that when an agent speaks, they receive all messages that arrived
            // since they last spoke (chronological), not just the immediately previous speaker.
            const recipients: string[] = [];
            for (const agentId of config.workflow.order) {
                if (agentId === speaker) continue;
                state.pending[agentId].push({
                    turn: state.turn,
                    from: speaker,
                    content: agentOutput!.content,
                });
                recipients.push(agentId);
            }

            await logger?.debug('runner', 'message_queued_for_recipients', {
                turn: state.turn,
                from: speaker,
                recipients,
                recipient_inbox_sizes: Object.fromEntries(
                    recipients.map(id => [id, state.pending[id].length])
                ),
            });
        }

        turnsInRound++;

        // End-of-round processing
        if (turnsInRound >= agentsPerRound) {
            await logger?.info('runner', 'round_complete', {
                round,
                total_turns: state.transcript.length,
            });

            // Invoke judge exactly once per completed round
            if (config.judge.enabled && deps.callJudge) {
                const roundTranscript = state.transcript.slice(roundStartIndex);

                await logger?.debug('runner', 'judge_call_start', {
                    round,
                    transcript_length: state.transcript.length,
                    round_transcript_length: roundTranscript.length,
                });

                const decision = await deps.callJudge({
                    turn: round,
                    transcript: state.transcript,
                    round_transcript: roundTranscript,
                });

                await logger?.info('runner', 'judge_call_success', {
                    round,
                    should_stop: decision.should_stop,
                    scores: decision.scores,
                });

                const record: JudgeRecord = {
                    turn: round,
                    decision,
                    created_at: deps.nowISO(),
                };
                state.judge_records.push(record);

                // Write judge record to disk immediately if writer is provided
                if (deps.writeJudge) {
                    await logger?.debug('runner', 'writing_judge_to_disk', {
                        round,
                    });

                    await deps.writeJudge(record.turn, record.decision, record.created_at);

                    await logger?.debug('runner', 'judge_written_to_disk', {
                        round,
                    });
                }

                if (config.termination.judge_stop && decision.should_stop) {
                    await logger?.info('runner', 'run_stopped_by_judge', {
                        round,
                        total_turns: state.transcript.length,
                        reason: decision.reason,
                    });

                    return {
                        transcript: state.transcript,
                        judge: state.judge_records,
                        stop_reason: 'judge_stop',
                        total_turns: state.transcript.length,
                    };
                }
            }

            if (abortAfterRound) {
                await logger?.warn('runner', 'run_stopped_by_agent_failure', {
                    round,
                    total_turns: state.transcript.length,
                });

                return {
                    transcript: state.transcript,
                    judge: state.judge_records,
                    stop_reason: 'agent_failure',
                    total_turns: state.transcript.length,
                };
            }

            // Continue to next round

            turnsInRound = 0;
            round++;
            roundStartIndex = state.transcript.length;

            await logger?.debug('runner', 'round_start', {
                round,
                total_turns: state.transcript.length,
            });
        }

        // Check max turns termination (can stop mid-round; no judge invocation)
        if (state.turn >= config.termination.max_turns) {
            await logger?.info('runner', 'run_stopped_by_max_turns', {
                turn: state.turn,
                max_turns: config.termination.max_turns,
                total_turns: state.transcript.length,
            });

            return {
                transcript: state.transcript,
                judge: state.judge_records,
                stop_reason: 'max_turns',
                total_turns: state.transcript.length,
            };
        }

        // Advance state for next turn
        state.turn++;
        state.speaker_idx = next_idx;

        await logger?.debug('runner', 'turn_complete', {
            completed_turn: state.turn - 1,
            next_turn: state.turn,
            next_speaker: config.workflow.order[state.speaker_idx],
        });
    }
}

/**
 * Initialize runtime state from config
 * Sets up pending inbox queues and injects seed prompt
 */
function initializeState(config: AppConfig): RunState {
    // Initialize pending inbox for all agents
    const pending: Record<string, InboxItem[]> = {};
    for (const agent of config.workflow.order) {
        pending[agent] = [];
    }

    // Inject seed prompt into every agent's inbox.
    // Rationale: an agent's first turn should include the initial user goal/context,
    // i.e. all messages they've received since they last spoke (for first turn: since run start).
    for (const agent of config.workflow.order) {
        pending[agent].push({
            turn: 0,
            from: 'user',
            content: config.seed.content,
        });
    }

    // Find start agent for initial speaker index
    const startAgent = config.workflow.start;

    return {
        turn: 1,
        speaker_idx: config.workflow.order.indexOf(startAgent),
        pending,
        transcript: [],
        judge_records: [],
    };
}
