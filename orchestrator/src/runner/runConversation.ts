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

    // Initialize runtime state
    const state = initializeState(config);

    // Main execution loop
    while (true) {
        // Get current speaker
        const speaker = config.workflow.order[state.speaker_idx];

        // Deliver inbox to current speaker
        const inbox = state.pending[speaker];
        state.pending[speaker] = [];

        // Call agent with current turn and inbox
        const client_id = config.agents[speaker].client_id;
        const agentOutput = await deps.callAgent({
            agent_id: speaker,
            client_id,
            turn: state.turn,
            inbox,
        });

        // Validate agent output
        const content = agentOutput.content.trim();
        if (!content || content.length === 0) {
            throw new Error(`Agent output invalid: ${speaker} turn ${state.turn}`);
        }

        // Append to transcript
        const message: AgentMessage = {
            turn: state.turn,
            speaker,
            content: agentOutput.content,
            created_at: deps.nowISO(),
        };
        state.transcript.push(message);

        // Deliver to next speaker only
        const next_idx = (state.speaker_idx + 1) % config.workflow.order.length;
        const next_speaker = config.workflow.order[next_idx];
        state.pending[next_speaker].push({
            turn: state.turn,
            from: speaker,
            content: agentOutput.content,
        });

        // Judge evaluation (if enabled)
        if (config.judge.enabled && deps.callJudge) {
            const decision = await deps.callJudge({
                turn: state.turn,
                transcript: state.transcript,
            });

            const record: JudgeRecord = {
                turn: state.turn,
                decision,
                created_at: deps.nowISO(),
            };
            state.judge_records.push(record);

            // Check if judge stops the run
            if (config.termination.judge_stop && decision.should_stop) {
                return {
                    transcript: state.transcript,
                    judge: state.judge_records,
                    stop_reason: 'judge_stop',
                    total_turns: state.transcript.length,
                };
            }
        }

        // Check max turns termination
        if (state.turn >= config.termination.max_turns) {
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

    // Find start agent and inject seed prompt
    const startAgent = config.workflow.start;
    pending[startAgent].push({
        turn: 0,
        from: 'user',
        content: config.seed.content,
    });

    return {
        turn: 1,
        speaker_idx: config.workflow.order.indexOf(startAgent),
        pending,
        transcript: [],
        judge_records: [],
    };
}
