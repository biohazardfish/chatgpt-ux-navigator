import {resolve} from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import type {AppConfig} from './config';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true';
}

function loadEnvFile(): void {
    const envPath = resolve(import.meta.dir, '.env');

    if (!existsSync(envPath)) {
        return;
    }

    const envContent = readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();

        const isEmptyOrComment = !trimmed || trimmed.startsWith('#');
        if (isEmptyOrComment) {
            continue;
        }

        const keyValueMatch = trimmed.match(/^([^=]+)=(.*)$/);
        if (keyValueMatch) {
            const [, rawKey = '', rawValue = ''] = keyValueMatch;
            const key = rawKey.trim();
            const value = rawValue.trim();

            const notAlreadyDefined = process.env[key] === undefined;
            if (notAlreadyDefined) {
                process.env[key] = value;
            }
        }
    }
}

export function parseEnv(): Partial<AppConfig> {
    loadEnvFile();

    const config: Partial<AppConfig> = {};

    if (process.env.PORT) {
        const port = parseInt(process.env.PORT, 10);
        if (!isNaN(port)) {
            config.port = port;
        }
    }

    if (process.env.PROMPTS_DIR) {
        config.promptsDir = resolve(process.env.PROMPTS_DIR);
    }

    if (process.env.FILES_ROOT) {
        config.filesRoot = resolve(process.env.FILES_ROOT);
    }

    if (process.env.IMAGES_DIR) {
        config.imagesDir = resolve(process.env.IMAGES_DIR);
    }

    config.noStream = parseBooleanEnv(process.env.NO_STREAM, false);
    config.debug = parseBooleanEnv(process.env.DEBUG, false);

    if (process.env.DEBUG_LOG_FILE) {
        config.debugLogFile = resolve(process.env.DEBUG_LOG_FILE);
    }

    if (process.env.REQUEST_TIMEOUT) {
        const timeout = parseInt(process.env.REQUEST_TIMEOUT, 10);
        if (!isNaN(timeout) && timeout > 0) {
            config.requestTimeout = timeout;
        }
    }

    return config;
}
