import { loadConfig } from '../config/config.ts';
import { startTui } from '../tui/index.ts';

export async function bootstrap(): Promise<void> {
    // Ensure config is valid and state directories exist.
    const config = await loadConfig();

    // UI shell (ticket 008) + runtime UI state (stateDir/config.jsonc).
    await startTui(config);
}
