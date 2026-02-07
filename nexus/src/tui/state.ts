import type {Project} from '../core/domain/project.ts';
import type {ApprovalRequest, ApprovalCallback} from './approval/types.ts';

export type TuiViewId = 'dashboard' | 'tasks' | 'sessions' | 'decisions' | 'logs';

export type TuiState = {
    lastProjectId?: string;
    lastTaskId?: string;
    activeView: TuiViewId;
    statusMessage: string;
    project?: Project;
    selectedTaskIndex?: number;
    activeTaskId?: string;
    // Approval checkpoint state
    approvalRequest?: ApprovalRequest;
    approvalCallback?: ApprovalCallback;
};

export function createInitialState(init?: Partial<TuiState>): TuiState {
    return {
        lastProjectId: init?.lastProjectId,
        lastTaskId: init?.lastTaskId,
        activeView: init?.activeView ?? 'dashboard',
        statusMessage: init?.statusMessage ?? 'Ready',
        project: init?.project,
    };
}

export function setActiveView(state: TuiState, nextView: TuiViewId): TuiState {
    if (state.activeView === nextView) return state;
    return {
        ...state,
        activeView: nextView,
    };
}

export function setStatusMessage(state: TuiState, statusMessage: string): TuiState {
    if (state.statusMessage === statusMessage) return state;
    return {
        ...state,
        statusMessage,
    };
}

// -----------------------------------------------------------------------------
// Approval State Helpers
// -----------------------------------------------------------------------------

/**
 * Sets an approval request on the TUI state.
 * When set, the TUI will display the approval modal and block normal navigation.
 */
export function setApprovalRequest(
    state: TuiState,
    request: ApprovalRequest,
    callback: ApprovalCallback
): TuiState {
    return {
        ...state,
        approvalRequest: request,
        approvalCallback: callback,
    };
}

/**
 * Clears the approval request from the TUI state.
 * Returns the same reference if no approval was active.
 */
export function clearApprovalRequest(state: TuiState): TuiState {
    if (!state.approvalRequest && !state.approvalCallback) return state;
    return {
        ...state,
        approvalRequest: undefined,
        approvalCallback: undefined,
    };
}

/**
 * Returns true if an approval request is currently active.
 */
export function hasActiveApproval(state: TuiState): boolean {
    return state.approvalRequest !== undefined;
}
