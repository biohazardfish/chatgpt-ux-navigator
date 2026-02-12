import {readdir, readFile, stat} from 'fs/promises';
import {isAbsolute, join, relative, resolve} from 'path';

type RunJsonLite = {
    run_id?: string;
    started_at?: string;
    ended_at?: string;
    stop_reason?: string;
    total_turns?: number;
};

export type ViewerRunListItem = {
    folder_name: string;
    run_dir: string;
    run_id: string;
    started_at: string;
    ended_at: string;
    stop_reason: string;
    total_turns: number;
};

type RunListItemWithSort = ViewerRunListItem & {
    sort_ts: number;
};

export async function assertRunsRootDirectory(runsRootInput: string): Promise<string> {
    const runsRoot = resolve(runsRootInput);
    const info = await stat(runsRoot);
    if (!info.isDirectory()) {
        throw new Error(`Runs root is not a directory: ${runsRoot}`);
    }

    const rootRunJson = join(runsRoot, 'run.json');
    try {
        const runJsonInfo = await stat(rootRunJson);
        if (runJsonInfo.isFile()) {
            throw new Error('single-run-directory');
        }
    } catch (error) {
        if (error instanceof Error && error.message === 'single-run-directory') {
            throw new Error(
                `Expected runs root directory, but got a single run directory: ${runsRoot}`
            );
        }
        // run.json does not exist at root, which is expected
    }

    return runsRoot;
}

export async function listRuns(runsRootInput: string): Promise<ViewerRunListItem[]> {
    const runsRoot = await assertRunsRootDirectory(runsRootInput);
    const entries = await readdir(runsRoot);

    const output: RunListItemWithSort[] = [];
    for (const name of entries) {
        if (!isSafeRunFolderName(name)) {
            continue;
        }

        const runDir = resolveRunDirectory(runsRoot, name);
        const item = await readRunListItem(runDir, name);
        if (item) {
            output.push(item);
        }
    }

    output.sort((a, b) => b.sort_ts - a.sort_ts || b.folder_name.localeCompare(a.folder_name));
    return output.map(({sort_ts: _, ...rest}) => rest);
}

export function resolveRunDirectory(runsRootInput: string, folderName: string): string {
    const runsRoot = resolve(runsRootInput);
    if (!isSafeRunFolderName(folderName)) {
        throw new Error(`Invalid run folder name: ${folderName}`);
    }

    const resolved = resolve(join(runsRoot, folderName));
    const rel = relative(runsRoot, resolved);
    if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error(`Run folder is outside runs root: ${folderName}`);
    }

    return resolved;
}

export function isSafeRunFolderName(name: string): boolean {
    return (
        Boolean(name) &&
        name !== '.' &&
        name !== '..' &&
        !name.includes('/') &&
        !name.includes('\\')
    );
}

async function readRunListItem(
    runDir: string,
    folderName: string
): Promise<RunListItemWithSort | null> {
    let runDirInfo;
    try {
        runDirInfo = await stat(runDir);
    } catch {
        return null;
    }
    if (!runDirInfo.isDirectory()) {
        return null;
    }

    const runJsonPath = join(runDir, 'run.json');
    let runJsonInfo;
    try {
        runJsonInfo = await stat(runJsonPath);
    } catch {
        return null;
    }
    if (!runJsonInfo.isFile()) {
        return null;
    }

    const runJson = await readRunJsonLite(runJsonPath);
    const sortTs = parseISOTime(runJson.started_at) ?? runDirInfo.mtimeMs;

    return {
        folder_name: folderName,
        run_dir: runDir,
        run_id: runJson.run_id ?? folderName,
        started_at: runJson.started_at ?? '',
        ended_at: runJson.ended_at ?? '',
        stop_reason: runJson.stop_reason ?? '',
        total_turns: runJson.total_turns ?? 0,
        sort_ts: sortTs,
    };
}

async function readRunJsonLite(path: string): Promise<RunJsonLite> {
    try {
        const text = await readFile(path, 'utf-8');
        return JSON.parse(text) as RunJsonLite;
    } catch {
        return {};
    }
}

function parseISOTime(value?: string): number | null {
    if (!value) {
        return null;
    }

    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : ts;
}
