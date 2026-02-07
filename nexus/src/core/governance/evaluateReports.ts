import type {Role} from '../domain/role.ts';
import type {Report} from '../domain/report.ts';
import type {ReportStatus} from '../domain/status.ts';
import type {ApprovalRequest} from '../../tui/approval/types.ts';
import type {
    EvaluateReportsParams,
    EvaluateReportsResult,
    GovernanceOutcome,
    GovernanceSummary,
} from './types.ts';

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class GovernanceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GovernanceError';
    }
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Evaluate parsed reports for a task and determine the governance outcome.
 *
 * This is a pure, synchronous function with no side effects.
 * The caller is responsible for persisting status changes.
 *
 * @throws {GovernanceError} if reports array is empty
 * @throws {GovernanceError} if report roles do not match task assigned roles
 */
export function evaluateReports(params: EvaluateReportsParams): EvaluateReportsResult {
    const {task, reports} = params;

    validateReports(task.id, task.assignedRoles, reports);

    const reportStatuses = buildReportStatusMap(reports);
    const outcome = determineOutcome(reports);
    const rationale = buildRationale(outcome, reports);

    const summary: GovernanceSummary = {
        taskId: task.id,
        outcome,
        rationale,
        reportStatuses,
    };

    const approvalRequest = outcome === 'escalate' ? buildApprovalRequest(task.id, reports) : undefined;

    return {outcome, summary, approvalRequest};
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

function validateReports(taskId: string, assignedRoles: Role[], reports: Report[]): void {
    if (reports.length === 0) {
        throw new GovernanceError(`No reports provided for task ${taskId}`);
    }

    const reportRoles = new Set(reports.map((r) => r.role));
    const taskRoles = new Set(assignedRoles);

    for (const role of reportRoles) {
        if (!taskRoles.has(role)) {
            throw new GovernanceError(
                `Report role '${role}' is not in assigned roles for task ${taskId}. ` +
                    `Assigned: [${assignedRoles.join(', ')}]`
            );
        }
    }

    for (const role of taskRoles) {
        if (!reportRoles.has(role)) {
            throw new GovernanceError(
                `Missing report for assigned role '${role}' on task ${taskId}. ` +
                    `Received reports from: [${[...reportRoles].join(', ')}]`
            );
        }
    }
}

// -----------------------------------------------------------------------------
// Outcome determination
// -----------------------------------------------------------------------------

/**
 * Determine governance outcome from reports using the MVP evaluation rules:
 *
 * Single-report tasks:
 *   success  -> accept
 *   partial  -> partial
 *   blocked  -> blocked
 *
 * Multi-report tasks:
 *   any blocked             -> blocked
 *   reports disagree        -> escalate
 *   all success             -> accept
 *   else                    -> partial
 */
function determineOutcome(reports: Report[]): GovernanceOutcome {
    const statuses = reports.map((r) => r.status);

    if (reports.length === 1) {
        return mapSingleStatus(statuses[0]);
    }

    return aggregateMultipleStatuses(statuses);
}

function mapSingleStatus(status: ReportStatus): GovernanceOutcome {
    switch (status) {
        case 'success':
            return 'accept';
        case 'partial':
            return 'partial';
        case 'blocked':
            return 'blocked';
    }
}

function aggregateMultipleStatuses(statuses: ReportStatus[]): GovernanceOutcome {
    const hasBlocked = statuses.some((s) => s === 'blocked');
    if (hasBlocked) {
        return 'blocked';
    }

    const uniqueStatuses = new Set(statuses);
    if (uniqueStatuses.size > 1) {
        // Reports disagree (e.g. success vs partial) -> escalate
        return 'escalate';
    }

    if (uniqueStatuses.has('success')) {
        return 'accept';
    }

    // All partial
    return 'partial';
}

// -----------------------------------------------------------------------------
// Summary helpers
// -----------------------------------------------------------------------------

function buildReportStatusMap(reports: Report[]): Partial<Record<Role, ReportStatus>> {
    const map: Partial<Record<Role, ReportStatus>> = {};
    for (const report of reports) {
        map[report.role] = report.status;
    }
    return map;
}

function buildRationale(outcome: GovernanceOutcome, reports: Report[]): string {
    const statusList = reports.map((r) => `${r.role}: ${r.status}`).join(', ');

    switch (outcome) {
        case 'accept':
            return `All reports indicate success. [${statusList}]`;
        case 'partial':
            return `One or more reports indicate partial completion. [${statusList}]`;
        case 'blocked':
            return `At least one report indicates a blocker. [${statusList}]`;
        case 'escalate':
            return `Reports conflict and require user resolution. [${statusList}]`;
    }
}

// -----------------------------------------------------------------------------
// Approval request builder
// -----------------------------------------------------------------------------

function buildApprovalRequest(taskId: string, reports: Report[]): ApprovalRequest {
    const contextLines = reports.map(
        (r) => `- ${r.role} reported '${r.status}': ${r.summary}`
    );

    return {
        id: `task-${taskId}-resolution`,
        type: 'task-acceptance',
        title: `Resolve task ${taskId}`,
        context: `Reports for task ${taskId} are in conflict:\n${contextLines.join('\n')}`,
        options: [
            {id: 'accept', label: 'Accept as-is', action: 'accept'},
            {id: 'revise', label: 'Request revisions', action: 'revise'},
            {id: 'abort', label: 'Abort task', action: 'abort'},
        ],
    };
}
