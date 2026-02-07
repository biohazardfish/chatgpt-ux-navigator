import type {PlanStatus, TaskStatus} from '../domain/status.ts';

/**
 * Reason why a task cannot be executed.
 */
export type TaskNotExecutableReason =
    | {kind: 'task_not_found'}
    | {kind: 'plan_not_approved'; planStatus: PlanStatus}
    | {kind: 'task_not_pending'; currentStatus: TaskStatus}
    | {kind: 'no_roles_assigned'}
    | {kind: 'missing_context'; missing: string[]}
    | {kind: 'invalid_transition'; from: TaskStatus; to: TaskStatus};

/**
 * Error thrown when a task cannot be prepared for execution.
 */
export class TaskNotExecutableError extends Error {
    readonly taskId: string;
    readonly reason: TaskNotExecutableReason;

    constructor(taskId: string, reason: TaskNotExecutableReason) {
        const message = formatReason(taskId, reason);
        super(message);
        this.name = 'TaskNotExecutableError';
        this.taskId = taskId;
        this.reason = reason;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

function formatReason(taskId: string, reason: TaskNotExecutableReason): string {
    switch (reason.kind) {
        case 'task_not_found':
            return `Task ${taskId} not found`;
        case 'plan_not_approved':
            return `Task ${taskId} cannot be executed: plan is '${reason.planStatus}', must be 'approved'`;
        case 'task_not_pending':
            return `Task ${taskId} cannot be executed: status is '${reason.currentStatus}', must be 'pending'`;
        case 'no_roles_assigned':
            return `Task ${taskId} cannot be executed: no roles assigned`;
        case 'missing_context':
            return `Task ${taskId} cannot be executed: missing required context (${reason.missing.join(', ')})`;
        case 'invalid_transition':
            return `Task ${taskId}: invalid status transition from '${reason.from}' to '${reason.to}'`;
    }
}
