import type {ApprovalRequest, ApprovalResult} from '../tui/approval/types.ts';
import type {GovernanceSummary} from '../core/governance/types.ts';
import type {DecisionInput} from '../core/domain/decision.ts';

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class ApprovalHandlerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ApprovalHandlerError';
    }
}

// -----------------------------------------------------------------------------
// Mapping: ApprovalResult → DecisionInput
// -----------------------------------------------------------------------------

/**
 * Map a user approval result and its originating approval request into a
 * DecisionInput suitable for recording as an immutable decision file.
 *
 * @param projectId   - The project that owns this decision
 * @param request     - The original approval request shown to the user
 * @param result      - The user's selected approval option
 * @param summary     - Optional governance summary for additional rationale
 * @returns A fully populated DecisionInput
 *
 * @throws {ApprovalHandlerError} if the selected option is not found in the request
 */
export function mapApprovalToDecision(
    projectId: string,
    request: ApprovalRequest,
    result: ApprovalResult,
    summary?: GovernanceSummary
): DecisionInput {
    if (!projectId || typeof projectId !== 'string') {
        throw new ApprovalHandlerError('projectId is required and must be a non-empty string');
    }

    // Find the selected option from the request
    const selectedOption = request.options.find((o) => o.id === result.selectedOptionId);
    if (!selectedOption) {
        throw new ApprovalHandlerError(
            `Selected option '${result.selectedOptionId}' not found in approval request '${request.id}'`
        );
    }

    // Extract task ID from the approval request ID if present
    const taskId = extractTaskId(request.id);

    // Build title from approval request
    const title = `${request.title} Resolution`;

    // Build options list from all available options
    const options = request.options.map((o) => o.label);

    // Build decision text from the selected option
    const decision = selectedOption.label;

    // Build rationale from governance summary or from request context
    const rationale = summary
        ? summary.rationale
        : `User selected '${selectedOption.label}' for: ${request.context}`;

    // Build consequences based on action type
    const consequences = buildConsequences(result.action, taskId);

    return {
        projectId,
        taskId,
        title,
        context: request.context,
        options,
        decision,
        rationale,
        consequences,
    };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const TASK_ID_REGEX = /task-([\w-]+?)(?:-resolution)?$/;

function extractTaskId(approvalId: string): string | undefined {
    const match = approvalId.match(TASK_ID_REGEX);
    return match?.[1];
}

function buildConsequences(action: string, taskId?: string): string[] {
    const taskRef = taskId ? `Task ${taskId}` : 'Task';

    switch (action) {
        case 'accept':
            return [
                `${taskRef} is marked as completed`,
                'Work can proceed to downstream tasks',
            ];
        case 'revise':
            return [
                `${taskRef} remains blocked`,
                'Follow-up task required',
            ];
        case 'abort':
            return [
                `${taskRef} is cancelled`,
                'Dependent tasks may need replanning',
            ];
        case 'defer':
            return [
                `${taskRef} is deferred`,
                'Decision will be revisited later',
            ];
        default:
            return [`${taskRef} updated with action: ${action}`];
    }
}
