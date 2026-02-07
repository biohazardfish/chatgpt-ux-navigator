import { BoxRenderable, SelectRenderable, SelectRenderableEvents, type KeyEvent } from '@opentui/core';
import type { Task } from '../../../core/domain/task.ts';
import type { TuiSetState } from '../../keybindings.ts';
import type { TuiState } from '../../state.ts';

const VIEW_KEY = Symbol.for('nexus.tui.view.tasks.list');

type TaskListViewState = {
  panel: BoxRenderable;
  list: SelectRenderable;
  selectedIndex: number;
  tasks: Task[];
  disposed: boolean;
};

/**
 * Formats task status with color coding
 * Completed → green, Running → yellow, Blocked → red, Pending → default
 */
function formatTaskStatus(status: string): string {
  // Note: Full color support would require styled text in OpenTUI
  // For now, we use plain text with status emoji/indicator
  switch (status) {
    case 'completed':
      return '✓';
    case 'running':
      return '▶';
    case 'blocked':
      return '✗';
    case 'pending':
      return '○';
    default:
      return '?';
  }
}

/**
 * Format a single task row for display
 */
function formatTaskRow(task: Task): string {
  const status = formatTaskStatus(task.status);
  return `[${task.id}] ${task.title.padEnd(30)} ${status} ${task.status}`;
}

/**
 * Build the content string for the task list view
 */
function buildTaskListContent(tasks: Task[]): string {
  const lines: string[] = [];
  lines.push(`Tasks (${tasks.length} total)`);
  lines.push('');

  if (tasks.length === 0) {
    lines.push('(no tasks)');
  } else {
    tasks.forEach((task) => {
      lines.push(formatTaskRow(task));
    });
  }

  return lines.join('\n');
}

/**
 * Get or create the task list view state
 */
function getOrCreateView(
  container: any,
  tasks: Task[],
  setState: TuiSetState,
  getState: () => TuiState
): TaskListViewState {
  const existing = container[VIEW_KEY] as TaskListViewState | undefined;
  if (existing && !existing.disposed) {
    // Update tasks if they changed
    if (JSON.stringify(existing.tasks) !== JSON.stringify(tasks)) {
      existing.tasks = tasks;
      updateListItems(existing);
    }
    return existing;
  }

  const panel = new BoxRenderable(container.ctx, {
    id: 'tasks-list-panel',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    border: true,
    title: 'Task List',
    paddingLeft: 1,
    paddingRight: 1,
  });

  const list = new SelectRenderable(container.ctx, {
    id: 'tasks-list-select',
    width: '100%',
    height: '100%',
    showDescription: false,
    options: tasks.length > 0 ? formatListOptions(tasks) : [{ name: '(no tasks)', description: '' }],
    onKeyDown: (key) => handleKeyDown(key, container, setState, getState),
  });

  panel.add(list);
  container.add(panel);

  const view: TaskListViewState = {
    panel,
    list,
    selectedIndex: 0,
    tasks,
    disposed: false,
  };

  list.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
    view.selectedIndex = index;
    const task = tasks[index];
    if (task) {
      setState((prev) => ({
        ...prev,
        activeTaskId: task.id,
        selectedTaskIndex: index,
        statusMessage: `Selected task: ${task.id}`,
      }));
    }
  });

  container[VIEW_KEY] = view;
  return view;
}

/**
 * Convert tasks to SelectRenderable options
 */
function formatListOptions(tasks: Task[]): Array<{ name: string; description: string }> {
  return tasks.map((task) => ({
    name: formatTaskRow(task),
    description: task.objective || '',
  }));
}

/**
 * Update list items when tasks change
 */
function updateListItems(view: TaskListViewState): void {
  if (view.disposed) return;
  view.list.options = formatListOptions(view.tasks);
  if (view.selectedIndex >= view.tasks.length && view.tasks.length > 0) {
    view.selectedIndex = view.tasks.length - 1;
  }
  if (view.tasks.length > 0) {
    view.list.setSelectedIndex(view.selectedIndex);
  }
}

/**
 * Handle keyboard input in task list
 */
function handleKeyDown(key: KeyEvent, container: any, setState: TuiSetState, getState: () => TuiState): void {
  const view = container[VIEW_KEY] as TaskListViewState | undefined;
  if (!view || view.disposed) return;

  if (key.name === 'escape') {
    key.preventDefault();
    setState((prev) => ({
      ...prev,
      activeView: 'dashboard',
      statusMessage: 'Back to dashboard',
    }));
    return;
  }

  if (key.name === 'return' || key.name === 'enter') {
    key.preventDefault();
    const task = view.tasks[view.selectedIndex];
    if (task) {
      setState((prev) => ({
        ...prev,
        activeTaskId: task.id,
        selectedTaskIndex: view.selectedIndex,
        statusMessage: `Viewing task: ${task.id}`,
      }));
    }
    return;
  }
}

/**
 * Render the task list view
 */
export function render(container: any, state: TuiState, config: { setState: TuiSetState; getState: () => TuiState }): void {
  if (!state.project || !state.project.tasks) {
    // Render error state
    const errorContent = 'No project or tasks loaded.';
    const panel = new BoxRenderable(container.ctx, {
      id: 'tasks-list-error-panel',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      border: true,
      title: 'Task List',
    });
    const text = new BoxRenderable(container.ctx, {
      id: 'tasks-list-error-text',
      width: '100%',
      height: '100%',
    });
    panel.add(text);
    container.add(panel);
    return;
  }

  const view = getOrCreateView(container, state.project.tasks, config.setState, config.getState);

  // Restore selection from state if available
  if (state.selectedTaskIndex !== undefined && state.selectedTaskIndex >= 0 && state.selectedTaskIndex < view.tasks.length) {
    view.selectedIndex = state.selectedTaskIndex;
    view.list.setSelectedIndex(state.selectedTaskIndex);
  }
}

/**
 * Cleanup the task list view
 */
export function cleanup(container: any): void {
  const view = container[VIEW_KEY] as TaskListViewState | undefined;
  if (!view) return;

  view.disposed = true;

  try {
    view.panel.destroyRecursively?.();
  } catch {
    // ignore
  }

  try {
    delete container[VIEW_KEY];
  } catch {
    container[VIEW_KEY] = undefined;
  }
}
