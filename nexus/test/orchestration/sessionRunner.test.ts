/// <reference lib="dom" />

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Config } from '../../src/config/config.ts';
import { ServerClientError } from '../../src/server/errors.ts';
import { META_FILE, NOTES_FILE, PLAN_FILE, PROJECT_FILE, TASKS_DIR, TASK_FILE } from '../../src/storage/layout.ts';

type FetchFn = typeof globalThis.fetch;

type ExecuteBehavior =
  | { type: 'resolve'; value: { runId: string; runDir: string; responseText: string } }
  | { type: 'reject'; error: unknown };

let executeSessionRunCalls: any[] = [];
let executeSessionRunQueue: ExecuteBehavior[] = [];

mock.module('../../src/server/runExecutor.ts', () => {
  return {
    executeSessionRun: async (params: any) => {
      executeSessionRunCalls.push(params);
      const behavior = executeSessionRunQueue.shift();
      if (!behavior) {
        throw new Error('Unexpected executeSessionRun call');
      }
      if (behavior.type === 'reject') {
        throw behavior.error;
      }
      return behavior.value;
    },
  };
});

let markTaskBlockedCalls: any[] = [];

mock.module('../../src/storage/task.ts', () => {
  return {
    markTaskBlocked: async (...args: any[]) => {
      markTaskBlockedCalls.push(args);
    },
  };
});

const { runTaskSessions } = await import('../../src/core/orchestration/sessionRunner.ts');

function createConfig(projectsDir: string): Config {
  return {
    serverBaseUrl: 'http://localhost:8765',
    stateDir: '/tmp',
    projectsDir,
    runsDir: join(projectsDir, 'runs'),
    logsDir: join(projectsDir, 'logs'),
    logLevel: 'info',
  };
}

async function writeProjectFixture(params: {
  projectsDir: string;
  projectId: string;
  projectMd?: string;
  planMd?: string;
  notesMd?: string;
}): Promise<void> {
  const { projectsDir, projectId } = params;
  const projectDir = join(projectsDir, projectId);
  await mkdir(projectDir, { recursive: true });

  const meta = {
    version: 1,
    projectId,
    createdAt: '2026-02-06T00:00:00.000Z',
    lastUpdatedAt: '2026-02-06T00:00:00.000Z',
    status: 'active',
  };

  await Promise.all([
    Bun.write(join(projectDir, META_FILE), JSON.stringify(meta, null, 2)),
    Bun.write(join(projectDir, PROJECT_FILE), params.projectMd ?? '# Project: Fixture\n'),
    Bun.write(join(projectDir, PLAN_FILE), params.planMd ?? '# Plan\n'),
    Bun.write(join(projectDir, NOTES_FILE), params.notesMd ?? '# Notes\n'),
  ]);
}

async function writeTaskFixture(params: {
  projectsDir: string;
  projectId: string;
  taskId: string;
  objective: string;
  roles: string[];
}): Promise<void> {
  const { projectsDir, projectId, taskId, objective, roles } = params;

  const taskDir = join(projectsDir, projectId, TASKS_DIR, taskId);
  await mkdir(taskDir, { recursive: true });
  const taskPath = join(taskDir, TASK_FILE);

  const markdown = [
    '# Task T-999 — Fixture Task',
    '',
    '## Status',
    'running',
    '',
    '## Objective',
    objective,
    '',
    '## Assigned Roles',
    ...roles.map((role) => `- ${role}`),
    '',
    '## Related Goals',
    '- g1',
    '',
    '## Created At',
    '2026-02-06T00:00:00.000Z',
    '',
  ].join('\n');

  await Bun.write(taskPath, markdown);
}

describe('session runner', () => {
  let originalFetch: FetchFn;
  let rootDir: string;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    executeSessionRunCalls = [];
    executeSessionRunQueue = [];
    markTaskBlockedCalls = [];

    rootDir = await mkdtemp(join(tmpdir(), 'nexus-session-runner-'));
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('executes roles sequentially (success path)', async () => {
    const projectId = 'demo-project';
    const taskId = 'T-123';
    const config = createConfig(rootDir);

    await writeProjectFixture({ projectsDir: rootDir, projectId });
    await writeTaskFixture({
      projectsDir: rootDir,
      projectId,
      taskId,
      objective: 'Ship the thing',
      roles: ['planner', 'reviewer'],
    });

    globalThis.fetch = (async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'http://localhost:8765/clients') {
        return new Response(JSON.stringify({ clients: ['planner', 'reviewer'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as FetchFn;

    executeSessionRunQueue.push(
      { type: 'resolve', value: { runId: 'run-1', runDir: '/tmp/run-1', responseText: 'ok-1' } },
      { type: 'resolve', value: { runId: 'run-2', runDir: '/tmp/run-2', responseText: 'ok-2' } },
    );

    const results = await runTaskSessions({ config, projectId, taskId });
    expect(results.map((r) => r.role)).toEqual(['planner', 'reviewer']);
    expect(executeSessionRunCalls.map((call) => call.role)).toEqual(['planner', 'reviewer']);
    expect(executeSessionRunCalls.map((call) => call.responseId)).toEqual(['planner', 'reviewer']);
    expect(executeSessionRunCalls.map((call) => call.useTemporaryChat)).toEqual([true, true]);

    expect(executeSessionRunCalls[0].prompt).toContain('ROLE: planner');
    expect(executeSessionRunCalls[0].prompt).toContain('TASK OBJECTIVE:');
    expect(executeSessionRunCalls[0].prompt).toContain('Ship the thing');
    expect(executeSessionRunCalls[0].prompt).toContain('REQUIRED REPORT FORMAT (verbatim):');
    expect(executeSessionRunCalls[0].prompt).toContain('# Report — <Role>');
  });

  it('invokes per-role progress callbacks and ignores callback failures', async () => {
    const projectId = 'demo-project';
    const taskId = 'T-789';
    const config = createConfig(rootDir);

    await writeProjectFixture({ projectsDir: rootDir, projectId });
    await writeTaskFixture({
      projectsDir: rootDir,
      projectId,
      taskId,
      objective: 'Show progress',
      roles: ['planner', 'reviewer'],
    });

    globalThis.fetch = (async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'http://localhost:8765/clients') {
        return new Response(JSON.stringify({ clients: ['planner', 'reviewer'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as FetchFn;

    executeSessionRunQueue.push(
      { type: 'resolve', value: { runId: 'run-1', runDir: '/tmp/run-1', responseText: 'ok-1' } },
      { type: 'resolve', value: { runId: 'run-2', runDir: '/tmp/run-2', responseText: 'ok-2' } },
    );

    const events: string[] = [];

    const results = await runTaskSessions({
      config,
      projectId,
      taskId,
      onRoleStart: (role) => {
        events.push(`start:${role}`);
        if (role === 'planner') {
          throw new Error('start callback failed');
        }
      },
      onRoleSuccess: async (role, result) => {
        events.push(`success:${role}:${result.runId}`);
        if (role === 'reviewer') {
          throw new Error('success callback failed');
        }
      },
      onRoleError: (role) => {
        events.push(`error:${role}`);
      },
    });

    expect(results.map((r) => r.role)).toEqual(['planner', 'reviewer']);
    expect(events).toEqual([
      'start:planner',
      'success:planner:run-1',
      'start:reviewer',
      'success:reviewer:run-2',
    ]);
  });

  it('stops on failure, marks task blocked, and does not execute later roles', async () => {
    const projectId = 'demo-project';
    const taskId = 'T-456';
    const config = createConfig(rootDir);

    await writeProjectFixture({ projectsDir: rootDir, projectId });
    await writeTaskFixture({
      projectsDir: rootDir,
      projectId,
      taskId,
      objective: 'Do the risky thing',
      roles: ['planner', 'reviewer', 'devils-advocate'],
    });

    globalThis.fetch = (async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'http://localhost:8765/clients') {
        return new Response(JSON.stringify({ clients: ['planner', 'reviewer', 'devils-advocate'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as FetchFn;

    executeSessionRunQueue.push(
      { type: 'resolve', value: { runId: 'run-1', runDir: '/tmp/run-1', responseText: 'ok-1' } },
      { type: 'reject', error: new Error('boom') },
    );

    const roleErrors: any[] = [];

    let caught: unknown;
    try {
      await runTaskSessions({
        config,
        projectId,
        taskId,
        onRoleError: (role, error) => {
          roleErrors.push({ role, error });
          throw new Error('onRoleError callback failed');
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(executeSessionRunCalls.map((call) => call.role)).toEqual(['planner', 'reviewer']);
    expect(markTaskBlockedCalls.length).toBe(1);
    expect(markTaskBlockedCalls[0][1]).toBe(projectId);
    expect(markTaskBlockedCalls[0][2]).toBe(taskId);
    expect(markTaskBlockedCalls[0][3]).toContain('Role reviewer failed');
    expect(markTaskBlockedCalls[0][3]).toContain('boom');

    expect(caught).toBeInstanceOf(Error);
    const err = caught as any;
    expect(err.taskId).toBe(taskId);
    expect(err.role).toBe('reviewer');
    expect(String(err.message)).toContain(taskId);
    expect(String(err.message)).toContain('reviewer');

    expect(roleErrors).toHaveLength(1);
    expect(roleErrors[0].role).toBe('reviewer');
    expect(roleErrors[0].error).toBeInstanceOf(Error);
    expect(roleErrors[0].error.message).toBe('boom');
  });

  it('fails fast on 409 inflight (no retry), blocks task, and does not execute later roles', async () => {
    const projectId = 'demo-project';
    const taskId = 'T-409';
    const config = createConfig(rootDir);

    await writeProjectFixture({ projectsDir: rootDir, projectId });
    await writeTaskFixture({
      projectsDir: rootDir,
      projectId,
      taskId,
      objective: 'Handle inflight conflict',
      roles: ['planner', 'reviewer', 'devils-advocate'],
    });

    globalThis.fetch = (async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'http://localhost:8765/clients') {
        return new Response(JSON.stringify({ clients: ['planner', 'reviewer', 'devils-advocate'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as FetchFn;

    executeSessionRunQueue.push(
      { type: 'resolve', value: { runId: 'run-1', runDir: '/tmp/run-1', responseText: 'ok-1' } },
      {
        type: 'reject',
        error: new ServerClientError('HTTP 409 inflight (Conflict)', {
          kind: 'http_error',
          status: 409,
          url: 'http://localhost:8765/responses/reviewer/new',
        }),
      },
    );

    let caught: unknown;
    try {
      await runTaskSessions({ config, projectId, taskId });
    } catch (error) {
      caught = error;
    }

    expect(executeSessionRunCalls).toHaveLength(2);
    expect(executeSessionRunCalls.map((call) => call.role)).toEqual(['planner', 'reviewer']);

    expect(markTaskBlockedCalls.length).toBe(1);
    expect(markTaskBlockedCalls[0][1]).toBe(projectId);
    expect(markTaskBlockedCalls[0][2]).toBe(taskId);
    expect(markTaskBlockedCalls[0][3]).toContain('reviewer');
    expect(markTaskBlockedCalls[0][3]).toContain('409');

    expect(caught).toBeInstanceOf(Error);
    const err = caught as any;
    expect(err.taskId).toBe(taskId);
    expect(err.role).toBe('reviewer');
    expect(String(err.message)).toContain(taskId);
    expect(String(err.message)).toContain('reviewer');
    expect(String(err.message)).toContain('409');
  });

  it('blocks and throws on missing role client preflight', async () => {
    const projectId = 'demo-project';
    const taskId = 'T-000';
    const config = createConfig(rootDir);

    await writeProjectFixture({ projectsDir: rootDir, projectId });
    await writeTaskFixture({
      projectsDir: rootDir,
      projectId,
      taskId,
      objective: 'Fail fast',
      roles: ['planner', 'reviewer'],
    });

    globalThis.fetch = (async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'http://localhost:8765/clients') {
        return new Response(JSON.stringify({ clients: ['planner'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as FetchFn;

    let caught: unknown;
    try {
      await runTaskSessions({ config, projectId, taskId });
    } catch (error) {
      caught = error;
    }

    expect(markTaskBlockedCalls.length).toBe(1);
    expect(markTaskBlockedCalls[0][1]).toBe(projectId);
    expect(markTaskBlockedCalls[0][2]).toBe(taskId);
    expect(markTaskBlockedCalls[0][3]).toContain('Missing role clients');
    expect(markTaskBlockedCalls[0][3]).toContain('reviewer');
    expect(markTaskBlockedCalls[0][3]).toContain('Connected clients');
    expect(markTaskBlockedCalls[0][3]).toContain('planner');

    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error;
    expect(String(err.message)).toContain('Missing role clients');
    expect(String(err.message)).toContain('reviewer');
    expect(String(err.message)).toContain('Connected clients');
    expect(String(err.message)).toContain('planner');
  });
});
