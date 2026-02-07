import type {KeyEvent} from '@opentui/core';

import type {TuiLayout} from './layout.ts';
import type {TuiState, TuiViewId} from './state.ts';
import {setActiveView, setStatusMessage, clearApprovalRequest} from './state.ts';
import * as approvalModal from './approval/modal.ts';

import type {Config} from '../config/config.ts';
import {saveStateConfig} from '../config/stateConfig.ts';

export type TuiSetState = (updater: (prev: TuiState) => TuiState) => void;

function applyViewSwitch(setState: TuiSetState, view: TuiViewId): void {
    setState(prev => {
        const next = setActiveView(prev, view);
        if (next === prev) return prev;
        return setStatusMessage(next, 'Ready');
    });
}

export function registerKeybindings(
    layout: TuiLayout,
    setState: TuiSetState,
    options: {config: Config; getState: () => TuiState}
): void {
    layout.renderer.keyInput.on('keypress', (key: KeyEvent) => {
        const state = options.getState();

        // Handle approval mode first (blocks most other keys)
        if (state.approvalRequest) {
            // Allow quit during approval
            if (isKey(key, 'q')) {
                void quit(layout, setState, options);
                return;
            }

            // Handle number keys 1-9 for option selection
            const optionIndex = parseOptionKey(key);
            if (optionIndex !== -1 && optionIndex < state.approvalRequest.options.length) {
                const option = state.approvalRequest.options[optionIndex];
                const callback = state.approvalCallback;
                const approvalId = state.approvalRequest.id;

                // Clear approval state
                setState(prev => clearApprovalRequest(prev));

                // Hide modal
                approvalModal.hide(layout);

                // Invoke callback with result
                if (callback) {
                    callback({
                        approvalId,
                        selectedOptionId: option.id,
                        action: option.action,
                    });
                }
                return;
            }

            // Ignore all other keys during approval (including Esc per ticket spec)
            return;
        }

        // Normal mode key handling
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
            setState(prev => setStatusMessage(prev, 'Ready'));
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
    options: {config: Config; getState: () => TuiState}
): Promise<void> {
    try {
        const current = options.getState();
        await saveStateConfig(options.config, {
            ui: {
                lastProjectId: current.lastProjectId,
                lastTaskId: current.lastTaskId,
                activeView: current.activeView,
            },
        });
    } catch (error) {
        console.error('[tui] Failed to save state config:', error);
        setState(prev => setStatusMessage(prev, 'Failed to save UI state (see logs)'));
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

/**
 * Parses a key event as an option selection (1-9).
 * Returns the 0-indexed option number, or -1 if not a valid option key.
 */
function parseOptionKey(key: KeyEvent): number {
    const seq = key.sequence ?? '';
    const num = parseInt(seq, 10);
    if (num >= 1 && num <= 9) {
        return num - 1; // Convert to 0-indexed
    }
    return -1;
}
