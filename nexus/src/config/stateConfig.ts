import type {Config} from './config.ts';
import {resolveInsideRoot} from '../fs/paths.ts';
import {ensureDirs} from '../fs/ensureDirs.ts';

export type StateConfig = {
    // UI convenience only. Do NOT store secrets.
    ui: {
        lastProjectId?: string;
        lastTaskId?: string;
        activeView?: string;
    };
};

function defaultStateConfig(): StateConfig {
    return {ui: {}};
}

function stripJSONC(text: string): string {
    // Keep behavior aligned with src/config/config.ts (comments stripped, strings preserved).
    return text.replace(
        /("(?:\\.|[^\\"])*"|'(?:\\.|[^\\'])*'|`(?:\\.|[^\\`])*`)|\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        (_match, group1) => {
            if (group1) return group1;
            return '';
        }
    );
}

function parseStateConfig(raw: unknown): StateConfig {
    if (!raw || typeof raw !== 'object') return defaultStateConfig();

    const maybeUi = (raw as any).ui;
    const ui: StateConfig['ui'] = {};

    if (maybeUi && typeof maybeUi === 'object') {
        if (typeof (maybeUi as any).lastProjectId === 'string')
            ui.lastProjectId = (maybeUi as any).lastProjectId;
        if (typeof (maybeUi as any).lastTaskId === 'string')
            ui.lastTaskId = (maybeUi as any).lastTaskId;
        if (typeof (maybeUi as any).activeView === 'string')
            ui.activeView = (maybeUi as any).activeView;
    }

    return {ui};
}

function getStateConfigPath(config: Config): string {
    return resolveInsideRoot(config.stateDir, 'config.jsonc');
}

export async function loadStateConfig(config: Config): Promise<StateConfig> {
    const stateConfigPath = getStateConfigPath(config);

    try {
        const file = Bun.file(stateConfigPath);
        if (!(await file.exists())) return defaultStateConfig();

        const text = await file.text();
        const stripped = stripJSONC(text);
        const parsed = JSON.parse(stripped);
        return parseStateConfig(parsed);
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(
                `Invalid JSON in state config file "${stateConfigPath}": ${error.message}`
            );
        }
        if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as any).code === 'ENOENT'
        ) {
            return defaultStateConfig();
        }
        throw error;
    }
}

export async function saveStateConfig(config: Config, state: StateConfig): Promise<void> {
    await ensureDirs([config.stateDir]);
    const stateConfigPath = getStateConfigPath(config);

    // Only persist the supported schema.
    const sanitized = parseStateConfig(state);
    const text = JSON.stringify(sanitized, null, 2) + '\n';
    await Bun.write(stateConfigPath, text);
}
