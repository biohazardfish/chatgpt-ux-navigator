import type {TaskStatus} from '../domain/status.ts';

/**
 * Defines the valid task lifecycle state machine.
 *
 * Allowed transitions:
 *   pending → running
 *   pending → aborted
 *   running → completed
 *   running → blocked
 *
 * Terminal states (no outbound transitions):
 *   - completed
 *   - aborted
 */

type TransitionMap = Record<TaskStatus, TaskStatus[]>;

/**
 * Map of valid transitions: from status → allowed target statuses
 */
const VALID_TRANSITIONS: TransitionMap = {
    pending: ['running', 'aborted'],
    running: ['completed', 'blocked'],
    blocked: ['running', 'aborted'], // Can unblock and retry, or abort
    completed: [], // Terminal
    aborted: [], // Terminal
};

/**
 * Terminal states that cannot transition to any other state.
 */
export const TERMINAL_STATUSES: readonly TaskStatus[] = ['completed', 'aborted'] as const;

/**
 * Check if a status transition is valid according to the lifecycle rules.
 */
export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
    // Same state is always valid (no-op)
    if (from === to) {
        return true;
    }

    const allowedTargets = VALID_TRANSITIONS[from];
    return allowedTargets.includes(to);
}

/**
 * Get all valid target statuses from a given status.
 */
export function getValidTransitions(from: TaskStatus): readonly TaskStatus[] {
    return VALID_TRANSITIONS[from];
}

/**
 * Check if a status is terminal (cannot transition to any other state).
 */
export function isTerminalStatus(status: TaskStatus): boolean {
    return TERMINAL_STATUSES.includes(status);
}
