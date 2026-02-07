import type {Role} from '../domain/role.ts';
import type {ReportStatus} from '../domain/status.ts';
import type {Project} from '../domain/project.ts';
import type {Task} from '../domain/task.ts';
import type {Report} from '../domain/report.ts';
import type {ApprovalRequest} from '../../tui/approval/types.ts';

/**
 * Governance outcome determined by evaluating task reports.
 *
 * - accept:   All reports indicate success; task is complete.
 * - partial:  Some work succeeded but follow-up is needed.
 * - blocked:  At least one report indicates a blocker.
 * - escalate: Reports conflict and require user resolution.
 */
export type GovernanceOutcome = 'accept' | 'partial' | 'blocked' | 'escalate';

/**
 * Lightweight summary of the governance evaluation for logging and debugging.
 */
export interface GovernanceSummary {
    taskId: string;
    outcome: GovernanceOutcome;
    rationale: string;
    reportStatuses: Partial<Record<Role, ReportStatus>>;
}

/**
 * Input parameters for the evaluateReports function.
 */
export interface EvaluateReportsParams {
    project: Project;
    task: Task;
    reports: Report[];
}

/**
 * Result of the governance evaluation.
 */
export interface EvaluateReportsResult {
    outcome: GovernanceOutcome;
    summary: GovernanceSummary;
    approvalRequest?: ApprovalRequest;
}
