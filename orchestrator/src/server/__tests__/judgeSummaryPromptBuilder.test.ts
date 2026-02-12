/**
 * Unit tests for judgeSummaryPromptBuilder
 */

import {describe, it, expect} from 'bun:test';
import {buildJudgeSummaryPrompt} from '../judgeSummaryPromptBuilder';
import type {AppConfig} from '../../config/types';
import type {AgentMessage} from '../../runner/types';

describe('buildJudgeSummaryPrompt', () => {
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
            summary: {
                enabled: true,
                prompt: 'Summary:\n{{ROLLING_SUMMARY}}\nRound: {{ROUND_INDEX}}\nAgents: {{AGENTS}}\nSeed: {{SEED}}\nRubric: {{RUBRIC}}\nTranscript:\n{{THIS_ROUND_TRANSCRIPT}}',
                max_chars: 8000,
                window: {type: 'last_round'},
            },
        },
        termination: {max_turns: 5, judge_stop: true},
    };

    it('renders template tokens', () => {
        const transcript: AgentMessage[] = [
            {
                turn: 1,
                speaker: 'agent_a',
                content: 'Hello',
                created_at: '2026-02-08T00:00:00Z',
            },
        ];

        const result = buildJudgeSummaryPrompt({
            config: baseConfig,
            roundIndex: 3,
            rollingSummary: 'Prior summary',
            roundTranscript: transcript,
        });

        expect(result).toContain('Summary:\nPrior summary');
        expect(result).toContain('Round: 3');
        expect(result).toContain('Agents: agent_a, agent_b');
        expect(result).toContain('Seed: Start here');
        expect(result).toContain('Rubric: Score based on helpfulness (0-10)');
        expect(result).toContain('Transcript:\n[1] agent_a: Hello');
    });

    it('uses <<NONE>> when rolling summary is empty', () => {
        const transcript: AgentMessage[] = [];

        const result = buildJudgeSummaryPrompt({
            config: baseConfig,
            roundIndex: 1,
            rollingSummary: '',
            roundTranscript: transcript,
        });

        expect(result).toContain('Summary:\n<<NONE>>');
        expect(result).toContain('Transcript:\n<<EMPTY>>');
    });
});
