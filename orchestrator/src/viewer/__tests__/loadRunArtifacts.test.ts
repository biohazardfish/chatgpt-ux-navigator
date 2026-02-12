import {afterEach, describe, expect, it} from 'bun:test';
import {mkdtemp, mkdir, rm, writeFile} from 'fs/promises';
import {join} from 'path';
import {tmpdir} from 'os';
import {loadRunArtifacts} from '../loadRunArtifacts';

const TEST_PREFIX = 'nexus-viewer-test-';
const tempDirs: string[] = [];

afterEach(async () => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
        await rm(dir, {recursive: true, force: true});
    }
});

describe('loadRunArtifacts', () => {
    it('loads markdown messages and judge summary', async () => {
        const runDir = await mkdtemp(join(tmpdir(), TEST_PREFIX));
        tempDirs.push(runDir);

        await mkdir(join(runDir, 'messages'), {recursive: true});
        await mkdir(join(runDir, 'judge'), {recursive: true});

        await writeFile(
            join(runDir, 'run.json'),
            JSON.stringify(
                {
                    run_id: 'demo',
                    total_turns: 1,
                    stop_reason: 'max_turns',
                },
                null,
                2
            ) + '\n',
            'utf-8'
        );

        await writeFile(join(runDir, 'transcript.md'), '## Turn 0001 - alpha\n\nhello\n', 'utf-8');

        await writeFile(
            join(runDir, 'messages/0001_alpha.md'),
            [
                '---',
                'turn: 1',
                'speaker: alpha',
                'client_id: client-1',
                'created_at: 2026-02-12T00:00:00.000Z',
                'received_turns: [0]',
                '---',
                '',
                '# Hello **world**',
                '',
            ].join('\n'),
            'utf-8'
        );

        await writeFile(
            join(runDir, 'judge/0001.json'),
            JSON.stringify(
                {
                    turn: 1,
                    created_at: '2026-02-12T00:01:00.000Z',
                    should_stop: false,
                    scores: {alpha: 90},
                    reason: 'Good progression',
                },
                null,
                2
            ) + '\n',
            'utf-8'
        );

        await writeFile(
            join(runDir, 'judge/0001_summary.yaml'),
            [
                'round: 1',
                'created_at: 2026-02-12T00:01:00.000Z',
                'rolling_summary: |',
                '  short summary',
            ].join('\n') + '\n',
            'utf-8'
        );

        await writeFile(
            join(runDir, 'logs.jsonl'),
            JSON.stringify({
                timestamp: '2026-02-12T00:01:01.000Z',
                level: 'info',
                category: 'runner',
                event: 'turn_complete',
                data: {turn: 1},
            }) + '\n',
            'utf-8'
        );

        const loaded = await loadRunArtifacts(runDir);

        expect(loaded.messages.length).toBe(1);
        expect(loaded.messages[0].html).toContain('<h1>Hello <strong>world</strong></h1>');
        expect(loaded.messages[0].received_turns).toEqual([0]);

        expect(loaded.judge.length).toBe(1);
        expect(loaded.judge[0].summary?.rolling_summary).toBe('short summary');

        expect(loaded.logs.length).toBe(1);
        expect(loaded.transcript.html.length).toBeGreaterThan(0);
    });

    it('throws when run.json is missing', async () => {
        const runDir = await mkdtemp(join(tmpdir(), TEST_PREFIX));
        tempDirs.push(runDir);

        await mkdir(join(runDir, 'messages'), {recursive: true});

        await expect(loadRunArtifacts(runDir)).rejects.toThrow('Missing run.json');
    });

    it('throws when message frontmatter is missing', async () => {
        const runDir = await mkdtemp(join(tmpdir(), TEST_PREFIX));
        tempDirs.push(runDir);

        await mkdir(join(runDir, 'messages'), {recursive: true});

        await writeFile(
            join(runDir, 'run.json'),
            JSON.stringify({run_id: 'demo'}) + '\n',
            'utf-8'
        );

        await writeFile(join(runDir, 'messages/0001_alpha.md'), 'No frontmatter', 'utf-8');

        await expect(loadRunArtifacts(runDir)).rejects.toThrow(
            'Message file is missing frontmatter block'
        );
    });

    it('skips invalid logs but keeps valid entries', async () => {
        const runDir = await mkdtemp(join(tmpdir(), TEST_PREFIX));
        tempDirs.push(runDir);

        await mkdir(join(runDir, 'messages'), {recursive: true});

        await writeFile(
            join(runDir, 'run.json'),
            JSON.stringify({run_id: 'demo'}) + '\n',
            'utf-8'
        );

        await writeFile(
            join(runDir, 'messages/0001_alpha.md'),
            [
                '---',
                'turn: 1',
                'speaker: alpha',
                'client_id: client-1',
                'created_at: 2026-02-12T00:00:00.000Z',
                'received_turns: [0]',
                '---',
                '',
                'hello',
                '',
            ].join('\n'),
            'utf-8'
        );

        await writeFile(
            join(runDir, 'logs.jsonl'),
            [
                '{not valid json}',
                JSON.stringify({
                    timestamp: '2026-02-12T00:01:01.000Z',
                    level: 'info',
                    category: 'runner',
                    event: 'turn_complete',
                    data: {turn: 1},
                }),
            ].join('\n') + '\n',
            'utf-8'
        );

        const loaded = await loadRunArtifacts(runDir);

        expect(loaded.logs.length).toBe(1);
        expect(loaded.logs[0].event).toBe('turn_complete');
    });

    it('returns empty judge list when judge directory is missing', async () => {
        const runDir = await mkdtemp(join(tmpdir(), TEST_PREFIX));
        tempDirs.push(runDir);

        await mkdir(join(runDir, 'messages'), {recursive: true});

        await writeFile(
            join(runDir, 'run.json'),
            JSON.stringify({run_id: 'demo'}) + '\n',
            'utf-8'
        );

        await writeFile(
            join(runDir, 'messages/0001_alpha.md'),
            [
                '---',
                'turn: 1',
                'speaker: alpha',
                'client_id: client-1',
                'created_at: 2026-02-12T00:00:00.000Z',
                'received_turns: [0]',
                '---',
                '',
                'hello',
                '',
            ].join('\n'),
            'utf-8'
        );

        const loaded = await loadRunArtifacts(runDir);

        expect(loaded.judge.length).toBe(0);
    });
});
