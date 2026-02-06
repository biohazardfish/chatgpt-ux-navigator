import { join } from 'node:path';

import type { Config } from '../../config/config.ts';
import type { Role } from '../domain/role.ts';
import { parseTask } from '../parsing/task.ts';
import { createServerClient } from '../../server/client.ts';
import { executeSessionRun } from '../../server/runExecutor.ts';
import { loadProject } from '../../storage/project.ts';
import { TASKS_DIR, TASK_FILE } from '../../storage/layout.ts';
import { markTaskBlocked } from '../../storage/task.ts';

export type RunTaskSessionsParams = {
  config: Config;
  projectId: string;
  taskId: string;
  allowCarryover?: boolean;
  onRoleStart?: (role: Role) => void | Promise<void>;
  onRoleSuccess?: (role: Role, result: Awaited<ReturnType<typeof executeSessionRun>>) => void | Promise<void>;
  onRoleError?: (role: Role, error: unknown) => void | Promise<void>;
};

export type TaskSessionResult = {
  role: Role;
  runId: string;
  responseText: string;
};

const REPORT_CONVENTION_TEXT = `# Report — <Role>

STATUS: success | partial | blocked

SUMMARY:
<free text, one or more lines>

ARTIFACTS:
- item
- item

RISKS:
- item
- item

NEXT:
- item
- item`;

function buildDeterministicPrompt(params: {
  role: Role;
  objective: string;
  projectMd: string;
  planMd: string;
  notesMd: string;
}): string {
  const { role, objective, projectMd, planMd, notesMd } = params;

  return [
    `ROLE: ${role}`,
    '',
    'TASK OBJECTIVE:',
    objective.trim(),
    '',
    'PROJECT CONTEXT:',
    '## project.md',
    projectMd.trimEnd(),
    '',
    '## plan.md',
    planMd.trimEnd(),
    '',
    '## notes.md',
    notesMd.trimEnd(),
    '',
    'INSTRUCTIONS:',
    `You are acting as the ${role}.`,
    'Complete the task objective from this perspective.',
    'Follow the required report format exactly.',
    '',
    'REQUIRED REPORT FORMAT (verbatim):',
    REPORT_CONVENTION_TEXT,
    '',
    'Important: Your response must start with "# Report — <Role>" using your role name.',
    '',
  ].join('\n');
}

async function safeInvokeCallback(params: {
  callbackName: 'onRoleStart' | 'onRoleSuccess' | 'onRoleError';
  callback?: (...args: any[]) => any;
  callbackArgs: any[];
  projectId: string;
  taskId: string;
  role: Role;
}): Promise<void> {
  const { callbackName, callback, callbackArgs, projectId, taskId, role } = params;
  if (!callback) return;

  try {
    await callback(...callbackArgs);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('[sessionRunner] callback failed', {
      callback: callbackName,
      projectId,
      taskId,
      role,
      error: reason,
    });
  }
}

export async function runTaskSessions(params: RunTaskSessionsParams): Promise<TaskSessionResult[]> {
  const { config, projectId, taskId, allowCarryover, onRoleStart, onRoleSuccess, onRoleError } = params;
  const useTemporaryChat = !(allowCarryover === true);

  const taskFilePath = join(config.projectsDir, projectId, TASKS_DIR, taskId, TASK_FILE);
  const taskFile = Bun.file(taskFilePath);
  if (!(await taskFile.exists())) {
    throw new Error(`Task file not found: ${taskFilePath}`);
  }

  const [taskMarkdown, project] = await Promise.all([
    taskFile.text(),
    loadProject(config, projectId),
  ]);

  const task = parseTask(taskMarkdown, { path: taskFilePath });

  const client = createServerClient(config);
  const connectedClients = await client.listClients();
  const missingRoles = task.assignedRoles.filter((role) => !connectedClients.includes(role));
  if (missingRoles.length > 0) {
    const missing = missingRoles.join(', ');
    const available = connectedClients.length > 0 ? connectedClients.join(', ') : '(none)';
    const reason = `Missing role clients: ${missing}. Connected clients: ${available}.`;

    try {
      await markTaskBlocked(config, projectId, taskId, reason);
    } catch (markError) {
      const markMessage = markError instanceof Error ? markError.message : String(markError);
      console.error('[sessionRunner] failed to mark task blocked', {
        projectId,
        taskId,
        error: markMessage,
      });
    }

    throw new Error(reason);
  }

  const results: TaskSessionResult[] = [];

  for (const role of task.assignedRoles) {
    const prompt = buildDeterministicPrompt({
      role,
      objective: task.objective,
      projectMd: project.projectMd,
      planMd: project.planMd,
      notesMd: project.notesMd,
    });

    try {
      await safeInvokeCallback({
        callbackName: 'onRoleStart',
        callback: onRoleStart,
        callbackArgs: [role],
        projectId,
        taskId,
        role,
      });

      const run = await executeSessionRun({
        config,
        projectId,
        taskId,
        role,
        responseId: role,
        prompt,
        useTemporaryChat,
      });

      await safeInvokeCallback({
        callbackName: 'onRoleSuccess',
        callback: onRoleSuccess,
        callbackArgs: [role, run],
        projectId,
        taskId,
        role,
      });

      results.push({ role, runId: run.runId, responseText: run.responseText });
    } catch (error) {
      await safeInvokeCallback({
        callbackName: 'onRoleError',
        callback: onRoleError,
        callbackArgs: [role, error],
        projectId,
        taskId,
        role,
      });

      const reason = error instanceof Error ? error.message : String(error);
      const blockedReason = `Role ${role} failed: ${reason}`;

      try {
        await markTaskBlocked(config, projectId, taskId, blockedReason);
      } catch (markError) {
        const markMessage = markError instanceof Error ? markError.message : String(markError);
        console.error('[sessionRunner] failed to mark task blocked', {
          projectId,
          taskId,
          role,
          error: markMessage,
        });
      }

      const wrapped = new Error(`Task ${taskId} blocked during role ${role}: ${reason}`, {
        cause: error,
      });
      (wrapped as any).taskId = taskId;
      (wrapped as any).role = role;
      throw wrapped;
    }
  }

  return results;
}
