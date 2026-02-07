import {describe, it, expect} from 'bun:test';
import {
    createInitialState,
    setApprovalRequest,
    clearApprovalRequest,
    hasActiveApproval,
    type TuiState,
} from '../../../src/tui/state';
import type {ApprovalRequest, ApprovalResult} from '../../../src/tui/approval/types';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createMockApprovalRequest(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
    return {
        id: 'approval-1',
        type: 'plan-approval',
        title: 'Plan Approval',
        context: 'The initial project plan has been generated.',
        options: [
            {id: 'opt-1', label: 'Approve', action: 'accept'},
            {id: 'opt-2', label: 'Reject', action: 'abort'},
        ],
        ...overrides,
    };
}

function createMockCallback(): {
    callback: (result: ApprovalResult) => void;
    calls: ApprovalResult[];
} {
    const calls: ApprovalResult[] = [];
    const callback = (result: ApprovalResult) => {
        calls.push(result);
    };
    return {callback, calls};
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('Approval state helpers', () => {
    describe('setApprovalRequest', () => {
        it('sets approval request and callback on state', () => {
            const state = createInitialState();
            const request = createMockApprovalRequest();
            const {callback} = createMockCallback();

            const next = setApprovalRequest(state, request, callback);

            expect(next.approvalRequest).toBe(request);
            expect(next.approvalCallback).toBe(callback);
        });

        it('returns a new state object', () => {
            const state = createInitialState();
            const request = createMockApprovalRequest();
            const {callback} = createMockCallback();

            const next = setApprovalRequest(state, request, callback);

            expect(next).not.toBe(state);
        });

        it('preserves all other state properties', () => {
            const state = createInitialState({
                lastProjectId: 'proj-123',
                lastTaskId: 'task-456',
                activeView: 'tasks',
                statusMessage: 'Processing...',
            });
            const request = createMockApprovalRequest();
            const {callback} = createMockCallback();

            const next = setApprovalRequest(state, request, callback);

            expect(next.lastProjectId).toBe('proj-123');
            expect(next.lastTaskId).toBe('task-456');
            expect(next.activeView).toBe('tasks');
            expect(next.statusMessage).toBe('Processing...');
        });

        it('overwrites existing approval request', () => {
            const state = createInitialState();
            const firstRequest = createMockApprovalRequest({id: 'first'});
            const firstCallback = createMockCallback();

            const stateWithFirst = setApprovalRequest(state, firstRequest, firstCallback.callback);

            const secondRequest = createMockApprovalRequest({id: 'second'});
            const secondCallback = createMockCallback();

            const stateWithSecond = setApprovalRequest(
                stateWithFirst,
                secondRequest,
                secondCallback.callback
            );

            expect(stateWithSecond.approvalRequest?.id).toBe('second');
            expect(stateWithSecond.approvalCallback).toBe(secondCallback.callback);
        });

        it('ensures immutability of original state', () => {
            const state = createInitialState();
            const originalApprovalRequest = state.approvalRequest;
            const originalApprovalCallback = state.approvalCallback;

            const request = createMockApprovalRequest();
            const {callback} = createMockCallback();

            setApprovalRequest(state, request, callback);

            expect(state.approvalRequest).toBe(originalApprovalRequest);
            expect(state.approvalCallback).toBe(originalApprovalCallback);
        });
    });

    describe('clearApprovalRequest', () => {
        it('removes approval request and callback', () => {
            const state = createInitialState();
            const request = createMockApprovalRequest();
            const {callback} = createMockCallback();

            const stateWithApproval = setApprovalRequest(state, request, callback);
            const clearedState = clearApprovalRequest(stateWithApproval);

            expect(clearedState.approvalRequest).toBeUndefined();
            expect(clearedState.approvalCallback).toBeUndefined();
        });

        it('returns same reference if no approval was active', () => {
            const state = createInitialState();

            const clearedState = clearApprovalRequest(state);

            expect(clearedState).toBe(state);
        });

        it('returns new state object when approval was active', () => {
            const state = createInitialState();
            const request = createMockApprovalRequest();
            const {callback} = createMockCallback();

            const stateWithApproval = setApprovalRequest(state, request, callback);
            const clearedState = clearApprovalRequest(stateWithApproval);

            expect(clearedState).not.toBe(stateWithApproval);
        });

        it('preserves all other state properties', () => {
            const state = createInitialState({
                lastProjectId: 'proj-123',
                lastTaskId: 'task-456',
                activeView: 'sessions',
                statusMessage: 'Custom status',
            });
            const request = createMockApprovalRequest();
            const {callback} = createMockCallback();

            const stateWithApproval = setApprovalRequest(state, request, callback);
            const clearedState = clearApprovalRequest(stateWithApproval);

            expect(clearedState.lastProjectId).toBe('proj-123');
            expect(clearedState.lastTaskId).toBe('task-456');
            expect(clearedState.activeView).toBe('sessions');
            expect(clearedState.statusMessage).toBe('Custom status');
        });

        it('ensures immutability when clearing', () => {
            const state = createInitialState();
            const request = createMockApprovalRequest();
            const {callback} = createMockCallback();

            const stateWithApproval = setApprovalRequest(state, request, callback);
            const originalRequest = stateWithApproval.approvalRequest;
            const originalCallback = stateWithApproval.approvalCallback;

            clearApprovalRequest(stateWithApproval);

            expect(stateWithApproval.approvalRequest).toBe(originalRequest);
            expect(stateWithApproval.approvalCallback).toBe(originalCallback);
        });

        it('is idempotent when called multiple times on cleared state', () => {
            const state = createInitialState();
            const request = createMockApprovalRequest();
            const {callback} = createMockCallback();

            const stateWithApproval = setApprovalRequest(state, request, callback);
            const clearedOnce = clearApprovalRequest(stateWithApproval);
            const clearedTwice = clearApprovalRequest(clearedOnce);

            expect(clearedTwice).toBe(clearedOnce);
        });
    });

    describe('hasActiveApproval', () => {
        it('returns true when approvalRequest exists', () => {
            const state = createInitialState();
            const request = createMockApprovalRequest();
            const {callback} = createMockCallback();

            const stateWithApproval = setApprovalRequest(state, request, callback);

            expect(hasActiveApproval(stateWithApproval)).toBe(true);
        });

        it('returns false when approvalRequest is undefined', () => {
            const state = createInitialState();
            const request = createMockApprovalRequest();
            const {callback} = createMockCallback();

            const stateWithApproval = setApprovalRequest(state, request, callback);
            const clearedState = clearApprovalRequest(stateWithApproval);

            expect(hasActiveApproval(clearedState)).toBe(false);
        });

        it('returns false for initial state', () => {
            const state = createInitialState();

            expect(hasActiveApproval(state)).toBe(false);
        });

        it('returns false for state with only callback but no request', () => {
            // Edge case: state manually modified (shouldn't happen in practice)
            const state = createInitialState() as TuiState;
            const {callback} = createMockCallback();

            // Manually set only callback without request (edge case)
            const manualState: TuiState = {
                ...state,
                approvalCallback: callback,
                approvalRequest: undefined,
            };

            expect(hasActiveApproval(manualState)).toBe(false);
        });
    });

    describe('combined state transitions', () => {
        it('supports set → clear → set flow', () => {
            let state = createInitialState();

            const request1 = createMockApprovalRequest({id: 'first'});
            const callback1 = createMockCallback();

            state = setApprovalRequest(state, request1, callback1.callback);
            expect(hasActiveApproval(state)).toBe(true);
            expect(state.approvalRequest?.id).toBe('first');

            state = clearApprovalRequest(state);
            expect(hasActiveApproval(state)).toBe(false);

            const request2 = createMockApprovalRequest({id: 'second'});
            const callback2 = createMockCallback();

            state = setApprovalRequest(state, request2, callback2.callback);
            expect(hasActiveApproval(state)).toBe(true);
            expect(state.approvalRequest?.id).toBe('second');
        });

        it('does not interfere with other state changes', () => {
            let state = createInitialState({activeView: 'dashboard'});

            const request = createMockApprovalRequest();
            const {callback} = createMockCallback();

            // Set approval
            state = setApprovalRequest(state, request, callback);
            expect(state.activeView).toBe('dashboard');

            // Change view (simulate normal state change)
            state = {...state, activeView: 'tasks'};
            expect(hasActiveApproval(state)).toBe(true);
            expect(state.activeView).toBe('tasks');

            // Clear approval
            state = clearApprovalRequest(state);
            expect(state.activeView).toBe('tasks');
        });
    });
});
