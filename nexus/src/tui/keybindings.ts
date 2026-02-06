import type { KeyEvent } from '@opentui/core';

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
    layout.renderer.keyInput.on('keypress', (key: KeyEvent) => {
        if (isKey(key, 'q')) {
            void quit(layout, setState, options);
            return;
        }

        if (isKey(key, '?')) {
            if (layout.helpOverlay.visible) {
                layout.helpOverlay.visible = false;
            } else {
                layout.helpOverlay.visible = true;
                layout.helpOverlay.zIndex = 1000;
            }
            layout.renderer.requestRender();
            return;
        }

        if (isNamedKey(key, 'escape')) {
            if (layout.helpOverlay.visible) {
                layout.helpOverlay.visible = false;
                layout.renderer.requestRender();
                return;
            }
            setState((prev) => setStatusMessage(prev, 'Ready'));
            return;
        }

        if (isKey(key, '1')) {
            applyViewSwitch(setState, 'dashboard');
            return;
        }
        if (isKey(key, '2')) {
            applyViewSwitch(setState, 'tasks');
            return;
        }
        if (isKey(key, '3')) {
            applyViewSwitch(setState, 'sessions');
            return;
        }
        if (isKey(key, '4')) {
            applyViewSwitch(setState, 'decisions');
            return;
        }
        if (isKey(key, '5')) {
            applyViewSwitch(setState, 'logs');
        }
    });
}

async function quit(
    layout: TuiLayout,
    setState: TuiSetState,
    options: { config: Config; getState: () => TuiState }
): Promise<void> {
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
        layout.renderer.destroy();
        process.exit(0);
    }
}

function isKey(key: KeyEvent, expected: string): boolean {
    return key.sequence === expected || key.name === expected;
}

function isNamedKey(key: KeyEvent, expected: string): boolean {
    return key.name === expected;
}
