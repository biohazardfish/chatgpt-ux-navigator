/**
 * Unit tests for runConversation runner engine
 * Tests core behavior: round-robin, pending inbox, judge evaluation, termination
 *
 * Based on Ticket 002 test requirements
 */

import {describe, it, expect} from 'bun:test';
import {runConversation, runConversationFromState} from '../runConversation';
import type {AppConfig} from '../../config/types';
import type {
    AgentCallInput,
    AgentCallOutput,
    JudgeInput,
    JudgeDecision,
    RunnerDeps,
} from '../types';

/**
 * Test 1: 2-agent basic round-robin
 * Verifies: speakers alternate A→B→A→B
 *           inbox delivery is correct
 *           client_id is passed correctly
 */
describe('runConversation', () => {
    it('test 1: 2-agent basic round-robin', async () => {
        const mockCalls: {speaker: string; turn: number; inbox: AgentCallInput['inbox']}[] = [];
        let now_counter = 0;

        const deps: RunnerDeps = {
            callAgent: async (input: AgentCallInput) => {
                mockCalls.push({
                    speaker: input.agent_id,
                    turn: input.turn,
                    inbox: input.inbox,
                });
                expect(input.client_id).toBeDefined();
                if (input.agent_id === 'A') {
                    expect(input.client_id).toBe('client_a');
                } else if (input.agent_id === 'B') {
                    expect(input.client_id).toBe('client_b');
                }
                return {content: `Response from ${input.agent_id} at turn ${input.turn}`};
            },
            nowISO: () => {
                now_counter++;
                return `2026-02-08T12:00:${String(now_counter).padStart(2, '0')}Z`;
            },
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'run_001', out_dir: '/tmp/run_001'},
            agents: {
                A: {client_id: 'client_a', system: 'You are agent A'},
                B: {client_id: 'client_b', system: 'You are agent B'},
            },
            workflow: {
                type: 'round_robin',
                order: ['A', 'B'],
                start: 'A',
            },
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start here'},
            judge: {enabled: false},
            termination: {max_turns: 4, judge_stop: false},
        };

        const result = await runConversation(config, deps);

        // Verify speakers alternate
        expect(result.transcript.length).toBe(4);
        expect(result.transcript[0].speaker).toBe('A');
        expect(result.transcript[1].speaker).toBe('B');
        expect(result.transcript[2].speaker).toBe('A');
        expect(result.transcript[3].speaker).toBe('B');

        // Verify inbox delivery
        // A turn 1: seed only
        expect(mockCalls[0].inbox).toEqual([{turn: 0, from: 'user', content: 'Start here'}]);

        // B turn 2: seed + A1 (B has not spoken before)
        expect(mockCalls[1].inbox.length).toBe(2);
        expect(mockCalls[1].inbox[0]).toEqual({turn: 0, from: 'user', content: 'Start here'});
        expect(mockCalls[1].inbox[1].from).toBe('A');
        expect(mockCalls[1].inbox[1].turn).toBe(1);

        // A turn 3: B2 only
        expect(mockCalls[2].inbox.length).toBe(1);
        expect(mockCalls[2].inbox[0].from).toBe('B');
        expect(mockCalls[2].inbox[0].turn).toBe(2);

        // B turn 4: A3 only
        expect(mockCalls[3].inbox.length).toBe(1);
        expect(mockCalls[3].inbox[0].from).toBe('A');
        expect(mockCalls[3].inbox[0].turn).toBe(3);

        // Verify termination
        expect(result.stop_reason).toBe('max_turns');
        expect(result.total_turns).toBe(4);
        expect(result.judge).toEqual([]);
    });

    /**
     * Test 2: 3-agent pending accumulation
     * Verifies: agents receive all messages since they last spoke
     *           seed is delivered to each agent on their first turn
     */
    it('test 2: 3-agent pending accumulation', async () => {
        const mockCalls: {speaker: string; inbox: AgentCallInput['inbox']}[] = [];

        const deps: RunnerDeps = {
            callAgent: async (input: AgentCallInput) => {
                mockCalls.push({
                    speaker: input.agent_id,
                    inbox: input.inbox,
                });
                return {content: `Message from ${input.agent_id}`};
            },
            nowISO: () => '2026-02-08T12:00:00Z',
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'run_002', out_dir: '/tmp/run_002'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
                C: {client_id: 'client_c', system: 'Agent C'},
            },
            workflow: {
                type: 'round_robin',
                order: ['A', 'B', 'C'],
                start: 'A',
            },
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 6, judge_stop: false},
        };

        const result = await runConversation(config, deps);

        // Turn 1: A speaks, receives seed
        expect(mockCalls[0].speaker).toBe('A');
        expect(mockCalls[0].inbox.length).toBe(1);
        expect(mockCalls[0].inbox[0].from).toBe('user');

        // Turn 2: B speaks, receives seed + A1
        expect(mockCalls[1].speaker).toBe('B');
        expect(mockCalls[1].inbox.length).toBe(2);
        expect(mockCalls[1].inbox[0].from).toBe('user');
        expect(mockCalls[1].inbox[0].turn).toBe(0);
        expect(mockCalls[1].inbox[1].from).toBe('A');
        expect(mockCalls[1].inbox[1].turn).toBe(1);

        // Turn 3: C speaks, receives seed + A1 + B2
        expect(mockCalls[2].speaker).toBe('C');
        expect(mockCalls[2].inbox.length).toBe(3);
        expect(mockCalls[2].inbox[0].from).toBe('user');
        expect(mockCalls[2].inbox[0].turn).toBe(0);
        expect(mockCalls[2].inbox[1].from).toBe('A');
        expect(mockCalls[2].inbox[1].turn).toBe(1);
        expect(mockCalls[2].inbox[2].from).toBe('B');
        expect(mockCalls[2].inbox[2].turn).toBe(2);

        // Turn 4: A speaks again, receives B2 + C3
        expect(mockCalls[3].speaker).toBe('A');
        expect(mockCalls[3].inbox.length).toBe(2);
        expect(mockCalls[3].inbox[0].from).toBe('B');
        expect(mockCalls[3].inbox[0].turn).toBe(2);
        expect(mockCalls[3].inbox[1].from).toBe('C');
        expect(mockCalls[3].inbox[1].turn).toBe(3);

        expect(result.transcript.length).toBe(6);
        expect(result.stop_reason).toBe('max_turns');
    });

    /**
     * Test 3: Judge stop (per-round)
     * Verifies: judge is called once per round
     *           runner stops only at round boundary
     */
    it('test 3: judge stop per round', async () => {
        const judge_calls: {round: number; transcript_len: number}[] = [];

        const deps: RunnerDeps = {
            callAgent: async (input: AgentCallInput) => {
                return {content: 'Agent response'};
            },
            callJudge: async (input: JudgeInput) => {
                judge_calls.push({
                    round: input.turn,
                    transcript_len: input.transcript.length,
                });
                // Stop after round 2
                return {
                    should_stop: input.turn >= 2,
                    scores: {A: 80, B: 70},
                    reason: 'Stopping after round 2',
                };
            },
            nowISO: () => '2026-02-08T12:00:00Z',
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'run_003', out_dir: '/tmp/run_003'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
            },
            workflow: {
                type: 'round_robin',
                order: ['A', 'B'],
                start: 'A',
            },
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: true},
            termination: {max_turns: 10, judge_stop: true},
        };

        const result = await runConversation(config, deps);

        // 2 agents => 2 turns per round, stop after round 2 => 4 turns total
        expect(result.total_turns).toBe(4);
        expect(result.stop_reason).toBe('judge_stop');
        expect(judge_calls.length).toBe(2);
        expect(judge_calls[0].round).toBe(1);
        expect(judge_calls[1].round).toBe(2);
        expect(result.judge.length).toBe(2);
        expect(result.judge[1].decision.should_stop).toBe(true);
    });

    /**
     * Test 4: Max turns stop (per-round judge)
     * Verifies: runner stops at max_turns
     *           judge is called once per completed round
     */
    it('test 4: max turns stop per round', async () => {
        const deps: RunnerDeps = {
            callAgent: async (input: AgentCallInput) => {
                return {content: 'Response'};
            },
            callJudge: async (input: JudgeInput) => {
                return {
                    should_stop: false, // Never stops
                    scores: {},
                    reason: 'Continue',
                };
            },
            nowISO: () => '2026-02-08T12:00:00Z',
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'run_004', out_dir: '/tmp/run_004'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
            },
            workflow: {
                type: 'round_robin',
                order: ['A', 'B'],
                start: 'A',
            },
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: true},
            termination: {max_turns: 5, judge_stop: false},
        };

        const result = await runConversation(config, deps);

        expect(result.total_turns).toBe(5);
        expect(result.stop_reason).toBe('max_turns');
        expect(result.transcript.length).toBe(5);
        // 2 agents => floor(5 / 2) = 2 completed rounds
        expect(result.judge.length).toBe(2);
    });

    /**
     * Test 7: Judge not called mid-round
     */
    it('test 7: judge not called mid-round', async () => {
        let judgeCalls = 0;

        const deps: RunnerDeps = {
            callAgent: async () => ({content: 'Response'}),
            callJudge: async (input: JudgeInput) => {
                judgeCalls++;
                expect(input.round_transcript.length).toBeGreaterThan(0);
                return {should_stop: false, scores: {A: 50, B: 50}, reason: 'Continue'};
            },
            nowISO: () => '2026-02-08T12:00:00Z',
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'run_007', out_dir: '/tmp/run_007'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
            },
            workflow: {type: 'round_robin', order: ['A', 'B'], start: 'A'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: true},
            termination: {max_turns: 3, judge_stop: false},
        };

        await runConversation(config, deps);

        // Only one full round completed
        expect(judgeCalls).toBe(1);
    });

    /**
     * Test 8: Agent failure aborts after round and still judges
     */
    it('test 8: agent failure abort after round', async () => {
        let agentCalls = 0;
        let judgeCalls = 0;

        const deps: RunnerDeps = {
            callAgent: async () => {
                agentCalls++;
                if (agentCalls === 2) {
                    throw new Error('Agent crashed');
                }
                return {content: 'OK'};
            },
            callJudge: async (input: JudgeInput) => {
                judgeCalls++;
                expect(input.round_transcript.length).toBeGreaterThan(0);
                return {should_stop: false, scores: {A: 0, B: 0}, reason: 'Scored'};
            },
            nowISO: () => '2026-02-08T12:00:00Z',
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'run_008', out_dir: '/tmp/run_008'},
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

        expect(result.stop_reason).toBe('agent_failure');
        expect(judgeCalls).toBe(1);
        expect(result.judge.length).toBe(1);
    });

    /**
     * Test 5: Missing callJudge dependency
     * Verifies: runner throws before executing any turns
     */
    it('test 5: missing callJudge dependency', async () => {
        const deps: RunnerDeps = {
            callAgent: async () => {
                throw new Error('Should not be called');
            },
            callJudge: undefined,
            nowISO: () => '2026-02-08T12:00:00Z',
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'run_005', out_dir: '/tmp/run_005'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
            },
            workflow: {
                type: 'round_robin',
                order: ['A'],
                start: 'A',
            },
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: true}, // Enabled but no dependency
            termination: {max_turns: 10, judge_stop: false},
        };

        try {
            await runConversation(config, deps);
            expect.unreachable('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe('Missing dependency: callJudge');
        }
    });

    /**
     * Test 6: Invalid agent output
     * Verifies: runner throws when agent returns empty content
     */
    it('test 6: invalid agent output', async () => {
        let turn_counter = 0;

        const deps: RunnerDeps = {
            callAgent: async (input: AgentCallInput) => {
                turn_counter++;
                // Return empty string on turn 2
                if (turn_counter === 2) {
                    return {content: '  '}; // Only whitespace
                }
                return {content: 'Valid response'};
            },
            nowISO: () => '2026-02-08T12:00:00Z',
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'run_006', out_dir: '/tmp/run_006'},
            agents: {
                A: {client_id: 'client_a', system: 'Agent A'},
                B: {client_id: 'client_b', system: 'Agent B'},
            },
            workflow: {
                type: 'round_robin',
                order: ['A', 'B'],
                start: 'A',
            },
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 10, judge_stop: false},
        };

        try {
            await runConversation(config, deps);
            expect.unreachable('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toContain('Agent output invalid: B turn 2');
        }
    });
});

describe('runConversationFromState', () => {
    it('uses full context inbox for first resumed turn only', async () => {
        const inboxes: Array<{turn: number; agent_id: string; inbox: Array<{turn: number; from: string}>}> = [];

        const deps: RunnerDeps = {
            callAgent: async ({agent_id, turn, inbox}) => {
                inboxes.push({
                    turn,
                    agent_id,
                    inbox: inbox.map(item => ({turn: item.turn, from: item.from})),
                });
                return {content: `Message from ${agent_id} at turn ${turn}`};
            },
            nowISO: () => '2026-02-10T12:00:00Z',
        };

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080'},
            run: {id: 'run_resume_full_context', out_dir: '/tmp/run_resume_full_context'},
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

        const resumeState = {
            state: {
                turn: 3,
                speaker_idx: 0,
                pending: {
                    A: [{turn: 2, from: 'B', content: 'B2'}],
                    B: [],
                },
                transcript: [
                    {turn: 1, speaker: 'A', content: 'A1', created_at: '2026-02-10T12:00:00Z'},
                    {turn: 2, speaker: 'B', content: 'B2', created_at: '2026-02-10T12:00:00Z'},
                ],
                judge_records: [],
            },
            round: 2,
            turns_in_round: 0,
            round_start_index: 2,
            full_context_inbox: [
                {turn: 0, from: 'user', content: 'Start'},
                {turn: 1, from: 'A', content: 'A1'},
                {turn: 2, from: 'B', content: 'B2'},
            ],
        };

        await runConversationFromState(config, deps, resumeState);

        expect(inboxes[0]).toEqual({
            turn: 3,
            agent_id: 'A',
            inbox: [
                {turn: 0, from: 'user'},
                {turn: 1, from: 'A'},
                {turn: 2, from: 'B'},
            ],
        });

        expect(inboxes[1]).toEqual({
            turn: 4,
            agent_id: 'B',
            inbox: [{turn: 3, from: 'A'}],
        });
    });
});
