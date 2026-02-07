import {loadInitialProject} from '../app/projectLoader.ts';
import {createLayout, updateFooter, updateHeader} from './layout.ts';
import {createInitialState} from './state.ts';
import type {TuiLayout} from './layout.ts';
import type {TuiState, TuiViewId} from './state.ts';
import {registerKeybindings} from './keybindings.ts';
import * as approvalModal from './approval/modal.ts';
import {validateApprovalRequest} from './approval/types.ts';

import type {Config} from '../config/config.ts';
import {loadStateConfig, saveStateConfig} from '../config/stateConfig.ts';

import * as dashboardView from './views/dashboard.ts';
import * as tasksView from './views/tasks.ts';
import * as sessionsView from './views/sessions.ts';
import * as decisionsView from './views/decisions.ts';
import * as logsView from './views/logs.ts';

function clearMain(layout: TuiLayout): void {
    const children =
        typeof layout.main.getChildren === 'function' ? [...layout.main.getChildren()] : [];
    for (const child of children) {
        try {
            layout.main.remove(child.id);
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

function renderActiveView(
    layout: TuiLayout,
    state: TuiState,
    ctx: {
        config: Config;
        setState: (updater: (prev: TuiState) => TuiState) => void;
        getState: () => TuiState;
    }
): void {
    switch (state.activeView) {
        case 'dashboard':
            dashboardView.render(layout.main, state);
            break;
        case 'tasks':
            tasksView.render(layout.main, state, ctx);
            break;
        case 'sessions':
            sessionsView.render(layout.main, state, ctx);
            break;
        case 'decisions':
            decisionsView.render(layout.main, state);
            break;
        case 'logs':
            logsView.render(layout.main, state);
            break;
    }
}

function parseViewId(value: unknown): TuiViewId | undefined {
    if (typeof value !== 'string') return undefined;
    switch (value) {
        case 'dashboard':
        case 'tasks':
        case 'sessions':
        case 'decisions':
        case 'logs':
            return value;
        default:
            return undefined;
    }
}

export async function startTui(config: Config): Promise<void> {
    const autorun = process.env.NEXUS_TUI_AUTORUN === '1';
    const exitAfterRun = process.env.NEXUS_TUI_EXIT_AFTER_RUN === '1';

    let savedUi: {lastProjectId?: string; lastTaskId?: string; activeView?: string} = {};
    let loadStateError: unknown;

    try {
        const stateConfig = await loadStateConfig(config);
        savedUi = stateConfig.ui;
    } catch (error) {
        loadStateError = error;
        console.error('[tui] Failed to load state config:', error);
    }

    const initialProjectResult = await loadInitialProject({
        config,
        preferredProjectId: savedUi.lastProjectId,
    });

    const activeProjectId = initialProjectResult.projectId;
    const activeProject = initialProjectResult.project;

    // Determine initial status message
    let initialStatus = 'Ready';
    if (loadStateError) {
        initialStatus = 'State config load failed (see logs)';
    } else if (initialProjectResult.errorMessage) {
        initialStatus = initialProjectResult.errorMessage;
    } else if (!activeProjectId) {
        initialStatus = 'No project loaded';
    } else {
        initialStatus = `Loaded project: ${activeProjectId}`;
    }

    let state: TuiState = createInitialState({
        lastProjectId: activeProjectId ?? savedUi.lastProjectId,
        lastTaskId: savedUi.lastTaskId,
        activeView: autorun ? 'tasks' : (parseViewId(savedUi.activeView) ?? 'dashboard'),
        statusMessage: initialStatus,
        project: activeProject,
    });

    const selectedProjectId = state.lastProjectId?.trim();
    const selectedTaskId = state.lastTaskId?.trim();

    // Non-interactive CI mode: run without TUI renderer (no TTY required).
    if (autorun && (!process.stdout.isTTY || !process.stdin.isTTY)) {
        const noSelectionMessage =
            'No task selected. Set ui.lastProjectId + ui.lastTaskId in state config or run interactive TUI.';

        if (!selectedProjectId || !selectedTaskId) {
            console.error('[tui]', noSelectionMessage);
            if (exitAfterRun) {
                try {
                    await saveStateConfig(config, {
                        ui: {
                            lastProjectId: state.lastProjectId,
                            lastTaskId: state.lastTaskId,
                            activeView: state.activeView,
                        },
                    });
                } catch (error) {
                    console.error('[tui] Failed to save state config:', error);
                }
                process.exit(1);
            }

            await new Promise<void>(() => {});
            return;
        }

        const result = await tasksView.runTaskNonInteractive({
            config,
            projectId: selectedProjectId,
            taskId: selectedTaskId,
        });

        if (exitAfterRun) {
            try {
                await saveStateConfig(config, {
                    ui: {
                        lastProjectId: state.lastProjectId,
                        lastTaskId: state.lastTaskId,
                        activeView: state.activeView,
                    },
                });
            } catch (error) {
                console.error('[tui] Failed to save state config:', error);
            }

            process.exit(result.ok ? 0 : 1);
        }

        await new Promise<void>(() => {});
        return;
    }

    const layout = await createLayout({projectId: savedUi.lastProjectId});

    const render = () => {
        if (lastView !== state.activeView) {
            if (lastView === 'tasks') {
                tasksView.cleanup(layout.main);
            }
            clearMain(layout);
            lastView = state.activeView;
        }

        updateHeader(layout, state.lastProjectId);
        renderActiveView(layout, state, {config, setState, getState});
        updateFooter(layout, state);

        // Handle approval modal
        if (state.approvalRequest) {
            const validation = validateApprovalRequest(state.approvalRequest);
            if (validation.valid) {
                approvalModal.render(layout, validation.request);
            } else {
                console.error(
                    '[tui] Invalid approval request:',
                    validation.error,
                    state.approvalRequest
                );
                approvalModal.renderError(layout, validation.error);
            }
        } else {
            approvalModal.hide(layout);
        }

        layout.renderer.requestRender();
    };

    let lastView: TuiViewId | undefined;

    const setState = (updater: (prev: TuiState) => TuiState) => {
        state = updater(state);
        render();
    };

    const getState = () => state;
    registerKeybindings(layout, setState, {config, getState});
    layout.renderer.on('resize', render);

    render();

    if (autorun) {
        let started = false;
        let exiting = false;

        const exitWithCode = async (code: number) => {
            if (exiting) return;
            exiting = true;
            try {
                const current = getState();
                await saveStateConfig(config, {
                    ui: {
                        lastProjectId: current.lastProjectId,
                        lastTaskId: current.lastTaskId,
                        activeView: current.activeView,
                    },
                });
            } catch (error) {
                console.error('[tui] Failed to save state config:', error);
            } finally {
                try {
                    layout.renderer.destroy();
                } catch {
                    // ignore
                }
                process.exit(code);
            }
        };

        const noSelectionMessage =
            'No task selected. Set ui.lastProjectId + ui.lastTaskId in state config or run interactive TUI.';

        const maybeStart = async () => {
            if (started) return;
            started = true;

            const current = getState();
            const projectId = current.lastProjectId?.trim();
            const taskId = current.lastTaskId?.trim();

            if (!projectId || !taskId) {
                setState(prev => ({...prev, statusMessage: noSelectionMessage}));
                if (exitAfterRun) await exitWithCode(1);
                return;
            }

            // Ensure the tasks view is mounted before invoking its Run action.
            if (current.activeView !== 'tasks') {
                setState(prev => ({...prev, activeView: 'tasks'}));
            }

            let ok = false;
            try {
                const result = await tasksView.runSelectedTaskAction(layout.main, {
                    config,
                    setState,
                    getState,
                });
                ok = result.ok;
            } catch (error) {
                ok = false;
                setState(prev => ({...prev, statusMessage: `Run failed: ${String(error)}`}));
            }

            if (exitAfterRun) {
                await exitWithCode(ok ? 0 : 1);
            }
        };

        // Defer one tick so the first render completes deterministically.
        setTimeout(() => {
            void maybeStart();
        }, 0);
    }

    // Keep the process alive until explicit exit.
    await new Promise<void>(() => {});
}
