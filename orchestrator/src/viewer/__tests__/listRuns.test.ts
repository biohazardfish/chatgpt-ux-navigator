import {afterEach, describe, expect, it} from 'bun:test';
import {mkdtemp, mkdir, rm, writeFile} from 'fs/promises';
import {join} from 'path';
import {tmpdir} from 'os';
import {assertRunsRootDirectory, listRuns, resolveRunDirectory} from '../listRuns';

const TEST_PREFIX = 'nexus-viewer-runs-root-';
const tempDirs: string[] = [];

afterEach(async () => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
        await rm(dir, {recursive: true, force: true});
    }
});

describe('viewer runs root helpers', () => {
    it('lists only run folders containing run.json', async () => {
        const root = await mkdtemp(join(tmpdir(), TEST_PREFIX));
        tempDirs.push(root);

        const runA = join(root, '2026-02-12T10-00-00Z_a');
        const runB = join(root, '2026-02-12T11-00-00Z_b');
        const notRun = join(root, 'misc');

        await mkdir(runA, {recursive: true});
        await mkdir(runB, {recursive: true});
        await mkdir(notRun, {recursive: true});

        await writeFile(
            join(runA, 'run.json'),
            JSON.stringify({run_id: 'a', started_at: '2026-02-12T10:00:00.000Z', total_turns: 4}) +
                '\n',
            'utf-8'
        );
        await writeFile(
            join(runB, 'run.json'),
            JSON.stringify({run_id: 'b', started_at: '2026-02-12T11:00:00.000Z', total_turns: 6}) +
                '\n',
            'utf-8'
        );

        const runs = await listRuns(root);
        expect(runs.length).toBe(2);
        expect(runs[0].run_id).toBe('b');
        expect(runs[1].run_id).toBe('a');
    });

    it('rejects single run directory as runs root', async () => {
        const runDir = await mkdtemp(join(tmpdir(), TEST_PREFIX));
        tempDirs.push(runDir);

        await writeFile(
            join(runDir, 'run.json'),
            JSON.stringify({run_id: 'single'}) + '\n',
            'utf-8'
        );

        await expect(assertRunsRootDirectory(runDir)).rejects.toThrow(
            'Expected runs root directory, but got a single run directory'
        );
    });

    it('rejects traversal folder names', () => {
        expect(() => resolveRunDirectory('/tmp/runs', '../outside')).toThrow(
            'Invalid run folder name'
        );
        expect(() => resolveRunDirectory('/tmp/runs', 'a/b')).toThrow('Invalid run folder name');
    });
});
