/**
 * Integration tests for createServerAgentCaller
 * Tests full request cycle with mocked fetch responses per Ticket 003 specification
 */

import {describe, it, expect, beforeEach, afterEach, mock} from 'bun:test';
import {createServerAgentCaller} from '../createServerAgentCaller';
import type {AppConfig} from '../../config/types';
import type {AgentCallInput} from '../../runner/types';

describe('createServerAgentCaller integration tests', () => {
    let originalFetch: typeof globalThis.fetch;
    let mockFetchImpl: ReturnType<typeof mock>;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    /**
     * Test 1: Successful agent call with streaming SSE response
     * Verifies: correct URL, headers, body structure, SSE parsing, content extraction
     */
    it('test 1: successful agent call with streaming SSE response', async () => {
        const sseResponse = `event: response.output_text.delta
data: {"delta": {"text": "Hello"}}

event: response.output_text.delta
data: {"delta": {"text": " from"}}

event: response.output_text.delta
data: {"delta": {"text": " agent"}}

event: response.output_text.done
data: {"text": "Hello from agent"}

event: response.completed
data: {"output_text": "Hello from agent"}

data: [DONE]
`;

        mockFetchImpl = mock(async (url: string, options: any) => {
            // Verify request structure
            expect(url).toBe('http://localhost:8080/responses/client_a/new');
            expect(options.method).toBe('POST');
            expect(options.headers['Content-Type']).toBe('application/json');

            const body = JSON.parse(options.body);
            expect(body.input).toContain('You are agent A');
            expect(body.input).toContain('Developer preamble');
            expect(body.input).toContain('Now write your response.');
            expect(body.stream).toBe(true);

            // Verify AbortController signal is present
            expect(options.signal).toBeDefined();

            return {
                ok: true,
                status: 200,
                headers: {
                    get: (name: string) => {
                        if (name === 'Content-Type') return 'text/event-stream';
                        return null;
                    },
                },
                text: async () => sseResponse,
            };
        });

        globalThis.fetch = mockFetchImpl as any;

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080', agents_new_chat: true},
            run: {id: 'run_001', out_dir: '/tmp/run_001'},
            agents: {
                agent_a: {client_id: 'client_a', system: 'You are agent A'},
            },
            workflow: {type: 'round_robin', order: ['agent_a'], start: 'agent_a'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 1, judge_stop: false},
        };

        const caller = createServerAgentCaller(config);
        const input: AgentCallInput = {
            agent_id: 'agent_a',
            client_id: 'client_a',
            turn: 1,
            inbox: [{turn: 0, from: 'user', content: 'Developer preamble'}],
        };

        const result = await caller.callAgent(input);

        expect(result.content).toBe('Hello from agent');
        expect(mockFetchImpl).toHaveBeenCalledTimes(1);
    });

    /**
     * Test 2: 404 response - client not connected
     * Verifies: throws specific error message with client_id, agent_id, turn
     */
    it('test 2: 404 response throws client-not-connected error', async () => {
        mockFetchImpl = mock(async () => {
            return {
                ok: false,
                status: 404,
                text: async () => 'Client not found',
            };
        });

        globalThis.fetch = mockFetchImpl as any;

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080', agents_new_chat: true},
            run: {id: 'run_002', out_dir: '/tmp/run_002'},
            agents: {
                agent_b: {client_id: 'client_missing', system: 'You are agent B'},
            },
            workflow: {type: 'round_robin', order: ['agent_b'], start: 'agent_b'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 1, judge_stop: false},
        };

        const caller = createServerAgentCaller(config);
        const input: AgentCallInput = {
            agent_id: 'agent_b',
            client_id: 'client_missing',
            turn: 5,
            inbox: [],
        };

        try {
            await caller.callAgent(input);
            expect.unreachable('Should have thrown 404 error');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe(
                "Server error: 404 - client 'client_missing' not connected for agent_b turn 5"
            );
        }
    });

    /**
     * Test 3: 409 response - inflight request conflict
     * Verifies: throws specific error message for concurrent request
     */
    it('test 3: 409 response throws inflight-conflict error', async () => {
        mockFetchImpl = mock(async () => {
            return {
                ok: false,
                status: 409,
                text: async () => 'Client has inflight request',
            };
        });

        globalThis.fetch = mockFetchImpl as any;

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080', agents_new_chat: true},
            run: {id: 'run_003', out_dir: '/tmp/run_003'},
            agents: {
                agent_c: {client_id: 'client_busy', system: 'You are agent C'},
            },
            workflow: {type: 'round_robin', order: ['agent_c'], start: 'agent_c'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 1, judge_stop: false},
        };

        const caller = createServerAgentCaller(config);
        const input: AgentCallInput = {
            agent_id: 'agent_c',
            client_id: 'client_busy',
            turn: 3,
            inbox: [],
        };

        try {
            await caller.callAgent(input);
            expect.unreachable('Should have thrown 409 error');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe(
                "Server error: 409 - client 'client_busy' already has an inflight request for agent_c turn 3"
            );
        }
    });

    /**
     * Test 4: 400 response - missing or invalid prompt
     * Verifies: throws specific error message for bad request
     */
    it('test 4: 400 response throws missing-or-invalid-prompt error', async () => {
        mockFetchImpl = mock(async () => {
            return {
                ok: false,
                status: 400,
                text: async () => 'Invalid prompt format',
            };
        });

        globalThis.fetch = mockFetchImpl as any;

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080', agents_new_chat: true},
            run: {id: 'run_004', out_dir: '/tmp/run_004'},
            agents: {
                agent_d: {client_id: 'client_d', system: 'You are agent D'},
            },
            workflow: {type: 'round_robin', order: ['agent_d'], start: 'agent_d'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 1, judge_stop: false},
        };

        const caller = createServerAgentCaller(config);
        const input: AgentCallInput = {
            agent_id: 'agent_d',
            client_id: 'client_d',
            turn: 2,
            inbox: [],
        };

        try {
            await caller.callAgent(input);
            expect.unreachable('Should have thrown 400 error');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe(
                'Server error: 400 - missing or invalid prompt for agent_d turn 2'
            );
        }
    });

    /**
     * Test 5: Timeout simulation with AbortError
     * Verifies: AbortError is caught and wrapped with proper error message
     */
    it('test 5: AbortError is wrapped with timeout message', async () => {
        mockFetchImpl = mock(async (_url: string, _options: any) => {
            // Immediately throw AbortError to simulate timeout
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            throw err;
        });

        globalThis.fetch = mockFetchImpl as any;

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080', agents_new_chat: true},
            run: {id: 'run_005', out_dir: '/tmp/run_005'},
            agents: {
                agent_e: {client_id: 'client_e', system: 'You are agent E'},
            },
            workflow: {type: 'round_robin', order: ['agent_e'], start: 'agent_e'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 1, judge_stop: false},
        };

        const caller = createServerAgentCaller(config);
        const input: AgentCallInput = {
            agent_id: 'agent_e',
            client_id: 'client_e',
            turn: 7,
            inbox: [],
        };

        try {
            await caller.callAgent(input);
            expect.unreachable('Should have thrown timeout error');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            // Should get the timeout wrapper message since AbortError is caught internally
            expect(message).toBe('Server request timeout for agent_e turn 7');
        }
    });

    /**
     * Test 6: Agent config not found
     * Verifies: throws error when agent_id doesn't exist in config
     */
    it('test 6: agent config not found throws error', async () => {
        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080', agents_new_chat: true},
            run: {id: 'run_006', out_dir: '/tmp/run_006'},
            agents: {
                agent_exists: {client_id: 'client_x', system: 'I exist'},
            },
            workflow: {type: 'round_robin', order: ['agent_exists'], start: 'agent_exists'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 1, judge_stop: false},
        };

        const caller = createServerAgentCaller(config);
        const input: AgentCallInput = {
            agent_id: 'agent_missing',
            client_id: 'client_y',
            turn: 4,
            inbox: [],
        };

        try {
            await caller.callAgent(input);
            expect.unreachable('Should have thrown agent-not-found error');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe(
                'Agent config not found for agent_missing turn 4'
            );
        }
    });

    /**
     * Test 7: Content-Type detection - SSE vs JSON
     * Verifies: correctly parses both SSE and JSON responses based on Content-Type
     */
    it('test 7: content-type detection handles SSE and JSON', async () => {
        // Test SSE first
        const sseResponse = `event: response.completed
data: {"response":{"output_text":"SSE response"}}

data: [DONE]
`;

        mockFetchImpl = mock(async () => {
            return {
                ok: true,
                status: 200,
                headers: {
                    get: (name: string) => {
                        if (name === 'Content-Type') return 'text/event-stream';
                        return null;
                    },
                },
                text: async () => sseResponse,
            };
        });

        globalThis.fetch = mockFetchImpl as any;

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080', agents_new_chat: true},
            run: {id: 'run_007a', out_dir: '/tmp/run_007a'},
            agents: {
                agent_f: {client_id: 'client_f', system: 'You are agent F'},
            },
            workflow: {type: 'round_robin', order: ['agent_f'], start: 'agent_f'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 1, judge_stop: false},
        };

        const caller = createServerAgentCaller(config);
        const input: AgentCallInput = {
            agent_id: 'agent_f',
            client_id: 'client_f',
            turn: 1,
            inbox: [],
        };

        let result = await caller.callAgent(input);
        expect(result.content).toBe('SSE response');

        // Now test JSON
        const jsonResponse = JSON.stringify({
            response: {
                output_text: 'JSON response',
            },
        });

        mockFetchImpl = mock(async () => {
            return {
                ok: true,
                status: 200,
                headers: {
                    get: (name: string) => {
                        if (name === 'Content-Type') return 'application/json';
                        return null;
                    },
                },
                text: async () => jsonResponse,
            };
        });

        globalThis.fetch = mockFetchImpl as any;

        result = await caller.callAgent(input);
        expect(result.content).toBe('JSON response');
    });

    /**
     * Test 8: Other HTTP error with body snippet
     * Verifies: 500 error includes truncated body (max 500 chars)
     */
    it('test 8: other HTTP errors include body snippet', async () => {
        const longErrorBody = 'Error: '.repeat(100); // > 500 chars

        mockFetchImpl = mock(async () => {
            return {
                ok: false,
                status: 500,
                text: async () => longErrorBody,
            };
        });

        globalThis.fetch = mockFetchImpl as any;

        const config: AppConfig = {
            version: 1,
            server: {url: 'http://localhost:8080', agents_new_chat: true},
            run: {id: 'run_008', out_dir: '/tmp/run_008'},
            agents: {
                agent_g: {client_id: 'client_g', system: 'You are agent G'},
            },
            workflow: {type: 'round_robin', order: ['agent_g'], start: 'agent_g'},
            delivery: {type: 'next_speaker'},
            seed: {from: 'user', content: 'Start'},
            judge: {enabled: false},
            termination: {max_turns: 1, judge_stop: false},
        };

        const caller = createServerAgentCaller(config);
        const input: AgentCallInput = {
            agent_id: 'agent_g',
            client_id: 'client_g',
            turn: 1,
            inbox: [],
        };

        try {
            await caller.callAgent(input);
            expect.unreachable('Should have thrown 500 error');
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            const message = (error as Error).message;
            expect(message).toContain('Server error: 500');
            // Verify snippet is truncated to 500 chars
            expect(message.length).toBeLessThanOrEqual('Server error: 500 '.length + 500);
        }
    });
});
