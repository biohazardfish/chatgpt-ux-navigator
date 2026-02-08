/**
 * Integration tests for createServerJudgeCaller
 * Tests HTTP communication, streaming, retry logic with mocked fetch
 * Per Ticket 004 specification
 */

import {describe, it, expect, beforeEach, afterEach} from 'bun:test';
import {createServerJudgeCaller} from '../createServerJudgeCaller';
import type {AppConfig} from '../../config/types';
import type {JudgeInput} from '../../runner/types';

describe('createServerJudgeCaller', () => {
	let originalFetch: typeof fetch;
	let fetchMocks: Array<{
		response: {status: number; headers?: Record<string, string>; body: string};
	}> = [];
	let callCount = 0;

	beforeEach(() => {
		originalFetch = global.fetch;
		callCount = 0;
		fetchMocks = [];

		// Mock fetch
		global.fetch = (async (url: string, options?: RequestInit) => {
			const mockIndex = callCount++;

			// Find matching mock
			let mock = fetchMocks[mockIndex];
			if (!mock) {
				throw new Error(
					`No mock fetch setup for call ${mockIndex}. Expected call to: ${url}`
				);
			}

			return new Response(mock.response.body, {
				status: mock.response.status,
				headers: mock.response.headers || {'Content-Type': 'text/event-stream'},
			});
		}) as typeof fetch;
	});

	afterEach(() => {
		global.fetch = originalFetch;
		fetchMocks = [];
		callCount = 0;
	});

	const baseConfig: AppConfig = {
		version: 1,
		server: {url: 'http://localhost:8765'},
		run: {id: 'test-run', out_dir: '/tmp'},
		agents: {
			agent_a: {client_id: 'client-a', system: 'You are A'},
			agent_b: {client_id: 'client-b', system: 'You are B'},
		},
		workflow: {
			type: 'round_robin',
			order: ['agent_a', 'agent_b'],
			start: 'agent_a',
		},
		delivery: {type: 'next_speaker'},
		seed: {from: 'user', content: 'Start here'},
		judge: {
			enabled: true,
			client_id: 'judge-client',
			rubric: 'Score on helpfulness',
			eval_every_turn: true,
		},
		termination: {max_turns: 5, judge_stop: true},
	};

	const judgeInput: JudgeInput = {
		turn: 1,
		transcript: [
			{
				turn: 1,
				speaker: 'agent_a',
				content: 'Hello world',
				created_at: '2025-02-08T00:00:00Z',
			},
		],
	};

	describe('Configuration validation', () => {
		it('test 1: throws when judge is not enabled', () => {
			const disabledConfig: AppConfig = {
				...baseConfig,
				judge: {
					enabled: false,
					eval_every_turn: true,
				},
			};

			expect(() => {
				createServerJudgeCaller(disabledConfig);
			}).toThrow('Judge is disabled in config');
		});

		it('test 2: throws when judge client_id is missing', () => {
			const missingClientIdConfig: AppConfig = {
				...baseConfig,
				judge: {
					enabled: true,
					client_id: '',
					rubric: 'Test rubric',
					eval_every_turn: true,
				},
			};

			expect(() => {
				createServerJudgeCaller(missingClientIdConfig);
			}).toThrow('Judge client_id is required');
		});

		it('test 3: throws when judge rubric is missing', () => {
			const missingRubricConfig: AppConfig = {
				...baseConfig,
				judge: {
					enabled: true,
					client_id: 'judge-client',
					rubric: '',
					eval_every_turn: true,
				},
			};

			expect(() => {
				createServerJudgeCaller(missingRubricConfig);
			}).toThrow('Judge rubric is required');
		});
	});

	describe('Successful execution', () => {
		it('test 4: parses valid SSE response with code block', async () => {
			const judgeOutput = JSON.stringify({
				should_stop: false,
				scores: {agent_a: 7, agent_b: 8},
				reason: 'Good',
			});

			const responseObj = {
				response: {
					output_text: `Evaluation:\n\`\`\`json\n${judgeOutput}\n\`\`\``,
				},
			};

			fetchMocks.push({
				response: {
					status: 200,
					headers: {'Content-Type': 'text/event-stream'},
					body: `event: response.completed
data: ${JSON.stringify(responseObj)}

event: [DONE]
`,
				},
			});

			const caller = createServerJudgeCaller(baseConfig);
			const result = await caller.callJudge(judgeInput);

			expect(result.should_stop).toBe(false);
			expect(result.scores.agent_a).toBe(7);
			expect(result.scores.agent_b).toBe(8);
			expect(result.reason).toBe('Good');
		});

		it('test 5: uses application/json fallback parsing', async () => {
			const judgeOutput = JSON.stringify({
				should_stop: true,
				scores: {agent_a: 3, agent_b: 4},
				reason: 'Stop',
			});

			const responseObj = {
				response: {
					output_text: `Evaluation:\n\`\`\`json\n${judgeOutput}\n\`\`\``,
				},
			};

			fetchMocks.push({
				response: {
					status: 200,
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify(responseObj),
				},
			});

			const caller = createServerJudgeCaller(baseConfig);
			const result = await caller.callJudge(judgeInput);

			expect(result.should_stop).toBe(true);
		});
	});

	describe('Error handling', () => {
		it('test 6: throws on 404 with specific message', async () => {
			fetchMocks.push({
				response: {
					status: 404,
					body: 'Client not found',
				},
			});

			const caller = createServerJudgeCaller(baseConfig);

			try {
				await caller.callJudge(judgeInput);
				expect(true).toBe(false); // Should throw
			} catch (err) {
				expect(err instanceof Error).toBe(true);
				const message = (err as Error).message;
				expect(message).toContain('Server error: 404');
				expect(message).toContain('judge-client');
				expect(message).toContain('not connected');
			}
		});

		it('test 7: throws on 409 with specific message', async () => {
			fetchMocks.push({
				response: {
					status: 409,
					body: 'Inflight request exists',
				},
			});

			const caller = createServerJudgeCaller(baseConfig);

			try {
				await caller.callJudge(judgeInput);
				expect(true).toBe(false); // Should throw
			} catch (err) {
				expect(err instanceof Error).toBe(true);
				const message = (err as Error).message;
				expect(message).toContain('Server error: 409');
				expect(message).toContain('judge-client');
				expect(message).toContain('inflight request');
			}
		});
	});

	describe('Retry logic', () => {
		it('test 8: retries on parse failure', async () => {
			// First call: invalid (no code block)
			fetchMocks.push({
				response: {
					status: 200,
					headers: {'Content-Type': 'text/event-stream'},
					body: `event: response.output_text.done
data: {"text": "No code block here"}

event: [DONE]
`,
				},
			});

			// Second call (retry): valid response
			const judgeOutput = JSON.stringify({
				should_stop: false,
				scores: {agent_a: 7, agent_b: 8},
				reason: 'Fixed',
			});

			const responseObj = {
				response: {
					output_text: `Evaluation:\n\`\`\`json\n${judgeOutput}\n\`\`\``,
				},
			};

			fetchMocks.push({
				response: {
					status: 200,
					headers: {'Content-Type': 'text/event-stream'},
					body: `event: response.completed
data: ${JSON.stringify(responseObj)}

event: [DONE]
`,
				},
			});

			const caller = createServerJudgeCaller(baseConfig);
			const result = await caller.callJudge(judgeInput);

			expect(result.reason).toBe('Fixed');
			expect(callCount).toBe(2);
		});

		it('test 9: throws after retry also fails', async () => {
			// Both calls return invalid responses
			fetchMocks.push({
				response: {
					status: 200,
					headers: {'Content-Type': 'text/event-stream'},
					body: `event: response.output_text.done
data: {"text": "Invalid"}

event: [DONE]
`,
				},
			});

			fetchMocks.push({
				response: {
					status: 200,
					headers: {'Content-Type': 'text/event-stream'},
					body: `event: response.output_text.done
data: {"text": "Still invalid"}

event: [DONE]
`,
				},
			});

			const caller = createServerJudgeCaller(baseConfig);

			try {
				await caller.callJudge(judgeInput);
				expect(true).toBe(false); // Should throw
			} catch (err) {
				expect(err instanceof Error).toBe(true);
				const message = (err as Error).message;
				expect(message).toContain('Judge output invalid after retry');
			}
		});

		it('test 10: retries on validation failure (missing score)', async () => {
			// First call: missing agent_b score (validation failure)
			const invalidResponse = JSON.stringify({
				should_stop: false,
				scores: {agent_a: 7},
				reason: 'Missing score',
			});

			const invalidResponseObj = {
				response: {
					output_text: `Evaluation:\n\`\`\`json\n${invalidResponse}\n\`\`\``,
				},
			};

			fetchMocks.push({
				response: {
					status: 200,
					headers: {'Content-Type': 'text/event-stream'},
					body: `event: response.completed
data: ${JSON.stringify(invalidResponseObj)}

event: [DONE]
`,
				},
			});

			// Second call: complete scores
			const validResponse = JSON.stringify({
				should_stop: false,
				scores: {agent_a: 7, agent_b: 8},
				reason: 'Complete',
			});

			const validResponseObj = {
				response: {
					output_text: `Evaluation:\n\`\`\`json\n${validResponse}\n\`\`\``,
				},
			};

			fetchMocks.push({
				response: {
					status: 200,
					headers: {'Content-Type': 'text/event-stream'},
					body: `event: response.completed
data: ${JSON.stringify(validResponseObj)}

event: [DONE]
`,
				},
			});

			const caller = createServerJudgeCaller(baseConfig);
			const result = await caller.callJudge(judgeInput);

			expect(result.scores.agent_a).toBe(7);
			expect(result.scores.agent_b).toBe(8);
			expect(callCount).toBe(2);
		});
	});
});
