/// <reference types="bun" />

import { rename } from 'fs/promises';
import { randomUUID } from 'crypto';

import type { Config } from '../config/config.ts';
import { ensureDir } from '../fs/ensureDirs.ts';
import { resolveInsideRoot } from '../fs/paths.ts';

export type RunStatus = 'success' | 'error' | 'timeout';

export type RunMeta = {
    status: RunStatus;
    [key: string]: unknown;
};

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

/**
 * Format: YYYYMMDDTHHMMSSZ-<role>
 * Example: 20260201T131200Z-planner
 */
export function generateRunId(role: string, startedAt: Date): string {
    const ts = `${startedAt.getUTCFullYear()}${pad2(startedAt.getUTCMonth() + 1)}${pad2(startedAt.getUTCDate())}`
        + `T${pad2(startedAt.getUTCHours())}${pad2(startedAt.getUTCMinutes())}${pad2(startedAt.getUTCSeconds())}Z`;

    const safeRole = role
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-');

    return `${ts}-${safeRole || 'role'}`;
}

export async function createRunDir(config: Config, projectId: string, runId: string): Promise<string> {
    const projectRunsDir = resolveInsideRoot(config.runsDir, projectId);
    const runDir = resolveInsideRoot(projectRunsDir, runId);
    await ensureDir(runDir);
    return runDir;
}

export async function writeRunPrompt(runDir: string, prompt: string): Promise<void> {
    const promptPath = resolveInsideRoot(runDir, 'prompt.txt');
    await Bun.write(promptPath, prompt);
}

export async function writeRunResponse(runDir: string, responseText: string): Promise<void> {
    const finalPath = resolveInsideRoot(runDir, 'response.txt');
    const tmpPath = resolveInsideRoot(runDir, `response.txt.tmp-${randomUUID()}`);

    await Bun.write(tmpPath, responseText);
    await rename(tmpPath, finalPath);
}

export async function writeRunMeta(runDir: string, meta: RunMeta): Promise<void> {
    if (!meta || typeof meta !== 'object') {
        throw new Error('Run meta must be an object');
    }
    if (meta.status !== 'success' && meta.status !== 'error' && meta.status !== 'timeout') {
        throw new Error(`Invalid run meta status: ${String(meta.status)}`);
    }

    const metaPath = resolveInsideRoot(runDir, 'meta.json');
    await Bun.write(metaPath, JSON.stringify(meta, null, 2));
}
