/**
 * Comprehensive test suite for loadConfig
 * Covers all validation rules from Ticket 001
 */

import {describe, it, expect} from 'bun:test';
import {loadConfig} from '../loadConfig';
import {writeFileSync, mkdirSync, rmSync} from 'fs';
import {join} from 'path';

// Test directory for temporary config files
const TEST_DIR = join(process.cwd(), '__test_configs__');

function createTestConfig(filename: string, content: string): string {
    mkdirSync(TEST_DIR, {recursive: true});
    const filePath = join(TEST_DIR, filename);
    writeFileSync(filePath, content);
    return filePath;
}

function cleanup() {
    try {
        rmSync(TEST_DIR, {recursive: true, force: true});
    } catch {
        // Ignore cleanup errors
    }
}

describe('loadConfig', () => {
    // Valid configs
    describe('valid configs', () => {
        it('loads minimal valid config', async () => {
            const configPath = createTestConfig(
                'minimal.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-alpha
    system: 'You are A.'
  B:
    client_id: agent-bravo
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Discuss.'
judge:
  enabled: true
  client_id: judge-tab
  rubric: 'Score both 0-10.'
  eval_every_turn: true
termination:
  max_turns: 10
  judge_stop: true
`
            );

            const config = await loadConfig(configPath);
            expect(config.version).toBe(1);
            expect(config.server.url).toBe('http://localhost:8765');
            expect(Object.keys(config.agents).length).toBe(2);
            expect(config.workflow.order).toEqual(['A', 'B']);
            expect(config.run.id).toBe('minimal');
            expect(config.run.out_dir).toBe('runs');
            expect(config.workflow.start).toBe('A');

            cleanup();
        });

        it('applies defaults for run.id and out_dir', async () => {
            const configPath = createTestConfig(
                'debate.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Debate.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            const config = await loadConfig(configPath);
            expect(config.run.id).toBe('debate');
            expect(config.run.out_dir).toBe('runs');

            cleanup();
        });

        it('applies default for workflow.start', async () => {
            const configPath = createTestConfig(
                'test.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
  C:
    client_id: agent-c
    system: 'You are C.'
workflow:
  type: round_robin
  order: [B, C, A]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Start.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            const config = await loadConfig(configPath);
            expect(config.workflow.start).toBe('B');

            cleanup();
        });

        it('uses explicit run.id when provided', async () => {
            const configPath = createTestConfig(
                'custom.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
run:
  id: my-custom-id
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            const config = await loadConfig(configPath);
            expect(config.run.id).toBe('my-custom-id');

            cleanup();
        });

        it('trims whitespace from string fields', async () => {
            const configPath = createTestConfig(
                'trim.yml',
                `
version: 1
server:
  url: '  http://localhost:8765  '
agents:
  A:
    client_id: '  agent-a  '
    system: '  You are A.  '
  B:
    client_id: '  agent-b  '
    system: '  You are B.  '
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: '  Trimmed content.  '
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            const config = await loadConfig(configPath);
            expect(config.server.url).toBe('http://localhost:8765');
            expect(config.agents.A.client_id).toBe('agent-a');
            expect(config.agents.A.system).toBe('You are A.');
            expect(config.seed.content).toBe('Trimmed content.');

            cleanup();
        });

        it('allows judge disabled with no client_id or rubric', async () => {
            const configPath = createTestConfig(
                'no-judge.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            const config = await loadConfig(configPath);
            expect(config.judge.enabled).toBe(false);
            expect(config.judge.client_id).toBeUndefined();
            expect(config.judge.rubric).toBeUndefined();

            cleanup();
        });

        it('validates explicit workflow.start when provided', async () => {
            const configPath = createTestConfig(
                'with-start.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
  start: B
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            const config = await loadConfig(configPath);
            expect(config.workflow.start).toBe('B');

            cleanup();
        });
    });

    // Invalid version
    describe('version validation', () => {
        it('rejects missing version', async () => {
            const configPath = createTestConfig(
                'no-version.yml',
                `
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/Invalid config/i);

            cleanup();
        });

        it('rejects version != 1', async () => {
            const configPath = createTestConfig(
                'version2.yml',
                `
version: 2
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/Invalid config/);

            cleanup();
        });
    });

    // Server validation
    describe('server validation', () => {
        it('rejects missing server', async () => {
            const configPath = createTestConfig(
                'no-server.yml',
                `
version: 1
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/server/i);

            cleanup();
        });

        it('rejects missing server.url', async () => {
            const configPath = createTestConfig(
                'no-url.yml',
                `
version: 1
server: {}
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/url.*required/i);

            cleanup();
        });

        it('rejects invalid server.url', async () => {
            const configPath = createTestConfig(
                'invalid-url.yml',
                `
version: 1
server:
  url: 'not a url'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/server.url.*valid URL/i);

            cleanup();
        });
    });

    // Agents validation
    describe('agents validation', () => {
        it('rejects < 2 agents', async () => {
            const configPath = createTestConfig(
                'one-agent.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
workflow:
  type: round_robin
  order: [A]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/2\.\.20/);

            cleanup();
        });

        it('rejects > 20 agents', async () => {
            const agents: Record<string, {client_id: string; system: string}> = {};
            const order = [];
            for (let i = 1; i <= 21; i++) {
                const id = `Agent${i}`;
                agents[id] = {
                    client_id: `client-${i}`,
                    system: `You are ${id}.`,
                };
                order.push(id);
            }

            const configPath = createTestConfig(
                'many-agents.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
${Object.entries(agents)
    .map(
        ([id, agent]) =>
            `  ${id}:
    client_id: ${agent.client_id}
    system: '${agent.system}'`
    )
    .join('\n')}
workflow:
  type: round_robin
  order: [${order.join(', ')}]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/2\.\.20/);

            cleanup();
        });

        it('rejects agent ID starting with digit', async () => {
            const configPath = createTestConfig(
                'digit-agent.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  1A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [1A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/agent id/i);

            cleanup();
        });

        it('rejects agent ID with invalid characters', async () => {
            const configPath = createTestConfig(
                'special-agent.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A@B:
    client_id: agent-a
    system: 'You are A.'
  C:
    client_id: agent-c
    system: 'You are C.'
workflow:
  type: round_robin
  order: [A@B, C]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/agent id/i);

            cleanup();
        });

        it('rejects agent missing client_id', async () => {
            const configPath = createTestConfig(
                'no-client-id.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/client_id.*required/i);

            cleanup();
        });

        it('rejects agent missing system', async () => {
            const configPath = createTestConfig(
                'no-system.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/system.*required/i);

            cleanup();
        });
    });

    // Workflow validation
    describe('workflow validation', () => {
        it('rejects wrong workflow.type', async () => {
            const configPath = createTestConfig(
                'wrong-type.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: sequential
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/workflow.type.*round_robin/i);

            cleanup();
        });

        it('rejects workflow.order with wrong length', async () => {
            const configPath = createTestConfig(
                'wrong-order-length.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/order/i);

            cleanup();
        });

        it('rejects workflow.order with unknown agent', async () => {
            const configPath = createTestConfig(
                'unknown-agent.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, C]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/unknown agent/i);

            cleanup();
        });

        it('rejects workflow.order with duplicates', async () => {
            const configPath = createTestConfig(
                'dup-agents.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/duplicate/i);

            cleanup();
        });

        it('rejects workflow.start not in order', async () => {
            const configPath = createTestConfig(
                'start-unknown.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
  start: C
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/workflow.start.*must be one of/i);

            cleanup();
        });
    });

    // Delivery validation
    describe('delivery validation', () => {
        it('rejects wrong delivery.type', async () => {
            const configPath = createTestConfig(
                'wrong-delivery.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: broadcast
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/delivery.type.*next_speaker/i);

            cleanup();
        });
    });

    // Seed validation
    describe('seed validation', () => {
        it('rejects wrong seed.from', async () => {
            const configPath = createTestConfig(
                'wrong-from.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: agent
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/seed.from.*user/i);

            cleanup();
        });

        it('rejects missing seed.content', async () => {
            const configPath = createTestConfig(
                'no-content.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/seed.content/i);

            cleanup();
        });

        it('rejects empty seed.content', async () => {
            const configPath = createTestConfig(
                'empty-content.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: '   '
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/content.*required/i);

            cleanup();
        });
    });

    // Judge validation
    describe('judge validation', () => {
        it('requires judge.client_id when enabled', async () => {
            const configPath = createTestConfig(
                'judge-no-client.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: true
  rubric: 'Score agents.'
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: true
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/judge.client_id.*required/i);

            cleanup();
        });

        it('requires judge.rubric when enabled', async () => {
            const configPath = createTestConfig(
                'judge-no-rubric.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: true
  client_id: judge-tab
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: true
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/judge.rubric.*required/i);

            cleanup();
        });

        it('requires eval_every_turn to be true', async () => {
            const configPath = createTestConfig(
                'judge-no-eval.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: true
  client_id: judge-tab
  rubric: 'Score agents.'
  eval_every_turn: false
termination:
  max_turns: 5
  judge_stop: true
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/eval_every_turn.*true/i);

            cleanup();
        });
    });

    // Termination validation
    describe('termination validation', () => {
        it('rejects max_turns < 1', async () => {
            const configPath = createTestConfig(
                'max-zero.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 0
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/max_turns/i);

            cleanup();
        });

        it('rejects max_turns > 1000', async () => {
            const configPath = createTestConfig(
                'max-too-high.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 1001
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/max_turns/i);

            cleanup();
        });

        it('rejects non-integer max_turns', async () => {
            const configPath = createTestConfig(
                'max-float.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5.5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/max_turns/i);

            cleanup();
        });

        it('rejects judge_stop true when judge disabled', async () => {
            const configPath = createTestConfig(
                'judge-stop-conflict.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: true
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/judge_stop.*must be false/i);

            cleanup();
        });
    });

    // Unknown fields
    describe('unknown fields rejection', () => {
        it('rejects unknown top-level field', async () => {
            const configPath = createTestConfig(
                'unknown-top.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
unknown_field: 123
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/unknown/i);

            cleanup();
        });

        it('rejects unknown nested field in agent', async () => {
            const configPath = createTestConfig(
                'unknown-agent.yml',
                `
version: 1
server:
  url: 'http://localhost:8765'
agents:
  A:
    client_id: agent-a
    system: 'You are A.'
    extra_field: 'not allowed'
  B:
    client_id: agent-b
    system: 'You are B.'
workflow:
  type: round_robin
  order: [A, B]
delivery:
  type: next_speaker
seed:
  from: user
  content: 'Test.'
judge:
  enabled: false
  eval_every_turn: true
termination:
  max_turns: 5
  judge_stop: false
`
            );

            await expect(loadConfig(configPath)).rejects.toThrow(/Unrecognized key/i);

            cleanup();
        });
    });
});
