// @ts-ignore - blessed has no bundled TS types in this repo
import blessed from 'blessed';

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { Config } from '../../config/config.ts';
import type { Role } from '../../core/domain/role.ts';
import { runTaskSessions } from '../../core/orchestration/sessionRunner.ts';
import { parseTask } from '../../core/parsing/task.ts';
import { TASKS_DIR, TASK_FILE, validateProjectId } from '../../storage/layout.ts';

import type { TuiSetState } from '../keybindings.ts';
import type { TuiState } from '../state.ts';

type TasksViewContext = {
    config: Config;
    setState: TuiSetState;
    getState: () => TuiState;
};

export type RunOutcome = {
    ok: boolean;
    errorMessage?: string;
};

type TasksView = {
    projectsList: any;
    tasksList: any;
    summaryBox: any;
    runBox: any;
    projects: string[];
    tasks: string[];
    activeProjectId?: string;
    activeTaskId?: string;
    focus: 'projects' | 'tasks';
    loadSeq: number;
    runSeq: number;
    run?: RunState;
    disposed: boolean;
};

const VIEW_KEY = Symbol.for('nexus.tui.view.tasks');

type RunRoleState = {
    status: 'pending' | 'running' | 'success' | 'error';
    runId?: string;
    responseLength?: number;
    error?: string;
};

type RunState = {
    seq: number;
    projectId: string;
    taskId: string;
    startedAt: number;
    finishedAt?: number;
    active: boolean;
    rolesInOrder: Role[];
    roles: Record<string, RunRoleState>;
    failingRole?: Role;
    errorMessage?: string;
};

function safeDestroy(node: any): void {
    try {
        node?.detach?.();
    } catch {
        // ignore
    }
    try {
        node?.destroy?.();
    } catch {
        // ignore
    }
}

function safeMessage(error: unknown): string {
    if (!error) return 'Unknown error';
    if (error instanceof Error) return error.message;
    return String(error);
}

async function listDirectories(path: string): Promise<string[]> {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function formatSummary(value: {
    taskId?: string;
    projectId?: string;
    title?: string;
    status?: string;
    assignedRoles?: string[];
    error?: string;
}): string {
    if (!value.projectId) {
        return ['{bold}Summary{/bold}', '', 'No project selected.'].join('\n');
    }

    if (!value.taskId) {
        return ['{bold}Summary{/bold}', '', `Project: {bold}${value.projectId}{/bold}`, '', 'No task selected.'].join(
            '\n'
        );
    }

    if (value.error) {
        return [
            '{bold}Summary{/bold}',
            '',
            `Project: {bold}${value.projectId}{/bold}`,
            `Task: {bold}${value.taskId}{/bold}`,
            '',
            `{red-fg}Parse error{/red-fg}: ${value.error}`
        ].join('\n');
    }

    const roles = value.assignedRoles && value.assignedRoles.length > 0 ? value.assignedRoles.join(', ') : '(none)';

    return [
        '{bold}Summary{/bold}',
        '',
        `Project: {bold}${value.projectId}{/bold}`,
        `Task: {bold}${value.taskId}{/bold}`,
        value.title ? `Title: ${value.title}` : 'Title: (missing)',
        value.status ? `Status: ${value.status}` : 'Status: (missing)',
        `Assigned roles: ${roles}`
    ].join('\n');
}

function formatRun(value?: RunState): string {
    if (!value) {
        return ['{bold}Run{/bold}', '', 'Press {bold}r{/bold} to run the selected task.'].join('\n');
    }

    const header = value.active
        ? `{bold}Running{/bold} ${value.projectId} / ${value.taskId}`
        : `{bold}Run finished{/bold} ${value.projectId} / ${value.taskId}`;

    const roleLines = value.rolesInOrder.length > 0
        ? value.rolesInOrder.map((role) => {
              const state = value.roles[role] ?? { status: 'pending' as const };
              switch (state.status) {
                  case 'running':
                      return `- {bold}${role}{/bold}  {yellow-fg}… running{/yellow-fg}`;
                  case 'success': {
                      const len = typeof state.responseLength === 'number' ? `  len=${state.responseLength}` : '';
                      const runId = state.runId ? `  runId=${state.runId}` : '';
                      return `- {bold}${role}{/bold}  {green-fg}✓ done{/green-fg}${runId}${len}`;
                  }
                  case 'error': {
                      const reason = state.error ? `  ${state.error}` : '';
                      return `- {bold}${role}{/bold}  {red-fg}✗ failed{/red-fg}${reason}`;
                  }
                  default:
                      return `- {bold}${role}{/bold}  (pending)`;
              }
          })
        : ['(no roles started yet)'];

    const footer = !value.active && value.errorMessage
        ? ['', `{red-fg}Failed{/red-fg}: ${value.errorMessage}`]
        : [];

    return [header, '', ...roleLines, ...footer].join('\n');
}

function setFocus(view: TasksView, focus: TasksView['focus']): void {
    view.focus = focus;
    const active = { fg: 'cyan' };
    const inactive = { fg: 'gray' };

    view.projectsList.style.border = focus === 'projects' ? active : inactive;
    view.tasksList.style.border = focus === 'tasks' ? active : inactive;

    if (focus === 'projects') view.projectsList.focus();
    if (focus === 'tasks') view.tasksList.focus();
}

function updateRunBox(container: any, view: TasksView): void {
    if (view.disposed) return;
    try {
        view.runBox?.setContent?.(formatRun(view.run));
    } catch {
        // ignore
    }
    container.screen?.render?.();
}

async function executeTaskRun(options: {
    config: Config;
    projectId: string;
    taskId: string;
    onRoleStart?: (role: Role) => Promise<void> | void;
    onRoleSuccess?: (role: Role, run: { runId: string; responseText?: string }) => Promise<void> | void;
    onRoleError?: (role: Role, error: unknown) => Promise<void> | void;
}): Promise<{ ok: true; resultsLength: number } | { ok: false; errorMessage: string; failingRole?: Role }> {
    try {
        const results = await runTaskSessions({
            config: options.config,
            projectId: options.projectId,
            taskId: options.taskId,
            allowCarryover: false,
            onRoleStart: options.onRoleStart,
            onRoleSuccess: options.onRoleSuccess,
            onRoleError: options.onRoleError
        });

        return { ok: true, resultsLength: results.length };
    } catch (error) {
        const failingRole = (error as any)?.role as Role | undefined;
        return { ok: false, errorMessage: safeMessage(error), failingRole };
    }
}

async function runSelectedTask(container: any, view: TasksView, ctx: TasksViewContext): Promise<RunOutcome> {
    if (view.disposed) return { ok: false, errorMessage: 'View disposed' };
    if (view.run?.active) {
        ctx.setState((prev) => ({ ...prev, statusMessage: 'Run already active (wait for it to finish)' }));
        return { ok: false, errorMessage: 'Run already active' };
    }

    const state = ctx.getState();
    const projectId = (view.activeProjectId ?? state.lastProjectId)?.trim();
    const taskId = (view.activeTaskId ?? state.lastTaskId)?.trim();

    if (!projectId || !taskId) {
        ctx.setState((prev) => ({
            ...prev,
            statusMessage: 'Select a project + task (Enter) then press r to run'
        }));
        return { ok: false, errorMessage: 'No project/task selected' };
    }

    const seq = ++view.runSeq;
    view.run = {
        seq,
        projectId,
        taskId,
        startedAt: Date.now(),
        active: true,
        rolesInOrder: [],
        roles: {}
    };

    ctx.setState((prev) => ({ ...prev, statusMessage: `Running ${projectId} / ${taskId}…` }));
    updateRunBox(container, view);

    const ensureRole = (role: Role) => {
        const current = view.run;
        if (!current || current.seq !== seq) return;
        if (!current.roles[role]) current.roles[role] = { status: 'pending' };
        if (!current.rolesInOrder.includes(role)) current.rolesInOrder.push(role);
    };

    const result = await executeTaskRun({
        config: ctx.config,
        projectId,
        taskId,
        onRoleStart: async (role) => {
            if (view.disposed) return;
            if (!view.run || view.run.seq !== seq) return;
            ensureRole(role);
            view.run.roles[role] = { ...view.run.roles[role], status: 'running' };
            updateRunBox(container, view);
        },
        onRoleSuccess: async (role, run) => {
            if (view.disposed) return;
            if (!view.run || view.run.seq !== seq) return;
            ensureRole(role);
            view.run.roles[role] = {
                status: 'success',
                runId: run.runId,
                responseLength: run.responseText?.length ?? 0,
            };
            updateRunBox(container, view);
        },
        onRoleError: async (role, error) => {
            if (view.disposed) return;
            if (!view.run || view.run.seq !== seq) return;
            ensureRole(role);
            view.run.roles[role] = {
                status: 'error',
                error: safeMessage(error),
            };
            view.run.failingRole = role;
            updateRunBox(container, view);
        }
    });

    if (!view.run || view.run.seq !== seq) return { ok: false, errorMessage: 'Run superseded' };
    view.run.active = false;
    view.run.finishedAt = Date.now();

    if (result.ok) {
        updateRunBox(container, view);
        ctx.setState((prev) => ({
            ...prev,
            statusMessage: `Run complete: ${result.resultsLength} role(s) finished`
        }));
        return { ok: true };
    }

    view.run.errorMessage = result.errorMessage;
    if (result.failingRole) view.run.failingRole = result.failingRole;
    updateRunBox(container, view);

    const failureMessage = `Run failed${view.run.failingRole ? ` at ${view.run.failingRole}` : ''}: ${view.run.errorMessage}`;
    ctx.setState((prev) => ({
        ...prev,
        statusMessage: failureMessage
    }));
    return { ok: false, errorMessage: failureMessage };
}

export async function runSelectedTaskAction(container: any, ctx: TasksViewContext): Promise<RunOutcome> {
    const view = getOrCreateView(container, ctx);
    return runSelectedTask(container, view, ctx);
}

export async function runTaskNonInteractive(options: {
    config: Config;
    projectId: string;
    taskId: string;
}): Promise<RunOutcome> {
    const result = await executeTaskRun({
        config: options.config,
        projectId: options.projectId,
        taskId: options.taskId
    });

    if (result.ok) return { ok: true };
    const failureMessage = `Run failed${result.failingRole ? ` at ${result.failingRole}` : ''}: ${result.errorMessage}`;
    return { ok: false, errorMessage: failureMessage };
}

function getOrCreateView(container: any, ctx: TasksViewContext): TasksView {
    const existing = container[VIEW_KEY] as TasksView | undefined;
    if (existing && !existing.disposed) return existing;

    const projectsList = blessed.list({
        parent: container,
        top: 0,
        left: 0,
        bottom: 8,
        width: '35%',
        label: ' Projects ',
        border: { type: 'line' },
        tags: true,
        keys: true,
        mouse: false,
        scrollbar: { ch: ' ', track: { bg: 'black' }, style: { bg: 'white' } },
        style: {
            selected: { bg: 'blue', fg: 'white' },
            item: { fg: 'white' },
            border: { fg: 'cyan' }
        }
    });

    const tasksList = blessed.list({
        parent: container,
        top: 0,
        left: '35%',
        right: 0,
        bottom: 8,
        label: ' Tasks ',
        border: { type: 'line' },
        tags: true,
        keys: true,
        mouse: false,
        scrollbar: { ch: ' ', track: { bg: 'black' }, style: { bg: 'white' } },
        style: {
            selected: { bg: 'green', fg: 'black' },
            item: { fg: 'white' },
            border: { fg: 'gray' }
        }
    });

    const summaryBox = blessed.box({
        parent: container,
        bottom: 0,
        left: 0,
        height: 8,
        width: '60%',
        label: ' Summary ',
        border: { type: 'line' },
        tags: true,
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: formatSummary({}),
        style: { border: { fg: 'gray' } }
    });

    const runBox = blessed.box({
        parent: container,
        bottom: 0,
        left: '60%',
        right: 0,
        height: 8,
        label: ' Run ',
        border: { type: 'line' },
        tags: true,
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: formatRun(undefined),
        scrollable: true,
        alwaysScroll: true,
        style: { border: { fg: 'gray' } }
    });

    const view: TasksView = {
        projectsList,
        tasksList,
        summaryBox,
        runBox,
        projects: [],
        tasks: [],
        focus: 'projects',
        loadSeq: 0,
        runSeq: 0,
        disposed: false
    };

    projectsList.setItems(['(loading projects…)']);
    tasksList.setItems(['(select a project)']);

    projectsList.key(['tab'], () => setFocus(view, 'tasks'));
    tasksList.key(['tab'], () => setFocus(view, 'projects'));

    projectsList.key(['r'], () => void runSelectedTask(container, view, ctx));
    tasksList.key(['r'], () => void runSelectedTask(container, view, ctx));

    projectsList.on('select', (_item: any, index: number) => {
        const projectId = view.projects[index];
        if (!projectId) return;
        void selectProject(container, view, ctx, projectId, { commit: true });
    });

    tasksList.on('select', (_item: any, index: number) => {
        const taskId = view.tasks[index];
        if (!taskId || !view.activeProjectId) return;
        void selectTask(container, view, ctx, view.activeProjectId, taskId, { commit: true });
    });

    container[VIEW_KEY] = view;

    // Initial focus and initial load.
    setFocus(view, 'projects');
    void refreshProjects(container, view, ctx);

    return view;
}

async function refreshProjects(container: any, view: TasksView, ctx: TasksViewContext): Promise<void> {
    const seq = ++view.loadSeq;
    view.projectsList.setItems(['(loading projects…)']);
    view.tasksList.setItems(['(select a project)']);
    view.summaryBox.setContent(formatSummary({}));
    container.screen?.render?.();

    let projects: string[] = [];
    try {
        projects = await listDirectories(ctx.config.projectsDir);
        projects = projects.filter((id) => validateProjectId(id)).sort((a, b) => a.localeCompare(b));
    } catch (error) {
        view.projects = [];
        view.projectsList.setItems(['(failed to read projects dir)']);
        view.summaryBox.setContent(formatSummary({ error: String(error) }));
        container.screen?.render?.();
        return;
    }

    if (view.disposed || seq !== view.loadSeq) return;

    view.projects = projects;
    view.projectsList.setItems(projects.length > 0 ? projects : ['(no projects)']);

    const state = ctx.getState();
    const desiredProjectId = state.lastProjectId && projects.includes(state.lastProjectId) ? state.lastProjectId : projects[0];

    if (!desiredProjectId) {
        view.activeProjectId = undefined;
        view.activeTaskId = undefined;
        view.tasks = [];
        view.tasksList.setItems(['(no tasks)']);
        view.summaryBox.setContent(formatSummary({}));
        container.screen?.render?.();
        return;
    }

    const projectIndex = projects.indexOf(desiredProjectId);
    if (projectIndex >= 0) view.projectsList.select(projectIndex);

    await selectProject(container, view, ctx, desiredProjectId, { commit: !state.lastProjectId || state.lastProjectId !== desiredProjectId });
}

async function selectProject(
    container: any,
    view: TasksView,
    ctx: TasksViewContext,
    projectId: string,
    options: { commit: boolean }
): Promise<void> {
    view.activeProjectId = projectId;
    view.activeTaskId = undefined;
    view.tasks = [];
    view.tasksList.setItems(['(loading tasks…)']);
    view.summaryBox.setContent(formatSummary({ projectId }));
    container.screen?.render?.();

    const seq = ++view.loadSeq;

    let tasks: string[] = [];
    try {
        const tasksDir = join(ctx.config.projectsDir, projectId, TASKS_DIR);
        tasks = (await listDirectories(tasksDir)).sort((a, b) => a.localeCompare(b));
    } catch {
        tasks = [];
    }

    if (view.disposed || seq !== view.loadSeq) return;

    view.tasks = tasks;
    view.tasksList.setItems(tasks.length > 0 ? tasks : ['(no tasks)']);

    const state = ctx.getState();
    const desiredTaskId = state.lastTaskId && tasks.includes(state.lastTaskId) ? state.lastTaskId : tasks[0];

    if (desiredTaskId) {
        const taskIndex = tasks.indexOf(desiredTaskId);
        if (taskIndex >= 0) view.tasksList.select(taskIndex);
    }

    if (options.commit) {
        ctx.setState((prev) => {
            const nextProjectId = projectId;
            const nextTaskId = desiredTaskId;

            if (prev.lastProjectId === nextProjectId && prev.lastTaskId === nextTaskId) return prev;
            return {
                ...prev,
                lastProjectId: nextProjectId,
                lastTaskId: nextTaskId,
                statusMessage: `Selected ${nextProjectId}${nextTaskId ? ` / ${nextTaskId}` : ''}`
            };
        });
    }

    if (desiredTaskId) {
        await selectTask(container, view, ctx, projectId, desiredTaskId, { commit: false });
        setFocus(view, 'tasks');
        return;
    }

    view.activeTaskId = undefined;
    view.summaryBox.setContent(formatSummary({ projectId }));
    container.screen?.render?.();
}

async function selectTask(
    container: any,
    view: TasksView,
    ctx: TasksViewContext,
    projectId: string,
    taskId: string,
    options: { commit: boolean }
): Promise<void> {
    view.activeProjectId = projectId;
    view.activeTaskId = taskId;
    view.summaryBox.setContent(formatSummary({ projectId, taskId }));
    container.screen?.render?.();

    const taskPath = join(ctx.config.projectsDir, projectId, TASKS_DIR, taskId, TASK_FILE);
    try {
        const markdown = await Bun.file(taskPath).text();
        const parsed = parseTask(markdown, { path: taskPath });
        view.summaryBox.setContent(
            formatSummary({
                projectId,
                taskId: parsed.id,
                title: parsed.title,
                status: parsed.status,
                assignedRoles: parsed.assignedRoles
            })
        );
    } catch (error) {
        view.summaryBox.setContent(formatSummary({ projectId, taskId, error: (error as Error)?.message ?? String(error) }));
    }

    container.screen?.render?.();

    if (options.commit) {
        ctx.setState((prev) => {
            if (prev.lastProjectId === projectId && prev.lastTaskId === taskId) return prev;
            return {
                ...prev,
                lastProjectId: projectId,
                lastTaskId: taskId,
                statusMessage: `Selected ${projectId} / ${taskId}`
            };
        });
    }
}

export function cleanup(container: any): void {
    const view = container[VIEW_KEY] as TasksView | undefined;
    if (!view) return;
    view.disposed = true;

    safeDestroy(view.projectsList);
    safeDestroy(view.tasksList);
    safeDestroy(view.summaryBox);
    safeDestroy(view.runBox);

    try {
        delete container[VIEW_KEY];
    } catch {
        container[VIEW_KEY] = undefined;
    }
}

export function render(container: any, _state: TuiState, ctx?: TasksViewContext): void {
    if (!ctx) {
        container.setContent(['{bold}Tasks{/bold}', '', '(missing view context)'].join('\n'));
        return;
    }

    const view = getOrCreateView(container, ctx);

    // Keep selections in sync with state (without forcing persistence writes).
    const state = ctx.getState();
    if (state.lastProjectId && view.projects.includes(state.lastProjectId)) {
        const idx = view.projects.indexOf(state.lastProjectId);
        if (idx >= 0) view.projectsList.select(idx);
    }

    if (view.activeProjectId && state.lastTaskId && view.tasks.includes(state.lastTaskId)) {
        const idx = view.tasks.indexOf(state.lastTaskId);
        if (idx >= 0) view.tasksList.select(idx);
    }
}
