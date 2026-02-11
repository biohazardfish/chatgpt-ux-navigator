/**
 * Runtime types for the Nexus runner engine
 * Based on Ticket 002 — Core Runner Engine spec
 */

import type {AppConfig} from '../config/types';
import type {JSONLogger} from '../logging/jsonLogger';

/**
 * A single agent message in the transcript
 * 1-based turn numbering
 */
export type AgentMessage = {
    turn: number; // 1-based
    speaker: string; // agent id
    content: string; // markdown text
    created_at: string; // ISO timestamp
};

/**
 * A pending message in an agent's inbox
 * Delivered to agents who have not yet consumed it (since last spoke)
 */
export type InboxItem = {
    turn: number; // originating turn number (0 for seed)
    from: string; // agent id or "user"
    content: string; // markdown text
};

/**
 * Input passed to callAgent dependency
 */
export type AgentCallInput = {
    agent_id: string;
    client_id: string; // the WebSocket clientId for this agent (from config)
    turn: number;
    inbox: InboxItem[]; // all pending messages for this agent (chronological)
};

/**
 * Output received from callAgent dependency
 */
export type AgentCallOutput = {
    content: string; // markdown
};

/**
 * Input passed to callJudge dependency (if enabled)
 */
export type JudgeInput = {
    turn: number; // round number just completed
    transcript: AgentMessage[]; // full transcript up to end of round
    round_transcript: AgentMessage[]; // messages from the just-completed round
};

/**
 * Decision returned by callJudge dependency
 */
export type JudgeDecision = {
    should_stop: boolean;
    scores: Record<string, number>;
    reason: string;
};

/**
 * Injected dependencies for the runner
 */
export type RunnerDeps = {
    callAgent: (input: AgentCallInput) => Promise<AgentCallOutput>;
    callJudge?: (input: JudgeInput) => Promise<JudgeDecision>; // only used if judge.enabled=true
    nowISO: () => string; // deterministic time injection for tests
    jsonLogger?: JSONLogger; // optional JSON logger for debugging
    writeTurn?: (msg: AgentMessage, received_turns: number[]) => Promise<void>; // optional incremental turn writer
    writeJudge?: (turn: number, decision: JudgeDecision, created_at: string) => Promise<void>; // optional incremental judge writer
};

/**
 * A judge evaluation record (stored separately from transcript)
 */
export type JudgeRecord = {
    turn: number;
    decision: JudgeDecision;
    created_at: string; // deps.nowISO()
};

/**
 * Final output from a successful run
 * Errors are thrown, not returned
 */
export type RunResult = {
    transcript: AgentMessage[];
    judge: JudgeRecord[]; // empty if judge disabled
    stop_reason: 'max_turns' | 'judge_stop' | 'agent_failure';
    total_turns: number; // transcript.length
};

/**
 * Runtime state maintained during execution
 * (Internal to runner, not exposed publicly)
 */
export type RunState = {
    turn: number; // 1-based
    speaker_idx: number; // index into workflow.order
    pending: Record<string, InboxItem[]>; // per-agent inbox queues
    transcript: AgentMessage[];
    judge_records: JudgeRecord[];
};

/**
 * Resume state for continuing a run from disk
 */
export type ResumeState = {
    state: RunState;
    round: number;
    turns_in_round: number;
    round_start_index: number;
    full_context_inbox?: InboxItem[];
};
