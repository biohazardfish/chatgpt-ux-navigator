import {resolve, join} from 'node:path';
import {ensureDirs} from '../fs/ensureDirs.ts';

export type Config = {
    serverBaseUrl: string;
    stateDir: string;
    projectsDir: string;
    runsDir: string;
    logsDir: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
};

function stripJSONC(text: string): string {
    return text.replace(
        /("(?:\\.|[^\\"])*"|'(?:\\.|[^\\'])*'|`(?:\\.|[^\\`])*`)|\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        (match, group1) => {
            if (group1) return group1;
            return '';
        }
    );
}

export async function loadConfig(): Promise<Config> {
    const defaults = {
        serverBaseUrl: 'http://localhost:8765',
        stateDir: './nexus_state',
        logLevel: 'info' as const,
    };

    const configFile = process.env.NEXUS_CONFIG_FILE || './nexus.config.json';
    let fileConfig: any = {};

    try {
        const file = Bun.file(configFile);
        if (await file.exists()) {
            const text = await file.text();
            const stripped = stripJSONC(text);
            fileConfig = JSON.parse(stripped);
        }
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`Invalid JSON in config file "${configFile}": ${error.message}`);
        }
        if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as any).code !== 'ENOENT'
        ) {
            throw error;
        }
    }

    const merged = {...defaults, ...fileConfig};

    if (process.env.NEXUS_SERVER_BASE_URL) {
        merged.serverBaseUrl = process.env.NEXUS_SERVER_BASE_URL;
    }
    if (process.env.NEXUS_STATE_DIR) {
        merged.stateDir = process.env.NEXUS_STATE_DIR;
    }
    if (process.env.NEXUS_LOG_LEVEL) {
        merged.logLevel = process.env.NEXUS_LOG_LEVEL as Config['logLevel'];
    }

    const stateDir = resolve(process.cwd(), merged.stateDir);
    const projectsDir = join(stateDir, 'projects');
    const runsDir = join(stateDir, 'runs');
    const logsDir = join(stateDir, 'logs');

    await ensureDirs([stateDir, projectsDir, runsDir, logsDir]);

    return {
        serverBaseUrl: merged.serverBaseUrl,
        stateDir,
        projectsDir,
        runsDir,
        logsDir,
        logLevel: merged.logLevel,
    };
}
