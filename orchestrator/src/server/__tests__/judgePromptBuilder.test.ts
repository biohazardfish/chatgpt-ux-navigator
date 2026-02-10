/**
 * Unit tests for judgePromptBuilder
 * Tests exact judge prompt formatting per Ticket 004 specification
 */

import {describe, it, expect} from 'bun:test';
import {buildJudgePrompt} from '../judgePromptBuilder';
import type {AppConfig} from '../../config/types';
import type {AgentMessage} from '../../runner/types';

describe('buildJudgePrompt', () => {
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
            rubric: 'Score based on helpfulness (0-10)',
        },
        termination: {max_turns: 5, judge_stop: true},
    };

    it('test 1: includes system preamble exactly', () => {
        const transcript: AgentMessage[] = [
            {
                turn: 1,
                speaker: 'agent_a',
                content: 'Hello',
                created_at: '2025-02-08T00:00:00Z',
            },
        ];

        const result = buildJudgePrompt(baseConfig, transcript, false);

        expect(result).toContain('You are a judge for a multi-agent AI conversation.');
        expect(result).toContain('You must output ONLY a JSON object inside a fenced code block');
        expect(result).toContain('Do not include any other text outside the code block.');
        expect(result).toContain('The JSON must include: should_stop (boolean)');
        expect(result).toContain('scores (object with scores 0-100)');
        expect(result).toContain('reason (string)');
    });

    it('test 2: includes rubric section in correct format', () => {
        const transcript: AgentMessage[] = [
            {
                turn: 1,
                speaker: 'agent_a',
                content: 'Hello',
                created_at: '2025-02-08T00:00:00Z',
            },
        ];

        const result = buildJudgePrompt(baseConfig, transcript, false);

        expect(result).toContain('\nRUBRIC:\n');
        expect(result).toContain('Score based on helpfulness (0-10)');

        // Verify section ordering: preamble should come before rubric
        const preambleIdx = result.indexOf('You are a judge');
        const rubricIdx = result.indexOf('RUBRIC:');
        expect(rubricIdx > preambleIdx).toBe(true);
    });

    it('test 3: renders agent list in workflow order', () => {
        const transcript: AgentMessage[] = [
            {
                turn: 1,
                speaker: 'agent_a',
                content: 'Hello',
                created_at: '2025-02-08T00:00:00Z',
            },
        ];

        const result = buildJudgePrompt(baseConfig, transcript, false);

        expect(result).toContain('\nAGENTS:\n');
        expect(result).toContain('agent_a, agent_b');

        // Verify agents are in correct order (workflow.order)
        const agentsIdx = result.indexOf('AGENTS:');
        const agentAIdx = result.indexOf('agent_a');
        const agentBIdx = result.indexOf('agent_b');
        expect(agentAIdx > agentsIdx).toBe(true);
        expect(agentBIdx > agentAIdx).toBe(true);
    });

    it('test 4: renders transcript with 1-based indexing and blank lines', () => {
        const transcript: AgentMessage[] = [
            {
                turn: 1,
                speaker: 'agent_a',
                content: 'First message',
                created_at: '2025-02-08T00:00:00Z',
            },
            {
                turn: 2,
                speaker: 'agent_b',
                content: 'Second message',
                created_at: '2025-02-08T00:00:01Z',
            },
            {
                turn: 3,
                speaker: 'agent_a',
                content: 'Third message',
                created_at: '2025-02-08T00:00:02Z',
            },
        ];

        const result = buildJudgePrompt(baseConfig, transcript, false);

        expect(result).toContain('TRANSCRIPT (most recent last):');
        expect(result).toContain('[1] agent_a: First message');
        expect(result).toContain('[2] agent_b: Second message');
        expect(result).toContain('[3] agent_a: Third message');

        // Verify transcript comes after agents section
        const agentsIdx = result.indexOf('AGENTS:');
        const transcriptIdx = result.indexOf('TRANSCRIPT');
        expect(transcriptIdx > agentsIdx).toBe(true);
    });

    it('test 5: throws on empty transcript', () => {
        const emptyTranscript: AgentMessage[] = [];

        expect(() => {
            buildJudgePrompt(baseConfig, emptyTranscript, false);
        }).toThrow('empty transcript');
    });

    it('test 6: appends correction section on retry', () => {
        const transcript: AgentMessage[] = [
            {
                turn: 1,
                speaker: 'agent_a',
                content: 'Hello',
                created_at: '2025-02-08T00:00:00Z',
            },
        ];

        const retryResult = buildJudgePrompt(baseConfig, transcript, true, 'scores missing required agent key: agent_b');
        const nonRetryResult = buildJudgePrompt(baseConfig, transcript, false);

        // Retry should have correction section
        expect(retryResult).toContain('YOUR PREVIOUS OUTPUT WAS INVALID');
        expect(retryResult).toContain('Output ONLY a valid JSON object');
        expect(retryResult).toContain('Follow the required schema exactly:');
        expect(retryResult).toContain('Validation error: scores missing required agent key: agent_b');

        // Non-retry should not have correction section
        expect(nonRetryResult).not.toContain('YOUR PREVIOUS OUTPUT WAS INVALID');

        // Retry should be longer due to correction section
        expect(retryResult.length > nonRetryResult.length).toBe(true);
    });

    it('test 7: handles multiple agents in workflow order', () => {
        const multiAgentConfig: AppConfig = {
            ...baseConfig,
            agents: {
                ...baseConfig.agents,
                agent_c: {client_id: 'client-c', system: 'You are C'},
            },
            workflow: {
                type: 'round_robin',
                order: ['agent_c', 'agent_a', 'agent_b'],
                start: 'agent_c',
            },
        };

        const transcript: AgentMessage[] = [
            {
                turn: 1,
                speaker: 'agent_c',
                content: 'Starting',
                created_at: '2025-02-08T00:00:00Z',
            },
        ];

        const result = buildJudgePrompt(multiAgentConfig, transcript, false);

        expect(result).toContain('AGENTS:\n');
        expect(result).toContain('agent_c, agent_a, agent_b');

        // Verify exact order
        const agentCIdx = result.indexOf('agent_c');
        const agentAIdx = result.indexOf('agent_a');
        const agentBIdx = result.indexOf('agent_b');
        expect(agentCIdx < agentAIdx && agentAIdx < agentBIdx).toBe(true);
    });

    it('test 8: preserves multiline content in transcript', () => {
        const transcript: AgentMessage[] = [
            {
                turn: 1,
                speaker: 'agent_a',
                content: 'Line 1\nLine 2\nLine 3',
                created_at: '2025-02-08T00:00:00Z',
            },
        ];

        const result = buildJudgePrompt(baseConfig, transcript, false);

        expect(result).toContain('[1] agent_a: Line 1\nLine 2\nLine 3');
    });
});
