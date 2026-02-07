import {BoxRenderable, TextRenderable, type KeyEvent} from '@opentui/core';
import type {Task} from '../../../core/domain/task.ts';
import type {Report} from '../../../core/domain/report.ts';
import type {TuiSetState} from '../../keybindings.ts';
import type {TuiState} from '../../state.ts';

const VIEW_KEY = Symbol.for('nexus.tui.view.tasks.detail');

type TaskDetailViewState = {
    panel: BoxRenderable;
    text: TextRenderable;
    currentTaskId?: string;
    disposed: boolean;
};

/**
 * Format a single report summary line
 */
function formatReportLine(report: Report): string {
    return `- [${report.role}] ${new Date(report.runId).toISOString().replace(/[:-]/g, '').substring(0, 15)}  ${report.status}`;
}

/**
 * Build the content string for task detail view
 */
function buildTaskDetailContent(task: Task, reports: Report[]): string {
    const lines: string[] = [];

    lines.push(`Task ${task.id} — ${task.title}`);
    lines.push('');

    lines.push(`Status: ${task.status}`);
    lines.push(`Created: ${task.createdAt}`);
    lines.push('');

    lines.push('Objective:');
    lines.push(task.objective || '(none)');
    lines.push('');

    lines.push('Assigned Roles:');
    if (task.assignedRoles && task.assignedRoles.length > 0) {
        task.assignedRoles.forEach(role => {
            lines.push(`- ${role}`);
        });
    } else {
        lines.push('- (none)');
    }
    lines.push('');

    lines.push('Related Goals:');
    if (task.relatedGoals && task.relatedGoals.length > 0) {
        task.relatedGoals.forEach(goal => {
            lines.push(`- ${goal}`);
        });
    } else {
        lines.push('- (none)');
    }
    lines.push('');

    lines.push('Reports:');
    if (reports && reports.length > 0) {
        reports.forEach(report => {
            lines.push(formatReportLine(report));
        });
    } else {
        lines.push('(none yet)');
    }

    return lines.join('\n');
}

/**
 * Get or create the task detail view state
 */
function getOrCreateView(container: any): TaskDetailViewState {
    const existing = container[VIEW_KEY] as TaskDetailViewState | undefined;
    if (existing && !existing.disposed) {
        return existing;
    }

    const panel = new BoxRenderable(container.ctx, {
        id: 'tasks-detail-panel',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        border: true,
        title: 'Task Detail',
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 1,
    });

    const text = new TextRenderable(container.ctx, {
        id: 'tasks-detail-text',
        width: '100%',
        height: '100%',
        content: 'Loading...',
    });

    panel.add(text);
    container.add(panel);

    const view: TaskDetailViewState = {
        panel,
        text,
        disposed: false,
    };

    // Add keyboard handler to the panel for escape key
    const originalOnKeyDown = (panel as any).onKeyDown;
    (panel as any).onKeyDown = (key: KeyEvent) => {
        handleKeyDown(key, container);
        if (originalOnKeyDown) {
            originalOnKeyDown(key);
        }
    };

    container[VIEW_KEY] = view;
    return view;
}

/**
 * Handle keyboard input in task detail
 */
function handleKeyDown(key: KeyEvent, container: any): void {
    if (key.name === 'escape') {
        key.preventDefault();
        // This will be handled by parent router
    }
}

/**
 * Render the task detail view
 */
export function render(
    container: any,
    state: TuiState,
    task: Task,
    reports: Report[],
    config: {setState: TuiSetState}
): void {
    const view = getOrCreateView(container);

    view.currentTaskId = task.id;
    view.text.content = buildTaskDetailContent(task, reports);

    container.requestRender?.();
}

/**
 * Cleanup the task detail view
 */
export function cleanup(container: any): void {
    const view = container[VIEW_KEY] as TaskDetailViewState | undefined;
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
