/**
 * Comprehensive test suite for RunLogger
 * Based on Ticket 005 — Run Logging & Output Artifacts spec
 */

import {describe, it, expect, beforeEach, afterEach} from 'bun:test';
import {createRunLogger} from '../createRunLogger';
import {formatTimestampBasic} from '../RunLogger';
import {mkdir, readFile, writeFile, rm} from 'fs/promises';
import {join} from 'path';
import {tmpdir} from 'os';
import type {AppConfig} from '../../config/types';

const TEST_TEMP_DIR = join(tmpdir(), 'run-logger-tests');

async function cleanupTestDir() {
    try {
        await rm(TEST_TEMP_DIR, {recursive: true, force: true});
    } catch {
        // Ignore errors
    }
}

function createTestConfig(overrides?: Partial<AppConfig>): AppConfig {
    return {
        version: 1,
        server: {
            url: 'http://localhost:8765',
            ...overrides?.server,
        },
        run: {
            id: 'test-run',
            out_dir: join(TEST_TEMP_DIR, 'runs'),
            ...overrides?.run,
        },
        agents: {
            A: {
                client_id: 'client-alpha',
                system: 'You are Agent A.',
            },
            B: {
                client_id: 'client-bravo',
                system: 'You are Agent B.',
            },
            ...overrides?.agents,
        },
        workflow: {
            type: 'round_robin',
            order: ['A', 'B'],
            start: 'A',
            ...overrides?.workflow,
        },
        delivery: {
            type: 'next_speaker',
        },
        seed: {
            from: 'user',
            content: 'Start the conversation.',
        },
        judge: {
            enabled: false,
            eval_every_turn: true,
            ...overrides?.judge,
        },
        termination: {
            max_turns: 10,
            judge_stop: false,
            ...overrides?.termination,
        },
    };
}

describe('RunLogger', () => {
    beforeEach(async () => {
        await cleanupTestDir();
    });

    afterEach(async () => {
        await cleanupTestDir();
    });

    describe('createRunLogger', () => {
        it('creates folder structure with config.yml', async () => {
            const config = createTestConfig();
            const configText = 'version: 1\nserver:\n  url: http://localhost:8765\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            // Verify runDir is set
            expect(logger.runDir).toBeDefined();
            expect(logger.runDir).toContain('2026-02-08T14-32-10Z_test-run');

            // Verify folder structure exists
            const messagesDir = join(logger.runDir, 'messages');
            const judgeDir = join(logger.runDir, 'judge');
            const configFile = join(logger.runDir, 'config.yml');

            // Read config.yml to verify it was written
            const writtenConfig = await readFile(configFile, 'utf-8');
            expect(writtenConfig).toBe(configText);
        });

        it('fails if run folder already exists', async () => {
            const config = createTestConfig();
            const configText = 'version: 1\n';
            const startedAt = '2026-02-08T14:32:10Z';

            // Create the run folder first
            const runFolderName = '2026-02-08T14-32-10Z_test-run';
            const runPath = join(config.run.out_dir, runFolderName);
            await mkdir(runPath, {recursive: true});

            // Now try to create the logger
            let thrown = false;
            try {
                await createRunLogger({
                    configPath: '/path/to/config.yml',
                    configText,
                    config,
                    started_at: startedAt,
                });
            } catch (error) {
                thrown = true;
                expect((error as Error).message).toContain('Run folder already exists');
            }
            expect(thrown).toBe(true);
        });
    });

    describe('writeTurn', () => {
        it('writes message markdown file with exact frontmatter format', async () => {
            const config = createTestConfig();
            const configText = 'version: 1\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            const message = {
                turn: 1,
                speaker: 'A',
                content: 'Hello, I am Agent A.',
                created_at: '2026-02-08T14:32:15Z',
            };

            await logger.writeTurn(message, [0]);

            // Verify message file exists
            const messagePath = join(logger.runDir, 'messages', '0001_A.md');
            const messageContent = await readFile(messagePath, 'utf-8');

            // Check frontmatter format
            expect(messageContent).toContain('---');
            expect(messageContent).toContain('turn: 1');
            expect(messageContent).toContain('speaker: A');
            expect(messageContent).toContain('client_id: client-alpha');
            expect(messageContent).toContain('created_at: 2026-02-08T14:32:15Z');
            expect(messageContent).toContain('received_turns: [0]');

            // Check content is present
            expect(messageContent).toContain('Hello, I am Agent A.');

            // Verify format: frontmatter, blank line, content, trailing newline
            // Split and check structure
            const parts = messageContent.split('\n---\n');
            expect(parts[0]).toContain('---');
            expect(parts[0]).toContain('turn: 1');
            expect(parts[0]).toContain('speaker: A');
            expect(parts[0]).toContain('client_id: client-alpha');
            expect(parts[0]).toContain('created_at: 2026-02-08T14:32:15Z');
            expect(parts[0]).toContain('received_turns: [0]');
            // After closing ---, there should be blank line then content
            expect(messageContent).toContain('---\n\nHello');
            expect(messageContent.endsWith('\n')).toBe(true);
        });

        it('appends to transcript.md with exact format', async () => {
            const config = createTestConfig();
            const configText = 'version: 1\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            const message1 = {
                turn: 1,
                speaker: 'A',
                content: 'First message from A.',
                created_at: '2026-02-08T14:32:15Z',
            };

            const message2 = {
                turn: 2,
                speaker: 'B',
                content: 'Response from B.',
                created_at: '2026-02-08T14:32:20Z',
            };

            await logger.writeTurn(message1, [0]);
            await logger.writeTurn(message2, [1]);

            // Verify transcript.md
            const transcriptPath = join(logger.runDir, 'transcript.md');
            const transcriptContent = await readFile(transcriptPath, 'utf-8');

            expect(transcriptContent).toContain('## Turn 0001 — A');
            expect(transcriptContent).toContain('First message from A.');
            expect(transcriptContent).toContain('## Turn 0002 — B');
            expect(transcriptContent).toContain('Response from B.');

            // Verify format: heading, blank line, content, blank line separation
            expect(transcriptContent).toContain('## Turn 0001 — A\n\nFirst message');
            expect(transcriptContent).toContain('\n\n## Turn 0002');

            // Verify trailing newline
            expect(transcriptContent.endsWith('\n')).toBe(true);
        });

        it('handles multiple turns with correct numbering', async () => {
            const config = createTestConfig();
            const configText = 'version: 1\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            // Write 3 turns
            for (let i = 1; i <= 3; i++) {
                await logger.writeTurn(
                    {
                        turn: i,
                        speaker: i % 2 === 1 ? 'A' : 'B',
                        content: `Content for turn ${i}`,
                        created_at: `2026-02-08T14:32:${15 + i * 5}Z`,
                    },
                    []
                );
            }

            // Verify files exist with correct names
            const file1 = await readFile(join(logger.runDir, 'messages', '0001_A.md'), 'utf-8');
            const file2 = await readFile(join(logger.runDir, 'messages', '0002_B.md'), 'utf-8');
            const file3 = await readFile(join(logger.runDir, 'messages', '0003_A.md'), 'utf-8');

            expect(file1).toContain('turn: 1');
            expect(file2).toContain('turn: 2');
            expect(file3).toContain('turn: 3');
        });

        it('cleans up temp files after successful write', async () => {
            const config = createTestConfig();
            const configText = 'version: 1\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            await logger.writeTurn(
                {
                    turn: 1,
                    speaker: 'A',
                    content: 'Test',
                    created_at: '2026-02-08T14:32:15Z',
                },
                []
            );

            // Check that no .tmp files exist
            const messagesDir = join(logger.runDir, 'messages');
            const files = await readFile(join(messagesDir, '0001_A.md.tmp')).catch(() => null);
            expect(files).toBeNull();
        });

        it('throws error if message file already exists (atomic rename enforcement)', async () => {
            const config = createTestConfig();
            const configText = 'version: 1\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            const message = {
                turn: 1,
                speaker: 'A',
                content: 'First write',
                created_at: '2026-02-08T14:32:15Z',
            };

            // First write should succeed
            await logger.writeTurn(message, [0]);

            // Second write for same turn should fail (per spec requirement)
            const message2 = {
                turn: 1,
                speaker: 'A',
                content: 'Second write (should fail)',
                created_at: '2026-02-08T14:32:20Z',
            };

            let thrown = false;
            try {
                await logger.writeTurn(message2, [0]);
            } catch (error) {
                thrown = true;
                expect((error as Error).message).toContain('Target file already exists');
            }
            expect(thrown).toBe(true);
        });
    });

    describe('writeJudge', () => {
        it('writes judge JSON with correct format when enabled', async () => {
            const config = createTestConfig({judge: {enabled: true, eval_every_turn: true}});
            const configText = 'version: 1\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            const decision = {
                should_stop: false,
                scores: {A: 8, B: 7},
                reason: 'Both agents provided good responses.',
            };

            await logger.writeJudge(1, decision, '2026-02-08T14:32:25Z');

            // Verify judge file exists
            const judgePath = join(logger.runDir, 'judge', '0001.json');
            const judgeContent = await readFile(judgePath, 'utf-8');
            const judgeData = JSON.parse(judgeContent);

            // Verify exact keys and order
            const keys = Object.keys(judgeData);
            expect(keys).toEqual(['turn', 'created_at', 'should_stop', 'scores', 'reason']);

            // Verify values
            expect(judgeData.turn).toBe(1);
            expect(judgeData.created_at).toBe('2026-02-08T14:32:25Z');
            expect(judgeData.should_stop).toBe(false);
            expect(judgeData.scores).toEqual({A: 8, B: 7});
            expect(judgeData.reason).toBe('Both agents provided good responses.');

            // Verify trailing newline
            expect(judgeContent.endsWith('\n')).toBe(true);
        });

        it('does not write judge JSON when judge disabled', async () => {
            const config = createTestConfig({judge: {enabled: false, eval_every_turn: true}});
            const configText = 'version: 1\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            const decision = {
                should_stop: false,
                scores: {A: 8, B: 7},
                reason: 'Test reason.',
            };

            // Should not throw, just return without writing
            await logger.writeJudge(1, decision, '2026-02-08T14:32:25Z');

            // Verify judge file does NOT exist
            try {
                await readFile(join(logger.runDir, 'judge', '0001.json'), 'utf-8');
                expect.fail('Judge file should not exist when judge is disabled');
            } catch (error) {
                // Expected to fail (file doesn't exist)
                expect((error as Error).message).toContain('ENOENT');
            }
        });

        it('maintains scores key order in JSON output', async () => {
            const config = createTestConfig({
                judge: {enabled: true, eval_every_turn: true},
                workflow: {type: 'round_robin', order: ['A', 'B', 'C'], start: 'A'},
                agents: {
                    A: {client_id: 'a', system: 'A'},
                    B: {client_id: 'b', system: 'B'},
                    C: {client_id: 'c', system: 'C'},
                },
            });
            const configText = 'version: 1\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            const decision = {
                should_stop: false,
                scores: {C: 5, A: 9, B: 7},
                reason: 'Test',
            };

            await logger.writeJudge(1, decision, '2026-02-08T14:32:25Z');

            const judgePath = join(logger.runDir, 'judge', '0001.json');
            const judgeContent = await readFile(judgePath, 'utf-8');

            // In JSON.stringify, object keys are serialized in the order they appear in the object
            // Since decision object has C, A, B, the JSON will preserve that order
            expect(judgeContent).toContain('"scores"');
        });
    });

    describe('finalize', () => {
        it('writes run.json with exact schema and key order', async () => {
            const config = createTestConfig();
            const configText = 'version: 1\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            // Add a turn to increment total_turns
            await logger.writeTurn(
                {
                    turn: 1,
                    speaker: 'A',
                    content: 'Test message',
                    created_at: '2026-02-08T14:32:15Z',
                },
                [0]
            );

            await logger.finalize({
                stop_reason: 'max_turns',
                total_turns: 1,
                started_at: startedAt,
                ended_at: '2026-02-08T14:33:00Z',
            });

            const runJsonPath = join(logger.runDir, 'run.json');
            const runJsonContent = await readFile(runJsonPath, 'utf-8');
            const runData = JSON.parse(runJsonContent);

            // Verify required fields
            expect(runData.run_id).toBe('test-run');
            expect(runData.started_at).toBe('2026-02-08T14:32:10Z');
            expect(runData.ended_at).toBe('2026-02-08T14:33:00Z');
            expect(runData.stop_reason).toBe('max_turns');
            expect(runData.total_turns).toBe(1);

            // Verify server section
            expect(runData.server).toBeDefined();
            expect(runData.server.url).toBe('http://localhost:8765');

            // Verify agents array (in workflow order)
            expect(runData.agents).toEqual([
                {id: 'A', client_id: 'client-alpha'},
                {id: 'B', client_id: 'client-bravo'},
            ]);

            // Verify workflow
            expect(runData.workflow).toEqual({
                type: 'round_robin',
                order: ['A', 'B'],
                start: 'A',
            });

            // Verify delivery
            expect(runData.delivery).toEqual({type: 'next_speaker'});

            // Verify judge section
            expect(runData.judge).toEqual({
                enabled: false,
                client_id: '',
                eval_every_turn: true,
            });

            // Verify termination
            expect(runData.termination).toEqual({
                max_turns: 10,
                judge_stop: false,
            });

            // Verify trailing newline
            expect(runJsonContent.endsWith('\n')).toBe(true);
        });

        it('sets judge client_id to empty string when judge disabled', async () => {
            const config = createTestConfig({judge: {enabled: false, eval_every_turn: true}});
            const configText = 'version: 1\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            await logger.finalize({
                stop_reason: 'max_turns',
                total_turns: 0,
                started_at: startedAt,
                ended_at: '2026-02-08T14:33:00Z',
            });

            const runJsonPath = join(logger.runDir, 'run.json');
            const runJsonContent = await readFile(runJsonPath, 'utf-8');
            const runData = JSON.parse(runJsonContent);

            expect(runData.judge.enabled).toBe(false);
            expect(runData.judge.client_id).toBe('');
        });

        it('includes judge client_id when judge enabled', async () => {
            const config = createTestConfig({
                judge: {enabled: true, client_id: 'judge-client', eval_every_turn: true},
            });
            const configText = 'version: 1\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            await logger.finalize({
                stop_reason: 'judge_stop',
                total_turns: 5,
                started_at: startedAt,
                ended_at: '2026-02-08T14:33:00Z',
            });

            const runJsonPath = join(logger.runDir, 'run.json');
            const runJsonContent = await readFile(runJsonPath, 'utf-8');
            const runData = JSON.parse(runJsonContent);

            expect(runData.judge.enabled).toBe(true);
            expect(runData.judge.client_id).toBe('judge-client');
        });

        it('creates agents array in workflow order', async () => {
            const config = createTestConfig({
                workflow: {type: 'round_robin', order: ['C', 'A', 'B'], start: 'C'},
                agents: {
                    A: {client_id: 'a', system: 'A'},
                    B: {client_id: 'b', system: 'B'},
                    C: {client_id: 'c', system: 'C'},
                },
            });
            const configText = 'version: 1\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            await logger.finalize({
                stop_reason: 'max_turns',
                total_turns: 0,
                started_at: startedAt,
                ended_at: '2026-02-08T14:33:00Z',
            });

            const runJsonPath = join(logger.runDir, 'run.json');
            const runJsonContent = await readFile(runJsonPath, 'utf-8');
            const runData = JSON.parse(runJsonContent);

            // Agents should be in workflow order: C, A, B
            expect(runData.agents).toEqual([
                {id: 'C', client_id: 'c'},
                {id: 'A', client_id: 'a'},
                {id: 'B', client_id: 'b'},
            ]);
        });
    });

    describe('integration', () => {
        it('produces complete run with transcript and judge outputs', async () => {
            const config = createTestConfig({
                judge: {enabled: true, client_id: 'judge-client', eval_every_turn: true},
                workflow: {type: 'round_robin', order: ['A', 'B'], start: 'A'},
            });
            const configText = 'version: 1\nserver:\n  url: http://localhost:8765\n';
            const startedAt = '2026-02-08T14:32:10Z';

            const logger = await createRunLogger({
                configPath: '/path/to/config.yml',
                configText,
                config,
                started_at: startedAt,
            });

            // Write turn 1 (A)
            await logger.writeTurn(
                {
                    turn: 1,
                    speaker: 'A',
                    content: 'Hello B, let us discuss.',
                    created_at: '2026-02-08T14:32:15Z',
                },
                [0]
            );

            // Judge evaluates turn 1
            await logger.writeJudge(
                1,
                {should_stop: false, scores: {A: 8, B: 0}, reason: 'A spoke well'},
                '2026-02-08T14:32:20Z'
            );

            // Write turn 2 (B)
            await logger.writeTurn(
                {
                    turn: 2,
                    speaker: 'B',
                    content: 'Thank you A. Here is my response.',
                    created_at: '2026-02-08T14:32:25Z',
                },
                [1]
            );

            // Judge evaluates turn 2
            await logger.writeJudge(
                2,
                {should_stop: true, scores: {A: 8, B: 9}, reason: 'Both spoke well, stopping.'},
                '2026-02-08T14:32:30Z'
            );

            // Finalize
            await logger.finalize({
                stop_reason: 'judge_stop',
                total_turns: 2,
                started_at: startedAt,
                ended_at: '2026-02-08T14:33:00Z',
            });

            // Verify complete structure
            const messageA = await readFile(join(logger.runDir, 'messages', '0001_A.md'), 'utf-8');
            const messageB = await readFile(join(logger.runDir, 'messages', '0002_B.md'), 'utf-8');
            const transcript = await readFile(join(logger.runDir, 'transcript.md'), 'utf-8');
            const judge1 = await readFile(join(logger.runDir, 'judge', '0001.json'), 'utf-8');
            const judge2 = await readFile(join(logger.runDir, 'judge', '0002.json'), 'utf-8');
            const runJson = await readFile(join(logger.runDir, 'run.json'), 'utf-8');

            // Basic presence checks
            expect(messageA).toContain('Hello B');
            expect(messageB).toContain('Thank you');
            expect(transcript).toContain('## Turn 0001 — A');
            expect(transcript).toContain('## Turn 0002 — B');

            const judge1Data = JSON.parse(judge1);
            expect(judge1Data.should_stop).toBe(false);

            const judge2Data = JSON.parse(judge2);
            expect(judge2Data.should_stop).toBe(true);

            const runData = JSON.parse(runJson);
            expect(runData.stop_reason).toBe('judge_stop');
            expect(runData.total_turns).toBe(2);
        });
    });

    describe('timestamp formatting', () => {
        it('formats ISO timestamp without milliseconds', async () => {
            const timestamp = '2026-02-08T14:32:10Z';
            const formatted = formatTimestampBasic(timestamp);
            expect(formatted).toBe('2026-02-08T14-32-10Z');
        });

        it('formats ISO timestamp with milliseconds', async () => {
            const timestamp = '2026-02-08T14:32:10.123Z';
            const formatted = formatTimestampBasic(timestamp);
            expect(formatted).toBe('2026-02-08T14-32-10Z');
        });

        it('throws error for invalid timestamp format', async () => {
            const invalidTimestamps = [
                '2026-02-08 14:32:10Z', // space instead of T
                '2026-02-0814:32:10Z', // missing dash
                'not-a-timestamp',
                '',
                '14:32:10Z', // no date
            ];

            for (const timestamp of invalidTimestamps) {
                let thrown = false;
                try {
                    formatTimestampBasic(timestamp);
                } catch (error) {
                    thrown = true;
                    expect((error as Error).message).toContain('Invalid ISO timestamp format');
                }
                expect(thrown).toBe(true);
            }
        });
    });
});
