/**
 * RunLogger types and utilities
 * Based on Ticket 005 — Run Logging & Output Artifacts spec
 */

import type {AppConfig} from '../config/types';
import type {AgentMessage, JudgeDecision} from '../runner/types';

/**
 * The RunLogger interface manages all file writes for a run execution
 */
export type RunLogger = {
    /**
     * Absolute or normalized path to the run folder
     */
    runDir: string;

    /**
     * Write a turn message to messages/<NNNN>_<speaker>.md and append to transcript.md
     * @param msg - The agent message to write
     * @param received_turns - Array of turn numbers that were delivered to the speaker inbox (in order)
     */
    writeTurn: (msg: AgentMessage, received_turns: number[]) => Promise<void>;

    /**
     * Write judge decision to judge/<NNNN>.json (only if judge enabled in config)
     * @param turn - The turn number (1-based)
     * @param decision - The judge decision object
     * @param created_at - ISO timestamp when judgment was created
     */
    writeJudge: (turn: number, decision: JudgeDecision, created_at: string) => Promise<void>;

    /**
     * Write final run metadata to run.json and close the logger
     * @param result - Run completion result including stop reason and timestamps
     */
    finalize: (result: {
        stop_reason: 'max_turns' | 'judge_stop' | 'agent_failure';
        total_turns: number;
        started_at: string;
        ended_at: string;
    }) => Promise<void>;
};

/**
 * Parameters for createRunLogger
 */
export type CreateRunLoggerParams = {
    /**
     * Original config file path provided to CLI (for reference only)
     */
    configPath: string;

    /**
     * Exact YAML text read from disk (written verbatim to config.yml)
     */
    configText: string;

    /**
     * Normalized and validated config object
     */
    config: AppConfig;

    /**
     * ISO timestamp at run start (deps.nowISO())
     */
    started_at: string;
};

/**
 * Internal metadata for run.json
 */
export type RunMetadata = {
    run_id: string;
    started_at: string;
    ended_at: string;
    stop_reason: 'max_turns' | 'judge_stop' | 'agent_failure';
    total_turns: number;
    server: {
        url: string;
    };
    agents: Array<{
        id: string;
        client_id: string;
    }>;
    workflow: {
        type: 'round_robin';
        order: string[];
        start: string;
    };
    delivery: {
        type: 'next_speaker';
    };
    judge: {
        enabled: boolean;
        client_id: string;
        eval_every_turn: boolean;
    };
    termination: {
        max_turns: number;
        judge_stop: boolean;
    };
};

/**
 * Format a timestamp as ISO8601 UTC BASIC format
 * Expected: YYYY-MM-DDTHH-mm-ssZ
 * E.g., 2026-02-08T14-32-10Z
 *
 * @param iso - ISO timestamp string
 * @returns formatted timestamp with hyphens instead of colons in time portion
 */
export function formatTimestampBasic(iso: string): string {
    // Input: 2026-02-08T14:32:10.123Z or 2026-02-08T14:32:10Z
    // Output: 2026-02-08T14-32-10Z
    const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (!match) {
        throw new Error(`Invalid ISO timestamp format: ${iso}`);
    }
    return `${match[1]}T${match[2]}-${match[3]}-${match[4]}Z`;
}

/**
 * Generate run folder name from timestamp and run ID
 * Format: <ISO8601_UTC_BASIC>_<run_id>
 *
 * @param timestamp - ISO timestamp (will be converted to basic format)
 * @param runId - Run ID from config
 * @returns folder name string
 */
export function generateRunFolderName(timestamp: string, runId: string): string {
    const basicTimestamp = formatTimestampBasic(timestamp);
    return `${basicTimestamp}_${runId}`;
}

/**
 * Format a turn number with zero-padding
 * E.g., 1 -> "0001", 42 -> "0042"
 *
 * @param turn - Turn number (1-based)
 * @returns zero-padded string (4 digits)
 */
export function formatTurnNumber(turn: number): string {
    return String(turn).padStart(4, '0');
}

/**
 * Generate message filename
 * Format: NNNN_<speaker>.md
 *
 * @param turn - Turn number (1-based)
 * @param speaker - Agent ID (speaker)
 * @returns filename string
 */
export function generateMessageFilename(turn: number, speaker: string): string {
    return `${formatTurnNumber(turn)}_${speaker}.md`;
}

/**
 * Generate judge filename
 * Format: NNNN.json
 *
 * @param turn - Turn number (1-based)
 * @returns filename string
 */
export function generateJudgeFilename(turn: number): string {
    return `${formatTurnNumber(turn)}.json`;
}

/**
 * Generate markdown frontmatter for a message
 */
export function generateMessageFrontmatter(params: {
    turn: number;
    speaker: string;
    client_id: string;
    created_at: string;
    received_turns: number[];
}): string {
    return (
        `---\n` +
        `turn: ${params.turn}\n` +
        `speaker: ${params.speaker}\n` +
        `client_id: ${params.client_id}\n` +
        `created_at: ${params.created_at}\n` +
        `received_turns: [${params.received_turns.join(', ')}]\n` +
        `---\n`
    );
}

/**
 * Generate transcript heading for a turn
 */
export function generateTranscriptHeading(turn: number, speaker: string): string {
    return `## Turn ${formatTurnNumber(turn)} — ${speaker}\n`;
}
