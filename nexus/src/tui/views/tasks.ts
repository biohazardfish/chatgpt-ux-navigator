/**
 * Tasks View Router
 *
 * This module handles routing between task inspection (list/detail) and task execution views.
 * The original execution view is now in tasks-execution.ts.
 */

import * as inspectorRouter from './tasks/index.ts';
import * as executionView from './tasks-execution.ts';
import type { TuiSetState } from '../keybindings.ts';
import type { TuiState } from '../state.ts';
import type { Config } from '../../config/config.ts';

const CURRENT_VIEW_KEY = Symbol.for('nexus.tui.view.tasks.current');

type TasksViewMode = 'inspection' | 'execution';

type TasksViewState = {
  mode: TasksViewMode;
  disposed: boolean;
};

/**
 * Get or create the tasks view state
 */
function getOrCreateViewState(container: any): TasksViewState {
  const existing = container[CURRENT_VIEW_KEY] as TasksViewState | undefined;
  if (existing && !existing.disposed) {
    return existing;
  }

  const state: TasksViewState = {
    mode: 'execution',
    disposed: false,
  };

  container[CURRENT_VIEW_KEY] = state;
  return state;
}

/**
 * Clear all children from the container
 */
function clearContainer(container: any): void {
  const children = typeof container.getChildren === 'function' ? [...container.getChildren()] : [];
  for (const child of children) {
    try {
      container.remove(child.id);
    } catch {
      // ignore
    }
    try {
      child?.destroyRecursively?.();
    } catch {
      // ignore
    }
  }
}

/**
 * Main render function for tasks view
 * Routes between inspection (list/detail) and execution views
 */
export function render(container: any, state: TuiState, ctx?: any): void {
  if (!ctx) {
    console.error('[tasks view] Missing context');
    return;
  }

  const viewState = getOrCreateViewState(container);

  // Determine which mode to use based on whether inspection state is active
  const shouldShowInspection = state.activeView === 'tasks' && state.project && !state.lastTaskId?.includes('run');
  const mode: TasksViewMode = shouldShowInspection ? 'inspection' : 'execution';

  // If mode changed, clear and switch
  if (viewState.mode !== mode) {
    viewState.mode = mode;
    clearContainer(container);
  }

  if (mode === 'inspection') {
    inspectorRouter.render(container, state, {
      setState: ctx.setState,
      getState: ctx.getState,
    });
  } else {
    executionView.render(container, state, ctx);
  }
}

/**
 * Cleanup function for tasks view
 */
export function cleanup(container: any): void {
  inspectorRouter.cleanup(container);
  executionView.cleanup(container);

  const viewState = container[CURRENT_VIEW_KEY] as TasksViewState | undefined;
  if (viewState) {
    viewState.disposed = true;
  }

  try {
    delete container[CURRENT_VIEW_KEY];
  } catch {
    container[CURRENT_VIEW_KEY] = undefined;
  }
}

/**
 * Export the execution view functions for backward compatibility
 */
export { runSelectedTaskAction, runTaskNonInteractive } from './tasks-execution.ts';
