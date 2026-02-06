import type { TuiLayout } from './layout.ts';
import type { TuiState, TuiViewId } from './state.ts';
import { setActiveView, setStatusMessage } from './state.ts';

import type { Config } from '../config/config.ts';
import { saveStateConfig } from '../config/stateConfig.ts';

export type TuiSetState = (updater: (prev: TuiState) => TuiState) => void;

function applyViewSwitch(setState: TuiSetState, view: TuiViewId): void {
    setState((prev) => {
        const next = setActiveView(prev, view);
        if (next === prev) return prev;
        return setStatusMessage(next, 'Ready');
    });
}

export function registerKeybindings(
    layout: TuiLayout,
    setState: TuiSetState,
    options: { config: Config; getState: () => TuiState }
): void {
    layout.screen.key(['q'], () => {
        void (async () => {
            try {
                const current = options.getState();
                await saveStateConfig(options.config, {
                    ui: {
                        lastProjectId: current.lastProjectId,
                        lastTaskId: current.lastTaskId,
                        activeView: current.activeView
                    }
                });
            } catch (error) {
                console.error('[tui] Failed to save state config:', error);
                setState((prev) => setStatusMessage(prev, 'Failed to save UI state (see logs)'));
            } finally {
                layout.screen.destroy();
                process.exit(0);
            }
        })();
    });

    layout.screen.key(['?'], () => {
        if (layout.helpOverlay.hidden) {
            layout.helpOverlay.show();
            layout.helpOverlay.setFront();
        } else {
            layout.helpOverlay.hide();
        }
        layout.screen.render();
    });

    layout.screen.key(['escape'], () => {
        if (!layout.helpOverlay.hidden) {
            layout.helpOverlay.hide();
            layout.screen.render();
            return;
        }
        setState((prev) => setStatusMessage(prev, 'Ready'));
    });

    layout.screen.key(['1'], () => applyViewSwitch(setState, 'dashboard'));
    layout.screen.key(['2'], () => applyViewSwitch(setState, 'tasks'));
    layout.screen.key(['3'], () => applyViewSwitch(setState, 'sessions'));
    layout.screen.key(['4'], () => applyViewSwitch(setState, 'decisions'));
    layout.screen.key(['5'], () => applyViewSwitch(setState, 'logs'));
}
