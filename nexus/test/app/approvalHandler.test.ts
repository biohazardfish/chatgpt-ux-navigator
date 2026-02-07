import {describe, it, expect} from 'bun:test';
import {mapApprovalToDecision, ApprovalHandlerError} from '../../src/app/approvalHandler';
import type {ApprovalRequest, ApprovalResult} from '../../src/tui/approval/types';
import type {GovernanceSummary} from '../../src/core/governance/types';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function makeApprovalRequest(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
    return {
        id: 'task-T-005-resolution',
        type: 'task-acceptance',
        title: 'Resolve task T-005',
        context: 'Reports for task T-005 are in conflict:\n- planner reported success\n- reviewer reported partial',
        options: [
            {id: 'accept', label: 'Accept as-is', action: 'accept'},
            {id: 'revise', label: 'Request revisions', action: 'revise'},
            {id: 'abort', label: 'Abort task', action: 'abort'},
        ],
        ...overrides,
    };
}

function makeApprovalResult(overrides?: Partial<ApprovalResult>): ApprovalResult {
    return {
        approvalId: 'task-T-005-resolution',
        selectedOptionId: 'accept',
        action: 'accept',
        ...overrides,
    };
}

function makeGovernanceSummary(overrides?: Partial<GovernanceSummary>): GovernanceSummary {
    return {
        taskId: 'T-005',
        outcome: 'escalate',
        rationale: 'Reports conflict and require user resolution. [planner: success, reviewer: partial]',
        reportStatuses: {planner: 'success', reviewer: 'partial'},
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('mapApprovalToDecision', () => {
    const projectId = 'test-project';

    // -------------------------------------------------------------------------
    // Basic mapping
    // -------------------------------------------------------------------------

    it('should map an accept approval to a DecisionInput', () => {
        const request = makeApprovalRequest();
        const result = makeApprovalResult();

        const decision = mapApprovalToDecision(projectId, request, result);

        expect(decision.projectId).toBe(projectId);
        expect(decision.taskId).toBe('T-005');
        expect(decision.title).toBe('Resolve task T-005 Resolution');
        expect(decision.context).toBe(request.context);
        expect(decision.options).toEqual(['Accept as-is', 'Request revisions', 'Abort task']);
        expect(decision.decision).toBe('Accept as-is');
        expect(decision.consequences).toContain('Task T-005 is marked as completed');
    });

    it('should map a revise approval to a DecisionInput', () => {
        const request = makeApprovalRequest();
        const result = makeApprovalResult({selectedOptionId: 'revise', action: 'revise'});

        const decision = mapApprovalToDecision(projectId, request, result);

        expect(decision.decision).toBe('Request revisions');
        expect(decision.consequences).toContain('Task T-005 remains blocked');
        expect(decision.consequences).toContain('Follow-up task required');
    });

    it('should map an abort approval to a DecisionInput', () => {
        const request = makeApprovalRequest();
        const result = makeApprovalResult({selectedOptionId: 'abort', action: 'abort'});

        const decision = mapApprovalToDecision(projectId, request, result);

        expect(decision.decision).toBe('Abort task');
        expect(decision.consequences).toContain('Task T-005 is cancelled');
    });

    // -------------------------------------------------------------------------
    // Governance summary integration
    // -------------------------------------------------------------------------

    it('should use governance summary rationale when provided', () => {
        const request = makeApprovalRequest();
        const result = makeApprovalResult();
        const summary = makeGovernanceSummary();

        const decision = mapApprovalToDecision(projectId, request, result, summary);

        expect(decision.rationale).toBe(summary.rationale);
    });

    it('should build rationale from request context when summary is not provided', () => {
        const request = makeApprovalRequest();
        const result = makeApprovalResult();

        const decision = mapApprovalToDecision(projectId, request, result);

        expect(decision.rationale).toContain('Accept as-is');
        expect(decision.rationale).toContain(request.context);
    });

    // -------------------------------------------------------------------------
    // Task ID extraction
    // -------------------------------------------------------------------------

    it('should extract task ID from approval request ID', () => {
        const request = makeApprovalRequest({id: 'task-T-006-resolution'});
        const result = makeApprovalResult();

        const decision = mapApprovalToDecision(projectId, request, result);

        expect(decision.taskId).toBe('T-006');
    });

    it('should handle approval IDs without task prefix', () => {
        const request = makeApprovalRequest({id: 'plan-review-001'});
        const result = makeApprovalResult();

        const decision = mapApprovalToDecision(projectId, request, result);

        expect(decision.taskId).toBeUndefined();
    });

    // -------------------------------------------------------------------------
    // Defer action
    // -------------------------------------------------------------------------

    it('should handle defer action', () => {
        const request = makeApprovalRequest({
            options: [
                {id: 'defer', label: 'Defer decision', action: 'defer'},
            ],
        });
        const result = makeApprovalResult({selectedOptionId: 'defer', action: 'defer'});

        const decision = mapApprovalToDecision(projectId, request, result);

        expect(decision.decision).toBe('Defer decision');
        expect(decision.consequences).toContain('Task T-005 is deferred');
    });

    // -------------------------------------------------------------------------
    // Validation errors
    // -------------------------------------------------------------------------

    it('should throw on empty projectId', () => {
        const request = makeApprovalRequest();
        const result = makeApprovalResult();

        expect(() => mapApprovalToDecision('', request, result)).toThrow(ApprovalHandlerError);
        expect(() => mapApprovalToDecision('', request, result)).toThrow('projectId');
    });

    it('should throw when selected option is not found in request', () => {
        const request = makeApprovalRequest();
        const result = makeApprovalResult({selectedOptionId: 'nonexistent'});

        expect(() => mapApprovalToDecision(projectId, request, result)).toThrow(
            ApprovalHandlerError
        );
        expect(() => mapApprovalToDecision(projectId, request, result)).toThrow('not found');
    });

    // -------------------------------------------------------------------------
    // All required DecisionInput fields are populated
    // -------------------------------------------------------------------------

    it('should produce a DecisionInput with all required fields', () => {
        const request = makeApprovalRequest();
        const result = makeApprovalResult();

        const decision = mapApprovalToDecision(projectId, request, result);

        expect(decision.projectId).toBeTruthy();
        expect(decision.title).toBeTruthy();
        expect(decision.context).toBeTruthy();
        expect(decision.options.length).toBeGreaterThan(0);
        expect(decision.decision).toBeTruthy();
        expect(decision.rationale).toBeTruthy();
        expect(decision.consequences.length).toBeGreaterThan(0);
    });
});
