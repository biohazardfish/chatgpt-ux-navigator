/// <reference lib="dom" />

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type MockServer = {
  server: ReturnType<typeof Bun.serve>;
  baseUrl: string;
};

function startMockServer(params: { roles: string[] }): MockServer {
  const { roles } = params;

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(req) {
      const url = new URL(req.url);

      if (req.method === 'GET' && url.pathname === '/clients') {
        return new Response(JSON.stringify({ clients: roles }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const match = url.pathname.match(/^\/responses\/([^/]+)\/new$/);
      if (req.method === 'POST' && match) {
        const role = decodeURIComponent(match[1] ?? '');
        const output = [
          `# Report — ${role}`,
          '',
          'STATUS: success',
          '',
          'SUMMARY:',
          'autorun smoke',
          '',
          'ARTIFACTS:',
          '- prompt.txt',
          '- response.txt',
          '- meta.json',
          '',
          'RISKS:',
          '- none',
          '',
          'NEXT:',
          '- done',
          '',
        ].join('\n');

        return new Response(JSON.stringify({ output_text: output }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  return {
    server,
    baseUrl: `http://${server.hostname}:${server.port}`,
  };
}

async function writeStateDirFixture(params: {
  stateDir: string;
  projectId: string;
  taskId: string;
  roles: string[];
  ui: { lastProjectId?: string; lastTaskId?: string };
}): Promise<void> {
  const { stateDir, projectId, taskId, roles, ui } = params;

  const projectDir = join(stateDir, 'projects', projectId);
  const taskDir = join(projectDir, 'tasks', taskId);
  await mkdir(taskDir, { recursive: true });

  const meta = {
    version: 1,
    projectId,
    createdAt: '2026-02-06T00:00:00.000Z',
    lastUpdatedAt: '2026-02-06T00:00:00.000Z',
    status: 'active',
  };

  const taskMarkdown = [
    `# Task ${taskId} — Fixture Task`,
    '',
    '## Status',
    'running',
    '',
    '## Objective',
    'Run smoke test',
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

  await Promise.all([
    Bun.write(join(projectDir, 'meta.json'), JSON.stringify(meta, null, 2)),
    Bun.write(join(projectDir, 'project.md'), '# Project: Fixture\n'),
    Bun.write(join(projectDir, 'plan.md'), '# Plan\n'),
    Bun.write(join(projectDir, 'notes.md'), '# Notes\n'),
    Bun.write(join(taskDir, 'task.md'), taskMarkdown),
    Bun.write(join(stateDir, 'config.jsonc'), JSON.stringify({ ui }, null, 2) + '\n'),
  ]);
}

async function spawnNexusAndWait(params: {
  nexusRoot: string;
  stateDir: string;
  serverBaseUrl: string;
  timeoutMs: number;
}): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', 'run', 'src/index.ts'], {
    cwd: params.nexusRoot,
    env: {
      ...process.env,
      NEXUS_STATE_DIR: params.stateDir,
      NEXUS_SERVER_BASE_URL: params.serverBaseUrl,
      NEXUS_TUI_AUTORUN: '1',
      NEXUS_TUI_EXIT_AFTER_RUN: '1',
      NEXUS_LOG_LEVEL: 'error',
    },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdoutPromise = proc.stdout ? new Response(proc.stdout).text().catch(() => '') : Promise.resolve('');
  const stderrPromise = proc.stderr ? new Response(proc.stderr).text().catch(() => '') : Promise.resolve('');

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const exitCode = await Promise.race([
    proc.exited,
    new Promise<number | null>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // ignore
        }
        reject(new Error(`child timed out after ${params.timeoutMs}ms`));
      }, params.timeoutMs);
    }),
  ]);

  if (timeoutId) clearTimeout(timeoutId);
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  return { exitCode, stdout, stderr };
}

async function listRunDirs(projectRunsDir: string): Promise<string[]> {
  const entries = await readdir(projectRunsDir, { withFileTypes: true });
  return entries.filter((ent) => ent.isDirectory()).map((ent) => ent.name).sort((a, b) => a.localeCompare(b));
}

async function expectDirectory(path: string): Promise<void> {
  const st = await stat(path);
  expect(st.isDirectory()).toBe(true);
}

describe('tui autorun', () => {
  const nexusRoot = resolve(import.meta.dir, '../..');
  let stateDir: string;
  let server: MockServer | null = null;

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), 'nexus-tui-autorun-'));
  });

  afterEach(async () => {
    try {
      server?.server.stop(true);
    } catch {
      // ignore
    }
    server = null;

    if (stateDir) {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it('tui autorun: exits 0 and writes per-role run artifacts', async () => {
    server = startMockServer({ roles: ['planner', 'reviewer'] });

    await writeStateDirFixture({
      stateDir,
      projectId: 'demo-project',
      taskId: 'T-123',
      roles: ['planner', 'reviewer'],
      ui: { lastProjectId: 'demo-project', lastTaskId: 'T-123' },
    });

    const result = await spawnNexusAndWait({
      nexusRoot,
      stateDir,
      serverBaseUrl: server.baseUrl,
      timeoutMs: 10_000,
    });

    expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0);

    const projectRunsDir = join(stateDir, 'runs', 'demo-project');
    await expectDirectory(projectRunsDir);

    const runDirs = await listRunDirs(projectRunsDir);
    expect(runDirs.length).toBe(2);
    expect(runDirs.some((name) => name.endsWith('-planner'))).toBe(true);
    expect(runDirs.some((name) => name.endsWith('-reviewer'))).toBe(true);

    for (const runDirName of runDirs) {
      const runDir = join(projectRunsDir, runDirName);
      const metaPath = join(runDir, 'meta.json');
      const promptPath = join(runDir, 'prompt.txt');
      const responsePath = join(runDir, 'response.txt');

      expect(await Bun.file(metaPath).exists()).toBe(true);
      expect(await Bun.file(promptPath).exists()).toBe(true);
      expect(await Bun.file(responsePath).exists()).toBe(true);

      const meta = JSON.parse(await Bun.file(metaPath).text());
      expect(meta.status).toBe('success');
      expect(meta.projectId).toBe('demo-project');
      expect(meta.taskId).toBe('T-123');

      const prompt = await Bun.file(promptPath).text();
      expect(prompt).toContain('TASK OBJECTIVE:');
      expect(prompt).toContain('Run smoke test');

      const response = await Bun.file(responsePath).text();
      expect(response).toContain('# Report —');
    }
  });

  it('tui autorun: missing lastTaskId exits 1', async () => {
    server = startMockServer({ roles: ['planner', 'reviewer'] });

    await writeStateDirFixture({
      stateDir,
      projectId: 'demo-project',
      taskId: 'T-123',
      roles: ['planner', 'reviewer'],
      ui: { lastProjectId: 'demo-project' },
    });

    const result = await spawnNexusAndWait({
      nexusRoot,
      stateDir,
      serverBaseUrl: server.baseUrl,
      timeoutMs: 10_000,
    });

    expect(result.exitCode, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(1);
  });
});
