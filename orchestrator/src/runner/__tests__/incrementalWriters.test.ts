/**
 * Test suite for incremental message and judge writing
 * Verifies that writeTurn and writeJudge are called at the right times
 * with the correct data
 */

import {describe, it, expect} from 'bun:test';
import {runConversation} from '../runConversation';
import type {RunnerDeps, AgentMessage, JudgeDecision} from '../types';
import type {AppConfig} from '../../config/types';

describe('Incremental Writers', () => {
    /**
     * Test 1: writeTurn is called immediately after each successful agent turn
     */
    it('test 1: writeTurn called immediately after each turn', async () => {
        const writtenTurns: Array<{
            turn: number;
            speaker: string;
            content: string;
            received_turns: number[];
        }> = [];

        const deps: RunnerDeps = {
            callAgent: async ({agent_id, turn}) => {
                return {content: `Message from ${agent_id} at turn ${turn}`};
            },
            nowISO: () => '2026-02-10T12:00:00Z',
            writeTurn: async (msg: AgentMessage, received_turns: number[]) => {
                writtenTurns.push({
                    turn: msg.turn,
                    speaker: msg.speaker,
                    content: msg.content,
                    received_turns: [...received_turns],
                });
            },
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'test_001', out_dir: '/tmp/test_001'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
            },
            workflow: {type: 'round_robin', order: ['A', 'B'], start: 'A'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 4, judge_stop: false},
        };

        await runConversation(config, deps);

        // Verify all 4 turns were written
        expect(writtenTurns.length).toBe(4);

        // Verify turn 1 (A receives seed prompt)
        expect(writtenTurns[0]).toEqual({
            turn: 1,
            speaker: 'A',
            content: 'Message from A at turn 1',
            received_turns: [], // Seed prompt is turn 0, filtered out
        });

        // Verify turn 2 (B receives turn 1)
        expect(writtenTurns[1]).toEqual({
            turn: 2,
            speaker: 'B',
            content: 'Message from B at turn 2',
            received_turns: [1],
        });

        // Verify turn 3 (A receives turn 2)
        expect(writtenTurns[2]).toEqual({
            turn: 3,
            speaker: 'A',
            content: 'Message from A at turn 3',
            received_turns: [2],
        });

        // Verify turn 4 (B receives turn 3)
        expect(writtenTurns[3]).toEqual({
            turn: 4,
            speaker: 'B',
            content: 'Message from B at turn 4',
            received_turns: [3],
        });
    });

    /**
     * Test 2: writeJudge is called immediately after each round completes
     */
    it('test 2: writeJudge called immediately after each round', async () => {
        const writtenJudge: Array<{
            turn: number;
            should_stop: boolean;
            scores: Record<string, number>;
            reason: string;
            created_at: string;
        }> = [];

        let judgeCallCount = 0;

        const deps: RunnerDeps = {
            callAgent: async ({agent_id}) => {
                return {content: `Message from ${agent_id}`};
            },
            callJudge: async ({turn}) => {
                judgeCallCount++;
                return {
                    should_stop: false,
                    scores: {A: turn, B: turn},
                    reason: `Evaluated round ${turn}`,
                };
            },
            nowISO: () => '2026-02-10T12:00:00Z',
            writeJudge: async (turn: number, decision: JudgeDecision, created_at: string) => {
                writtenJudge.push({
                    turn,
                    should_stop: decision.should_stop,
                    scores: {...decision.scores},
                    reason: decision.reason,
                    created_at,
                });
            },
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'test_002', out_dir: '/tmp/test_002'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
            },
            workflow: {type: 'round_robin', order: ['A', 'B'], start: 'A'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: true},
            termination: {max_turns: 6, judge_stop: false},
        };

        await runConversation(config, deps);

        // Verify judge was called 3 times (3 rounds of 2 turns each)
        expect(judgeCallCount).toBe(3);
        expect(writtenJudge.length).toBe(3);

        // Verify round 1
        expect(writtenJudge[0]).toEqual({
            turn: 1,
            should_stop: false,
            scores: {A: 1, B: 1},
            reason: 'Evaluated round 1',
            created_at: '2026-02-10T12:00:00Z',
        });

        // Verify round 2
        expect(writtenJudge[1]).toEqual({
            turn: 2,
            should_stop: false,
            scores: {A: 2, B: 2},
            reason: 'Evaluated round 2',
            created_at: '2026-02-10T12:00:00Z',
        });

        // Verify round 3
        expect(writtenJudge[2]).toEqual({
            turn: 3,
            should_stop: false,
            scores: {A: 3, B: 3},
            reason: 'Evaluated round 3',
            created_at: '2026-02-10T12:00:00Z',
        });
    });

    /**
     * Test 3: writeTurn NOT called when agent fails
     */
    it('test 3: writeTurn not called for failed agent turn', async () => {
        const writtenTurns: number[] = [];

        const deps: RunnerDeps = {
            callAgent: async ({turn}) => {
                if (turn === 2) {
                    throw new Error('Agent failed');
                }
                return {content: 'OK'};
            },
            nowISO: () => '2026-02-10T12:00:00Z',
            writeTurn: async (msg: AgentMessage) => {
                writtenTurns.push(msg.turn);
            },
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'test_003', out_dir: '/tmp/test_003'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
            },
            workflow: {type: 'round_robin', order: ['A', 'B'], start: 'A'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 10, judge_stop: false},
        };

        const result = await runConversation(config, deps);

        // Only turn 1 should be written (turn 2 failed)
        expect(writtenTurns).toEqual([1]);
        expect(result.stop_reason).toBe('agent_failure');
        expect(result.total_turns).toBe(1);
    });

    /**
     * Test 4: writeJudge IS called even when agent fails (if round completes)
     */
    it('test 4: writeJudge called after round even with agent failure', async () => {
        const writtenTurns: number[] = [];
        const writtenJudgeRounds: number[] = [];

        const deps: RunnerDeps = {
            callAgent: async ({turn}) => {
                if (turn === 2) {
                    throw new Error('Agent failed at end of round');
                }
                return {content: 'OK'};
            },
            callJudge: async ({turn}) => {
                return {
                    should_stop: false,
                    scores: {A: 0, B: 0},
                    reason: `Round ${turn}`,
                };
            },
            nowISO: () => '2026-02-10T12:00:00Z',
            writeTurn: async (msg: AgentMessage) => {
                writtenTurns.push(msg.turn);
            },
            writeJudge: async (turn: number) => {
                writtenJudgeRounds.push(turn);
            },
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'test_004', out_dir: '/tmp/test_004'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
            },
            workflow: {type: 'round_robin', order: ['A', 'B'], start: 'A'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: true},
            termination: {max_turns: 10, judge_stop: false},
        };

        const result = await runConversation(config, deps);

        // Turn 1 written, turn 2 failed (not written)
        expect(writtenTurns).toEqual([1]);

        // Judge still called for round 1 (even though turn 2 failed)
        expect(writtenJudgeRounds).toEqual([1]);

        expect(result.stop_reason).toBe('agent_failure');
    });

    /**
     * Test 5: Writers are optional - run succeeds without them
     */
    it('test 5: run succeeds when writers not provided', async () => {
        const deps: RunnerDeps = {
            callAgent: async ({agent_id}) => {
                return {content: `Message from ${agent_id}`};
            },
            nowISO: () => '2026-02-10T12:00:00Z',
            // No writeTurn or writeJudge provided
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'test_005', out_dir: '/tmp/test_005'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
            },
            workflow: {type: 'round_robin', order: ['A', 'B'], start: 'A'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 4, judge_stop: false},
        };

        const result = await runConversation(config, deps);

        expect(result.stop_reason).toBe('max_turns');
        expect(result.total_turns).toBe(4);
    });

    /**
     * Test 6: received_turns accumulates for 3-agent workflow
     */
    it('test 6: received_turns tracks message accumulation in 3-agent workflow', async () => {
        const writtenTurns: Array<{
            turn: number;
            speaker: string;
            received_turns: number[];
        }> = [];

        const deps: RunnerDeps = {
            callAgent: async ({agent_id}) => {
                return {content: `Message from ${agent_id}`};
            },
            nowISO: () => '2026-02-10T12:00:00Z',
            writeTurn: async (msg: AgentMessage, received_turns: number[]) => {
                writtenTurns.push({
                    turn: msg.turn,
                    speaker: msg.speaker,
                    received_turns: [...received_turns],
                });
            },
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'test_006', out_dir: '/tmp/test_006'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
                C: {client_id: 'client_c', system: 'Agent C'},
            },
            workflow: {type: 'round_robin', order: ['A', 'B', 'C'], start: 'A'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 6, judge_stop: false},
        };

        await runConversation(config, deps);

        // Verify received_turns tracks all non-seed messages delivered to the inbox
        // since the agent last spoke (seed turn 0 is excluded).
        // With broadcast delivery, inboxes accumulate messages from multiple agents.

        expect(writtenTurns[0]).toEqual({turn: 1, speaker: 'A', received_turns: []});
        expect(writtenTurns[1]).toEqual({turn: 2, speaker: 'B', received_turns: [1]});
        expect(writtenTurns[2]).toEqual({turn: 3, speaker: 'C', received_turns: [1, 2]});
        expect(writtenTurns[3]).toEqual({turn: 4, speaker: 'A', received_turns: [2, 3]});
        expect(writtenTurns[4]).toEqual({turn: 5, speaker: 'B', received_turns: [3, 4]});
        expect(writtenTurns[5]).toEqual({turn: 6, speaker: 'C', received_turns: [4, 5]});
    });

    /**
     * Test 7: Writers called in correct order relative to agent calls
     */
    it('test 7: writers called in correct order (agent -> write -> agent -> write)', async () => {
        const callOrder: string[] = [];

        const deps: RunnerDeps = {
            callAgent: async ({agent_id, turn}) => {
                callOrder.push(`agent:${agent_id}:${turn}`);
                return {content: 'OK'};
            },
            nowISO: () => '2026-02-10T12:00:00Z',
            writeTurn: async (msg: AgentMessage) => {
                callOrder.push(`write:${msg.speaker}:${msg.turn}`);
            },
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'test_007', out_dir: '/tmp/test_007'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
            },
            workflow: {type: 'round_robin', order: ['A', 'B'], start: 'A'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 4, judge_stop: false},
        };

        await runConversation(config, deps);

        // Verify strict interleaving: agent call, then write, repeat
        expect(callOrder).toEqual([
            'agent:A:1',
            'write:A:1',
            'agent:B:2',
            'write:B:2',
            'agent:A:3',
            'write:A:3',
            'agent:B:4',
            'write:B:4',
        ]);
    });

    /**
     * Test 8: writeJudge receives full transcript data
     */
    it('test 8: writeJudge receives correct decision data', async () => {
        let capturedDecision: JudgeDecision | null = null;
        let capturedTurn: number | null = null;
        let capturedCreatedAt: string | null = null;

        const deps: RunnerDeps = {
            callAgent: async () => {
                return {content: 'OK'};
            },
            callJudge: async ({turn, transcript}) => {
                return {
                    should_stop: turn >= 2,
                    scores: {A: transcript.length, B: transcript.length},
                    reason: `Transcript has ${transcript.length} messages`,
                };
            },
            nowISO: () => '2026-02-10T15:30:45Z',
            writeJudge: async (turn: number, decision: JudgeDecision, created_at: string) => {
                // Capture the last judge call
                capturedTurn = turn;
                capturedDecision = decision;
                capturedCreatedAt = created_at;
            },
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'test_008', out_dir: '/tmp/test_008'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
            },
            workflow: {type: 'round_robin', order: ['A', 'B'], start: 'A'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: true},
            termination: {max_turns: 10, judge_stop: true},
        };

        await runConversation(config, deps);

        // Verify the last judge call (round 2) received correct data
        expect(capturedTurn).toBe(2);
        expect(capturedDecision).toEqual({
            should_stop: true,
            scores: {A: 4, B: 4}, // 4 messages in transcript after round 2
            reason: 'Transcript has 4 messages',
        });
        expect(capturedCreatedAt).toBe('2026-02-10T15:30:45Z');
    });

    /**
     * Test 9: Writer errors don't crash the runner (let them propagate)
     */
    it('test 9: writer errors propagate and stop the run', async () => {
        const deps: RunnerDeps = {
            callAgent: async ({agent_id}) => {
                return {content: `Message from ${agent_id}`};
            },
            nowISO: () => '2026-02-10T12:00:00Z',
            writeTurn: async (msg: AgentMessage) => {
                if (msg.turn === 2) {
                    throw new Error('Disk full - cannot write turn 2');
                }
            },
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'test_009', out_dir: '/tmp/test_009'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
            },
            workflow: {type: 'round_robin', order: ['A', 'B'], start: 'A'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 10, judge_stop: false},
        };

        // Expect the write error to propagate
        try {
            await runConversation(config, deps);
            expect.unreachable('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('Disk full - cannot write turn 2');
        }
    });

    /**
     * Test 10: writeJudge not called when judge disabled
     */
    it('test 10: writeJudge not called when judge is disabled', async () => {
        let writeJudgeCalls = 0;

        const deps: RunnerDeps = {
            callAgent: async () => {
                return {content: 'OK'};
            },
            nowISO: () => '2026-02-10T12:00:00Z',
            writeJudge: async () => {
                writeJudgeCalls++;
            },
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'test_010', out_dir: '/tmp/test_010'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
            },
            workflow: {type: 'round_robin', order: ['A', 'B'], start: 'A'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false}, // Judge disabled
            termination: {max_turns: 4, judge_stop: false},
        };

        await runConversation(config, deps);

        // writeJudge should never be called
        expect(writeJudgeCalls).toBe(0);
    });
});
