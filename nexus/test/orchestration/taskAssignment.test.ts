import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Config } from '../../src/config/config.ts';
import type { TaskStatus, PlanStatus } from '../../src/core/domain/status.ts';
import {
  DECISIONS_DIR,
  META_FILE,
  NOTES_FILE,
  PLAN_FILE,
  PROJECT_FILE,
  TASKS_DIR,
  TASK_FILE,
} from '../../src/storage/layout.ts';
import {
  prepareExecutableTask,
  assignTaskForExecution,
  validateTransition,
  type ExecutableTask,
} from '../../src/core/orchestration/taskAssignment.ts';
import { TaskNotExecutableError } from '../../src/core/orchestration/errors.ts';
import {
  isValidTransition,
  isTerminalStatus,
  getValidTransitions,
} from '../../src/core/orchestration/taskLifecycle.ts';
import { parseTask } from '../../src/core/parsing/task.ts';

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
  planStatus?: PlanStatus;
  goals?: string[];
}): Promise<void> {
  const { projectsDir, projectId, planStatus = 'approved', goals = ['Goal 1', 'Goal 2'] } = params;
  const projectDir = join(projectsDir, projectId);
  await mkdir(projectDir, { recursive: true });
  await mkdir(join(projectDir, TASKS_DIR), { recursive: true });
  await mkdir(join(projectDir, DECISIONS_DIR), { recursive: true });

  const meta = {
    version: 1,
    projectId,
    createdAt: '2026-02-06T00:00:00.000Z',
    lastUpdatedAt: '2026-02-06T00:00:00.000Z',
    status: 'active',
  };

  const projectMd = [
    `# Project: Test Project`,
    '',
    '# Goals',
    '',
    ...goals.map((g) => `- ${g}`),
    '',
    '# Constraints',
    '',
    '- Must be fast',
    '',
    '# Non-Goals',
    '',
    '- Not a goal',
    '',
  ].join('\n');

  const planMd = [
    '# Current Plan',
    '',
    '# Status',
    '',
    planStatus.charAt(0).toUpperCase() + planStatus.slice(1), // Capitalize
    '',
    '# Phases',
    '',
    '- Phase 1: Design',
    '- Phase 2: Implementation',
    '',
    '# Notes',
    '',
    '- Plan note 1',
    '',
  ].join('\n');

  const notesMd = [
    '# Project Notes',
    '',
    '- Project note 1',
    '',
    '# Assumptions',
    '',
    '- Assumption 1',
    '',
    '# Clarifications',
    '',
    '# Lessons Learned',
    '',
  ].join('\n');

  await Promise.all([
    Bun.write(join(projectDir, META_FILE), JSON.stringify(meta, null, 2)),
    Bun.write(join(projectDir, PROJECT_FILE), projectMd),
    Bun.write(join(projectDir, PLAN_FILE), planMd),
    Bun.write(join(projectDir, NOTES_FILE), notesMd),
  ]);
}

async function writeTaskFixture(params: {
  projectsDir: string;
  projectId: string;
  taskId: string;
  objective?: string;
  roles?: string[];
  status?: TaskStatus;
}): Promise<void> {
  const {
    projectsDir,
    projectId,
    taskId,
    objective = 'Complete the objective',
    roles = ['planner'],
    status = 'pending',
  } = params;

  const taskDir = join(projectsDir, projectId, TASKS_DIR, taskId);
  await mkdir(taskDir, { recursive: true });
  const taskPath = join(taskDir, TASK_FILE);

  const markdown = [
    `# Task ${taskId} — Test Task`,
    '',
    '# Status',
    status,
    '',
    '# Objective',
    objective,
    '',
    '# Assigned Roles',
    ...roles.map((role) => `- ${role}`),
    '',
    '# Related Goals',
    '- Goal 1',
    '',
    '# Created At',
    '2026-02-06T00:00:00.000Z',
    '',
  ].join('\n');

  await Bun.write(taskPath, markdown);
}

// =============================================================================
// Task Lifecycle Tests
// =============================================================================

describe('task lifecycle state machine', () => {
  describe('isValidTransition', () => {
    it('allows pending → running', () => {
      expect(isValidTransition('pending', 'running')).toBe(true);
    });

    it('allows pending → aborted', () => {
      expect(isValidTransition('pending', 'aborted')).toBe(true);
    });

    it('allows running → completed', () => {
      expect(isValidTransition('running', 'completed')).toBe(true);
    });

    it('allows running → blocked', () => {
      expect(isValidTransition('running', 'blocked')).toBe(true);
    });

    it('allows blocked → running (unblock/retry)', () => {
      expect(isValidTransition('blocked', 'running')).toBe(true);
    });

    it('allows blocked → aborted', () => {
      expect(isValidTransition('blocked', 'aborted')).toBe(true);
    });

    it('allows same state transition (no-op)', () => {
      expect(isValidTransition('pending', 'pending')).toBe(true);
      expect(isValidTransition('running', 'running')).toBe(true);
      expect(isValidTransition('completed', 'completed')).toBe(true);
    });

    it('rejects completed → any other state', () => {
      expect(isValidTransition('completed', 'pending')).toBe(false);
      expect(isValidTransition('completed', 'running')).toBe(false);
      expect(isValidTransition('completed', 'blocked')).toBe(false);
      expect(isValidTransition('completed', 'aborted')).toBe(false);
    });

    it('rejects aborted → any other state', () => {
      expect(isValidTransition('aborted', 'pending')).toBe(false);
      expect(isValidTransition('aborted', 'running')).toBe(false);
      expect(isValidTransition('aborted', 'blocked')).toBe(false);
      expect(isValidTransition('aborted', 'completed')).toBe(false);
    });

    it('rejects pending → completed (must go through running)', () => {
      expect(isValidTransition('pending', 'completed')).toBe(false);
    });

    it('rejects pending → blocked (must go through running)', () => {
      expect(isValidTransition('pending', 'blocked')).toBe(false);
    });

    it('rejects running → pending (cannot go backward)', () => {
      expect(isValidTransition('running', 'pending')).toBe(false);
    });
  });

  describe('isTerminalStatus', () => {
    it('identifies completed as terminal', () => {
      expect(isTerminalStatus('completed')).toBe(true);
    });

    it('identifies aborted as terminal', () => {
      expect(isTerminalStatus('aborted')).toBe(true);
    });

    it('identifies pending as non-terminal', () => {
      expect(isTerminalStatus('pending')).toBe(false);
    });

    it('identifies running as non-terminal', () => {
      expect(isTerminalStatus('running')).toBe(false);
    });

    it('identifies blocked as non-terminal', () => {
      expect(isTerminalStatus('blocked')).toBe(false);
    });
  });

  describe('getValidTransitions', () => {
    it('returns valid transitions for pending', () => {
      const transitions = getValidTransitions('pending');
      expect(transitions).toContain('running');
      expect(transitions).toContain('aborted');
      expect(transitions).not.toContain('completed');
      expect(transitions).not.toContain('blocked');
    });

    it('returns empty array for terminal states', () => {
      expect(getValidTransitions('completed')).toEqual([]);
      expect(getValidTransitions('aborted')).toEqual([]);
    });
  });
});

// =============================================================================
// prepareExecutableTask Tests
// =============================================================================

describe('prepareExecutableTask', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = join(tmpdir(), `nexus-task-assignment-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(rootDir, { recursive: true });
  });

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('returns ExecutableTask for valid pending task with approved plan', async () => {
    const config = createConfig(rootDir);
    const projectId = 'test-project';
    const taskId = 'T-001';

    await writeProjectFixture({ projectsDir: rootDir, projectId, planStatus: 'approved' });
    await writeTaskFixture({
      projectsDir: rootDir,
      projectId,
      taskId,
      objective: 'Build the feature',
      roles: ['planner', 'implementer'],
      status: 'pending',
    });

    // Load project via projectLoader
    const { loadProjectById } = await import('../../src/app/projectLoader.ts');
    const result = await loadProjectById(config, projectId);
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;

    const executableTask = prepareExecutableTask(result.project, taskId);

    expect(executableTask.taskId).toBe(taskId);
    expect(executableTask.objective).toBe('Build the feature');
    expect(executableTask.roles).toEqual(['planner', 'implementer']);
    expect(executableTask.context.goals).toEqual(['Goal 1', 'Goal 2']);
    expect(executableTask.context.constraints).toEqual(['Must be fast']);
    expect(executableTask.context.planExcerpt).toContain('Phase 1: Design');
    expect(executableTask.context.notes).toEqual(['Project note 1']);
  });

  it('throws TaskNotExecutableError when task not found', async () => {
    const config = createConfig(rootDir);
    const projectId = 'test-project';

    await writeProjectFixture({ projectsDir: rootDir, projectId, planStatus: 'approved' });

    const { loadProjectById } = await import('../../src/app/projectLoader.ts');
    const result = await loadProjectById(config, projectId);
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;

    expect(() => prepareExecutableTask(result.project, 'T-999')).toThrow(TaskNotExecutableError);

    try {
      prepareExecutableTask(result.project, 'T-999');
    } catch (error) {
      expect(error).toBeInstanceOf(TaskNotExecutableError);
      const e = error as TaskNotExecutableError;
      expect(e.taskId).toBe('T-999');
      expect(e.reason.kind).toBe('task_not_found');
      expect(e.message).toContain('T-999');
      expect(e.message).toContain('not found');
    }
  });

  it('throws TaskNotExecutableError when plan is draft', async () => {
    const config = createConfig(rootDir);
    const projectId = 'test-project';
    const taskId = 'T-001';

    await writeProjectFixture({ projectsDir: rootDir, projectId, planStatus: 'draft' });
    await writeTaskFixture({ projectsDir: rootDir, projectId, taskId, status: 'pending' });

    const { loadProjectById } = await import('../../src/app/projectLoader.ts');
    const result = await loadProjectById(config, projectId);
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;

    expect(() => prepareExecutableTask(result.project, taskId)).toThrow(TaskNotExecutableError);

    try {
      prepareExecutableTask(result.project, taskId);
    } catch (error) {
      expect(error).toBeInstanceOf(TaskNotExecutableError);
      const e = error as TaskNotExecutableError;
      expect(e.reason.kind).toBe('plan_not_approved');
      if (e.reason.kind === 'plan_not_approved') {
        expect(e.reason.planStatus).toBe('draft');
      }
    }
  });

  it('throws TaskNotExecutableError when task is already running', async () => {
    const config = createConfig(rootDir);
    const projectId = 'test-project';
    const taskId = 'T-001';

    await writeProjectFixture({ projectsDir: rootDir, projectId, planStatus: 'approved' });
    await writeTaskFixture({ projectsDir: rootDir, projectId, taskId, status: 'running' });

    const { loadProjectById } = await import('../../src/app/projectLoader.ts');
    const result = await loadProjectById(config, projectId);
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;

    expect(() => prepareExecutableTask(result.project, taskId)).toThrow(TaskNotExecutableError);

    try {
      prepareExecutableTask(result.project, taskId);
    } catch (error) {
      expect(error).toBeInstanceOf(TaskNotExecutableError);
      const e = error as TaskNotExecutableError;
      expect(e.reason.kind).toBe('task_not_pending');
      if (e.reason.kind === 'task_not_pending') {
        expect(e.reason.currentStatus).toBe('running');
      }
    }
  });

  it('throws TaskNotExecutableError when task has no roles assigned', async () => {
    const config = createConfig(rootDir);
    const projectId = 'test-project';
    const taskId = 'T-001';

    await writeProjectFixture({ projectsDir: rootDir, projectId, planStatus: 'approved' });
    await writeTaskFixture({
      projectsDir: rootDir,
      projectId,
      taskId,
      status: 'pending',
      roles: [], // No roles
    });

    const { loadProjectById } = await import('../../src/app/projectLoader.ts');
    const result = await loadProjectById(config, projectId);
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;

    expect(() => prepareExecutableTask(result.project, taskId)).toThrow(TaskNotExecutableError);

    try {
      prepareExecutableTask(result.project, taskId);
    } catch (error) {
      expect(error).toBeInstanceOf(TaskNotExecutableError);
      const e = error as TaskNotExecutableError;
      expect(e.reason.kind).toBe('no_roles_assigned');
    }
  });

  it('throws TaskNotExecutableError when project has no goals', async () => {
    const config = createConfig(rootDir);
    const projectId = 'test-project';
    const taskId = 'T-001';

    await writeProjectFixture({
      projectsDir: rootDir,
      projectId,
      planStatus: 'approved',
      goals: [], // No goals
    });
    await writeTaskFixture({ projectsDir: rootDir, projectId, taskId, status: 'pending' });

    const { loadProjectById } = await import('../../src/app/projectLoader.ts');
    const result = await loadProjectById(config, projectId);
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;

    expect(() => prepareExecutableTask(result.project, taskId)).toThrow(TaskNotExecutableError);

    try {
      prepareExecutableTask(result.project, taskId);
    } catch (error) {
      expect(error).toBeInstanceOf(TaskNotExecutableError);
      const e = error as TaskNotExecutableError;
      expect(e.reason.kind).toBe('missing_context');
      if (e.reason.kind === 'missing_context') {
        expect(e.reason.missing).toContain('goals');
      }
    }
  });
});

// =============================================================================
// validateTransition Tests
// =============================================================================

describe('validateTransition', () => {
  it('does not throw for valid transitions', () => {
    expect(() => validateTransition('T-001', 'pending', 'running')).not.toThrow();
    expect(() => validateTransition('T-001', 'running', 'completed')).not.toThrow();
  });

  it('throws TaskNotExecutableError for invalid transitions', () => {
    expect(() => validateTransition('T-001', 'completed', 'running')).toThrow(TaskNotExecutableError);

    try {
      validateTransition('T-001', 'completed', 'running');
    } catch (error) {
      expect(error).toBeInstanceOf(TaskNotExecutableError);
      const e = error as TaskNotExecutableError;
      expect(e.reason.kind).toBe('invalid_transition');
      if (e.reason.kind === 'invalid_transition') {
        expect(e.reason.from).toBe('completed');
        expect(e.reason.to).toBe('running');
      }
    }
  });
});

// =============================================================================
// assignTaskForExecution Tests
// =============================================================================

describe('assignTaskForExecution', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = join(tmpdir(), `nexus-task-assign-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(rootDir, { recursive: true });
  });

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('assigns task and persists status to running', async () => {
    const config = createConfig(rootDir);
    const projectId = 'test-project';
    const taskId = 'T-001';

    await writeProjectFixture({ projectsDir: rootDir, projectId, planStatus: 'approved' });
    await writeTaskFixture({
      projectsDir: rootDir,
      projectId,
      taskId,
      objective: 'Do the thing',
      roles: ['planner'],
      status: 'pending',
    });

    const executableTask = await assignTaskForExecution(config, projectId, taskId);

    expect(executableTask.taskId).toBe(taskId);
    expect(executableTask.objective).toBe('Do the thing');
    expect(executableTask.roles).toEqual(['planner']);

    // Verify task status was persisted
    const taskFilePath = join(rootDir, projectId, TASKS_DIR, taskId, TASK_FILE);
    const taskContent = await Bun.file(taskFilePath).text();
    const parsedTask = parseTask(taskContent);
    expect(parsedTask.status).toBe('running');
  });

  it('updates project meta lastUpdatedAt timestamp', async () => {
    const config = createConfig(rootDir);
    const projectId = 'test-project';
    const taskId = 'T-001';

    await writeProjectFixture({ projectsDir: rootDir, projectId, planStatus: 'approved' });
    await writeTaskFixture({ projectsDir: rootDir, projectId, taskId, status: 'pending' });

    // Record original timestamp
    const metaPath = join(rootDir, projectId, META_FILE);
    const originalMeta = JSON.parse(await Bun.file(metaPath).text());
    const originalTimestamp = originalMeta.lastUpdatedAt;

    // Small delay to ensure timestamp differs
    await new Promise((resolve) => setTimeout(resolve, 10));

    await assignTaskForExecution(config, projectId, taskId);

    // Verify timestamp was updated
    const updatedMeta = JSON.parse(await Bun.file(metaPath).text());
    expect(updatedMeta.lastUpdatedAt).not.toBe(originalTimestamp);
    expect(new Date(updatedMeta.lastUpdatedAt).getTime()).toBeGreaterThan(
      new Date(originalTimestamp).getTime()
    );
  });

  it('throws when task is not pending', async () => {
    const config = createConfig(rootDir);
    const projectId = 'test-project';
    const taskId = 'T-001';

    await writeProjectFixture({ projectsDir: rootDir, projectId, planStatus: 'approved' });
    await writeTaskFixture({ projectsDir: rootDir, projectId, taskId, status: 'running' });

    await expect(assignTaskForExecution(config, projectId, taskId)).rejects.toThrow(
      TaskNotExecutableError
    );
  });

  it('throws when plan is not approved', async () => {
    const config = createConfig(rootDir);
    const projectId = 'test-project';
    const taskId = 'T-001';

    await writeProjectFixture({ projectsDir: rootDir, projectId, planStatus: 'draft' });
    await writeTaskFixture({ projectsDir: rootDir, projectId, taskId, status: 'pending' });

    await expect(assignTaskForExecution(config, projectId, taskId)).rejects.toThrow(
      TaskNotExecutableError
    );
  });

  it('throws when project does not exist', async () => {
    const config = createConfig(rootDir);

    await expect(assignTaskForExecution(config, 'nonexistent', 'T-001')).rejects.toThrow();
  });

  it('does not persist changes when validation fails', async () => {
    const config = createConfig(rootDir);
    const projectId = 'test-project';
    const taskId = 'T-001';

    // Create project with draft plan (will fail validation)
    await writeProjectFixture({ projectsDir: rootDir, projectId, planStatus: 'draft' });
    await writeTaskFixture({ projectsDir: rootDir, projectId, taskId, status: 'pending' });

    // Record original state
    const metaPath = join(rootDir, projectId, META_FILE);
    const taskFilePath = join(rootDir, projectId, TASKS_DIR, taskId, TASK_FILE);
    const originalMeta = await Bun.file(metaPath).text();
    const originalTask = await Bun.file(taskFilePath).text();

    // Attempt assignment (should fail)
    try {
      await assignTaskForExecution(config, projectId, taskId);
    } catch {
      // Expected to throw
    }

    // Verify no changes were made
    const currentMeta = await Bun.file(metaPath).text();
    const currentTask = await Bun.file(taskFilePath).text();
    expect(currentMeta).toBe(originalMeta);
    expect(currentTask).toBe(originalTask);
  });
});

// =============================================================================
// Error Message Tests
// =============================================================================

describe('TaskNotExecutableError messages', () => {
  it('formats task_not_found message', () => {
    const error = new TaskNotExecutableError('T-001', { kind: 'task_not_found' });
    expect(error.message).toBe('Task T-001 not found');
    expect(error.name).toBe('TaskNotExecutableError');
  });

  it('formats plan_not_approved message', () => {
    const error = new TaskNotExecutableError('T-001', {
      kind: 'plan_not_approved',
      planStatus: 'draft',
    });
    expect(error.message).toContain("plan is 'draft'");
    expect(error.message).toContain("must be 'approved'");
  });

  it('formats task_not_pending message', () => {
    const error = new TaskNotExecutableError('T-001', {
      kind: 'task_not_pending',
      currentStatus: 'running',
    });
    expect(error.message).toContain("status is 'running'");
    expect(error.message).toContain("must be 'pending'");
  });

  it('formats no_roles_assigned message', () => {
    const error = new TaskNotExecutableError('T-001', { kind: 'no_roles_assigned' });
    expect(error.message).toContain('no roles assigned');
  });

  it('formats missing_context message', () => {
    const error = new TaskNotExecutableError('T-001', {
      kind: 'missing_context',
      missing: ['goals', 'phases'],
    });
    expect(error.message).toContain('missing required context');
    expect(error.message).toContain('goals');
    expect(error.message).toContain('phases');
  });

  it('formats invalid_transition message', () => {
    const error = new TaskNotExecutableError('T-001', {
      kind: 'invalid_transition',
      from: 'completed',
      to: 'running',
    });
    expect(error.message).toContain('invalid status transition');
    expect(error.message).toContain("from 'completed'");
    expect(error.message).toContain("to 'running'");
  });
});
