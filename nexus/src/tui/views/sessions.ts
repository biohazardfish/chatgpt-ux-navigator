import {join} from 'node:path';

import type {Config} from '../../config/config.ts';
import {parseTask} from '../../core/parsing/task.ts';
import {createServerClient} from '../../server/client.ts';
import {TASKS_DIR, TASK_FILE} from '../../storage/layout.ts';

import type {TuiState} from '../state.ts';
import {renderTextView} from './textView.ts';

type SessionsViewContext = {
    config: Config;
    getState: () => TuiState;
};

type SessionsView = {
    loadSeq: number;
    disposed: boolean;
};

const VIEW_KEY = Symbol.for('nexus.tui.view.sessions');
const SESSIONS_TEXT_KEY = Symbol.for('nexus.tui.view.sessions.text');

function safeMessage(error: unknown): string {
    if (!error) return 'Unknown error';
    if (error instanceof Error) return error.message;
    return String(error);
}

function getOrCreateView(container: any): SessionsView {
    const existing = container[VIEW_KEY] as SessionsView | undefined;
    if (existing && !existing.disposed) return existing;

    const view: SessionsView = {
        loadSeq: 0,
        disposed: false,
    };

    container[VIEW_KEY] = view;
    return view;
}

function formatSelection(state: TuiState): string[] {
    const projectId = state.lastProjectId?.trim();
    const taskId = state.lastTaskId?.trim();

    if (!projectId && !taskId) {
        return ['Selection: (none)', 'Tip: select a project/task in Tasks view'];
    }

    if (projectId && !taskId) {
        return [`Selection: ${projectId} / (no task)`];
    }

    if (!projectId && taskId) {
        return [`Selection: (no project) / ${taskId}`];
    }

    return [`Selection: ${projectId} / ${taskId}`];
}

function formatClientsSection(clients: string[], error?: unknown): string[] {
    if (error) {
        return ['Connected clients', `Server error: ${safeMessage(error)}`];
    }

    const sorted = [...clients].sort((a, b) => a.localeCompare(b));
    return [
        `Connected clients (${sorted.length})`,
        ...(sorted.length > 0 ? sorted.map(id => `- ${id}`) : ['(none)']),
    ];
}

function formatRequiredRolesSection(value: {
    state: TuiState;
    requiredRoles?: string[];
    requiredRolesError?: unknown;
    clients?: string[];
    clientsError?: unknown;
}): string[] {
    const projectId = value.state.lastProjectId?.trim();
    const taskId = value.state.lastTaskId?.trim();

    if (!projectId || !taskId) {
        return ['Required roles', '(no task selected)'];
    }

    if (value.requiredRolesError) {
        return ['Required roles', `Task parse error: ${safeMessage(value.requiredRolesError)}`];
    }

    const required = value.requiredRoles ?? [];
    if (required.length === 0) {
        return ['Required roles', '(none)'];
    }

    if (value.clientsError) {
        return [
            `Required roles (${required.length})`,
            ...required.map(role => `- ${role}  ? unknown (server error)`),
        ];
    }

    const clientsSet = new Set(value.clients ?? []);
    const connected = required.filter(role => clientsSet.has(role));
    const missing = required.filter(role => !clientsSet.has(role));
    const summary = `Connected: ${connected.length}  Missing: ${missing.length}`;

    return [
        `Required roles (${required.length})  ${summary}`,
        ...required.map(role => {
            const isConnected = clientsSet.has(role);
            return isConnected ? `- ${role}  connected` : `- ${role}  missing`;
        }),
        ...(missing.length > 0 ? ['', `Missing roles: ${missing.join(', ')}`] : []),
    ];
}

async function readRequiredRoles(
    ctx: SessionsViewContext,
    projectId: string,
    taskId: string
): Promise<string[]> {
    const taskPath = join(ctx.config.projectsDir, projectId, TASKS_DIR, taskId, TASK_FILE);
    const markdown = await Bun.file(taskPath).text();
    const parsed = parseTask(markdown, {path: taskPath});
    // MVP convention: required roles == assigned roles.
    return parsed.assignedRoles ?? [];
}

async function refresh(
    container: any,
    view: SessionsView,
    ctx: SessionsViewContext
): Promise<void> {
    const seq = ++view.loadSeq;
    const state = ctx.getState();

    renderTextView(
        container,
        SESSIONS_TEXT_KEY,
        'sessions-view-text',
        ['Sessions', '', ...formatSelection(state), '', '(loading...)'].join('\n')
    );

    const projectId = state.lastProjectId?.trim();
    const taskId = state.lastTaskId?.trim();

    const clientPromise = createServerClient(ctx.config).listClients();
    const rolesPromise =
        projectId && taskId ? readRequiredRoles(ctx, projectId, taskId) : undefined;

    let clients: string[] = [];
    let clientsError: unknown;
    try {
        clients = await clientPromise;
    } catch (error) {
        clientsError = error;
        clients = [];
    }

    let requiredRoles: string[] | undefined;
    let requiredRolesError: unknown;
    if (rolesPromise) {
        try {
            requiredRoles = await rolesPromise;
        } catch (error) {
            requiredRolesError = error;
            requiredRoles = undefined;
        }
    }

    if (view.disposed || seq !== view.loadSeq) return;
    if (ctx.getState().activeView !== 'sessions') return;

    const lines = [
        'Sessions',
        '',
        ...formatSelection(state),
        '',
        ...formatRequiredRolesSection({
            state,
            requiredRoles,
            requiredRolesError,
            clients,
            clientsError,
        }),
        '',
        ...formatClientsSection(clients, clientsError),
    ];

    renderTextView(container, SESSIONS_TEXT_KEY, 'sessions-view-text', lines.join('\n'));
}

export function cleanup(container: any): void {
    const view = container[VIEW_KEY] as SessionsView | undefined;
    if (!view) return;
    view.disposed = true;
    try {
        delete container[VIEW_KEY];
    } catch {
        container[VIEW_KEY] = undefined;
    }
}

export function render(container: any, _state: TuiState, ctx?: SessionsViewContext): void {
    if (!ctx) {
        renderTextView(
            container,
            SESSIONS_TEXT_KEY,
            'sessions-view-text',
            ['Sessions', '', '(missing view context)'].join('\n')
        );
        return;
    }

    const view = getOrCreateView(container);
    void refresh(container, view, ctx);
}
