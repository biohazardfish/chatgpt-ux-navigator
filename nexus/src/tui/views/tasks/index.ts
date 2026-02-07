import * as listView from './list.ts';
import * as detailView from './detail.ts';
import type { TuiSetState } from '../../keybindings.ts';
import type { TuiState } from '../../state.ts';

const ROUTER_KEY = Symbol.for('nexus.tui.view.tasks.inspector.router');

type TaskInspectorRouterState = {
  mode: 'list' | 'detail';
  disposed: boolean;
};

/**
 * Determine which view (list or detail) should be displayed
 */
function getCurrentMode(state: TuiState): 'list' | 'detail' {
  return state.activeTaskId ? 'detail' : 'list';
}

/**
 * Get the current router state
 */
function getOrCreateRouter(container: any): TaskInspectorRouterState {
  const existing = container[ROUTER_KEY] as TaskInspectorRouterState | undefined;
  if (existing && !existing.disposed) {
    return existing;
  }

  const router: TaskInspectorRouterState = {
    mode: 'list',
    disposed: false,
  };

  container[ROUTER_KEY] = router;
  return router;
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
 * Find a task by ID in the project
 */
function findTaskById(state: TuiState, taskId: string) {
  if (!state.project || !state.project.tasks) return null;
  return state.project.tasks.find((t) => t.id === taskId) || null;
}

/**
 * Get reports for a specific task
 * For now, returns empty array as reports need to be loaded from storage
 */
function getReportsForTask(state: TuiState, taskId: string) {
  // TODO: Load reports from storage based on projectId and taskId
  // For MVP, return empty array
  return [];
}

/**
 * Main render function for the task inspector (routes between list and detail)
 */
export function render(container: any, state: TuiState, ctx: { setState: TuiSetState; getState: () => TuiState }): void {
  const router = getOrCreateRouter(container);
  const mode = getCurrentMode(state);

  // If mode changed, clear container and switch views
  if (router.mode !== mode) {
    router.mode = mode;
    clearContainer(container);
  }

  if (mode === 'list') {
    listView.render(container, state, ctx);
  } else if (mode === 'detail') {
    const taskId = state.activeTaskId;
    if (!taskId) {
      // Invalid state, go back to list
      ctx.setState((prev) => ({
        ...prev,
        activeTaskId: undefined,
        statusMessage: 'Task not found',
      }));
      return;
    }

    const task = findTaskById(state, taskId);
    if (!task) {
      // Task not found, go back to list with error
      ctx.setState((prev) => ({
        ...prev,
        activeTaskId: undefined,
        statusMessage: `Task ${taskId} not found`,
      }));
      return;
    }

    const reports = getReportsForTask(state, taskId);
    detailView.render(container, state, task, reports, ctx);
  }
}

/**
 * Handle keyboard navigation for the inspector
 * This is called from keybindings when Escape is pressed
 */
export function handleEscapeKey(container: any, setState: TuiSetState): void {
  const router = container[ROUTER_KEY] as TaskInspectorRouterState | undefined;
  if (!router) return;

  if (router.mode === 'detail') {
    // Go back to list from detail
    setState((prev) => ({
      ...prev,
      activeTaskId: undefined,
      statusMessage: 'Back to task list',
    }));
  } else if (router.mode === 'list') {
    // Go back to dashboard from list
    setState((prev) => ({
      ...prev,
      activeView: 'dashboard',
      statusMessage: 'Back to dashboard',
    }));
  }
}

/**
 * Cleanup the task inspector views
 */
export function cleanup(container: any): void {
  listView.cleanup(container);
  detailView.cleanup(container);

  const router = container[ROUTER_KEY] as TaskInspectorRouterState | undefined;
  if (router) {
    router.disposed = true;
  }

  try {
    delete container[ROUTER_KEY];
  } catch {
    container[ROUTER_KEY] = undefined;
  }
}
