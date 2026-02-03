import { loadConfig } from '../config/config.ts';

export async function bootstrap(): Promise<void> {
    const config = await loadConfig();
    console.log(`State directory: ${config.stateDir}`);
}
