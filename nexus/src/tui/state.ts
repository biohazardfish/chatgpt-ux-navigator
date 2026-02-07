import type { Project } from '../core/domain/project.ts';

export type TuiViewId = 'dashboard' | 'tasks' | 'sessions' | 'decisions' | 'logs';

export type TuiState = {
    lastProjectId?: string;
    lastTaskId?: string;
    activeView: TuiViewId;
    statusMessage: string;
    project?: Project;
};

export function createInitialState(init?: Partial<TuiState>): TuiState {
    return {
        lastProjectId: init?.lastProjectId,
        lastTaskId: init?.lastTaskId,
        activeView: init?.activeView ?? 'dashboard',
        statusMessage: init?.statusMessage ?? 'Ready',
        project: init?.project
    };
}

export function setActiveView(state: TuiState, nextView: TuiViewId): TuiState {
    if (state.activeView === nextView) return state;
    return {
        ...state,
        activeView: nextView
    };
}

export function setStatusMessage(state: TuiState, statusMessage: string): TuiState {
    if (state.statusMessage === statusMessage) return state;
    return {
        ...state,
        statusMessage
    };
}
