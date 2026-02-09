/**
 * Unit tests for judgeResponseParser
 * Tests JSON extraction from code blocks and validation per Ticket 004 specification
 */

import {describe, it, expect} from 'bun:test';
import {parseJudgeResponse, isParseError} from '../judgeResponseParser';
import type {AppConfig} from '../../config/types';

describe('judgeResponseParser', () => {
    const baseConfig: AppConfig = {
        version: 1,
        server: {url: 'http://localhost:8765', agents_new_chat: true},
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
            rubric: 'Score based on helpfulness',
            eval_every_turn: true,
        },
        termination: {max_turns: 5, judge_stop: true},
    };

    const validResponse = {
        should_stop: false,
        scores: {agent_a: 7, agent_b: 8},
        reason: 'Both agents performed well',
    };

    describe('Successful parsing', () => {
        it('test 1: parses valid ```json code block', () => {
            const responseText = `Here's my evaluation:

\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": 7, "agent_b": 8},
  "reason": "Both agents performed well"
}
\`\`\`

That's my assessment.`;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(false);
            const decision = result as any;
            expect(decision.should_stop).toBe(false);
            expect(decision.scores.agent_a).toBe(7);
            expect(decision.scores.agent_b).toBe(8);
            expect(decision.reason).toBe('Both agents performed well');
        });

        it('test 2: parses valid ``` code block (no json)', () => {
            const responseText = `Evaluation:

\`\`\`
{
  "should_stop": true,
  "scores": {"agent_a": 5, "agent_b": 6},
  "reason": "Stopping here"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(false);
            const decision = result as any;
            expect(decision.should_stop).toBe(true);
            expect(decision.scores.agent_a).toBe(5);
            expect(decision.scores.agent_b).toBe(6);
            expect(decision.reason).toBe('Stopping here');
        });

        it('test 3: extracts first code block when multiple exist', () => {
            const responseText = `First evaluation:

\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": 7, "agent_b": 8},
  "reason": "First is correct"
}
\`\`\`

And here's another (should be ignored):

\`\`\`json
{
  "should_stop": true,
  "scores": {"agent_a": 1, "agent_b": 2},
  "reason": "This should not be used"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(false);
            const decision = result as any;
            expect(decision.reason).toBe('First is correct');
        });

        it('test 4: handles edge case scores at boundaries [0, 10]', () => {
            const responseText = `\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": 0, "agent_b": 10},
  "reason": "Min and max scores"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(false);
            const decision = result as any;
            expect(decision.scores.agent_a).toBe(0);
            expect(decision.scores.agent_b).toBe(10);
        });
    });

    describe('Parsing failures', () => {
        it('test 5: fails when no code block present', () => {
            const responseText = 'No code block here, just text with some JSON-like content {}.';

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('no_code_block');
        });

        it('test 6: fails when code block exists but is empty', () => {
            const responseText = `Here's nothing:

\`\`\`json
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('json_parse_error');
        });

        it('test 7: fails on invalid JSON in code block', () => {
            const responseText = `\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": 7, "agent_b": 8},
  "reason": "Missing comma"
  "extra": "field"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('json_parse_error');
        });
    });

    describe('Validation failures', () => {
        it('test 8: fails when should_stop is not boolean', () => {
            const responseText = `\`\`\`json
{
  "should_stop": "false",
  "scores": {"agent_a": 7, "agent_b": 8},
  "reason": "should_stop is string"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('validation_error');
            expect(error.details).toContain('should_stop');
        });

        it('test 9: fails when reason is empty or missing', () => {
            const responseText = `\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": 7, "agent_b": 8},
  "reason": "   "
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('validation_error');
            expect(error.details).toContain('reason');
        });

        it('test 10: fails when missing score key for required agent', () => {
            const responseText = `\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": 7},
  "reason": "agent_b score missing"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('validation_error');
            expect(error.details).toContain('agent_b');
            expect(error.details).toContain('missing');
        });

        it('test 11: fails when extra score key not in workflow', () => {
            const responseText = `\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": 7, "agent_b": 8, "agent_c": 9},
  "reason": "Extra agent included"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('validation_error');
            expect(error.details).toContain('agent_c');
            expect(error.details).toContain('extra');
        });

        it('test 11b: fails when extra top-level key present', () => {
            const responseText = `\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": 7, "agent_b": 8},
  "reason": "Extra top-level field",
  "overall_progress": 76
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('validation_error');
            expect(error.details).toContain('overall_progress');
            expect(error.details).toContain('extra');
        });

        it('test 12: fails when score is not a number', () => {
            const responseText = `\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": "seven", "agent_b": 8},
  "reason": "Non-numeric score"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('validation_error');
            expect(error.details).toContain('agent_a');
        });

        it('test 13: fails when score is out of range [0, 100]', () => {
            const responseText = `\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": 101, "agent_b": 80},
  "reason": "Score out of range"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('validation_error');
            expect(error.details).toContain('out of range');
        });

        it('test 14: fails when score is negative', () => {
            const responseText = `\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": -1, "agent_b": 80},
  "reason": "Negative score"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('validation_error');
            expect(error.details).toContain('out of range');
        });

        it('test 15: fails when scores is not an object', () => {
            const responseText = `\`\`\`json
{
  "should_stop": false,
  "scores": [7, 8],
  "reason": "Array instead of object"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('validation_error');
            expect(error.details).toContain('object');
        });

        it('test 16: fails when response is not an object', () => {
            const responseText = `\`\`\`json
["should_stop", false, "scores", {}]
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('validation_error');
            expect(error.details).toContain('must be a JSON object');
        });

        it('test 17: fails when score is not finite (Infinity)', () => {
            const responseText = `\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": null, "agent_b": 8},
  "reason": "Null score"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(true);
            const error = result as any;
            expect(error.type).toBe('validation_error');
            expect(error.details).toContain('finite');
        });
    });

    describe('Edge cases', () => {
        it('test 18: handles reason with special characters', () => {
            const responseText = `\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": 7, "agent_b": 8},
  "reason": "Agent A said \\"hello\\" & agent B responded with <great> work!"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(false);
            const decision = result as any;
            expect(decision.reason).toContain('hello');
            expect(decision.reason).toContain('&');
        });

        it('test 19: handles whitespace in code block', () => {
            const responseText = `\`\`\`json

{
  "should_stop": false,
  "scores": {"agent_a": 7, "agent_b": 8},
  "reason": "Whitespace test"
}

\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(false);
        });

        it('test 20: handles decimal scores', () => {
            const responseText = `\`\`\`json
{
  "should_stop": false,
  "scores": {"agent_a": 7.5, "agent_b": 8.25},
  "reason": "Decimal scores"
}
\`\`\``;

            const result = parseJudgeResponse(responseText, baseConfig);

            expect(isParseError(result)).toBe(false);
            const decision = result as any;
            expect(decision.scores.agent_a).toBe(7.5);
            expect(decision.scores.agent_b).toBe(8.25);
        });
    });
});
