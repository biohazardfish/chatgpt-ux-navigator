import type { Config } from '../../config/config.ts';
import type { Project, ProjectDoc } from '../domain/project.ts';
import type { Plan } from '../domain/plan.ts';
import type { Notes } from '../domain/notes.ts';
import type { Task } from '../domain/task.ts';
import type { Role } from '../domain/role.ts';
import type { TaskStatus } from '../domain/status.ts';
import { loadProjectById } from '../../app/projectLoader.ts';
import { updateTaskStatus } from '../../storage/task.ts';
import { updateProjectMeta } from '../../storage/project.ts';
import { getIsoTimestamp } from '../../storage/layout.ts';
import { TaskNotExecutableError } from './errors.ts';
import { isValidTransition } from './taskLifecycle.ts';

/**
 * Context required for task execution.
 * Derived from project state, not persisted.
 */
export interface TaskContext {
  goals: string[];
  planExcerpt: string;
  notes: string[];
  constraints: string[];
}

/**
 * Represents a task ready for execution.
 * This is a derived structure, not persisted.
 */
export interface ExecutableTask {
  taskId: string;
  objective: string;
  roles: Role[];
  context: TaskContext;
}

/**
 * Build TaskContext from project components.
 */
function buildTaskContext(
  projectDoc: ProjectDoc,
  plan: Plan,
  notes: Notes
): TaskContext {
  return {
    goals: projectDoc.goals,
    planExcerpt: plan.phases.join('\n'),
    notes: notes.projectNotes,
    constraints: projectDoc.constraints,
  };
}

/**
 * Find a task by ID within the project's tasks.
 */
function findTask(project: Project, taskId: string): Task | undefined {
  return project.tasks.find((t) => t.id === taskId);
}

/**
 * Validate that all task readiness rules are satisfied.
 * Returns an ExecutableTask if valid, throws TaskNotExecutableError otherwise.
 * 
 * Readiness rules:
 * 1. Task must exist
 * 2. Plan must be approved
 * 3. Task status must be 'pending'
 * 4. At least one role must be assigned
 * 5. Required context must be available (goals non-empty)
 */
export function prepareExecutableTask(
  project: Project,
  taskId: string
): ExecutableTask {
  // Rule 1: Task must exist
  const task = findTask(project, taskId);
  if (!task) {
    throw new TaskNotExecutableError(taskId, { kind: 'task_not_found' });
  }

  // Rule 2: Plan must be approved
  if (project.plan.status !== 'approved') {
    throw new TaskNotExecutableError(taskId, {
      kind: 'plan_not_approved',
      planStatus: project.plan.status,
    });
  }

  // Rule 3: Task status must be 'pending'
  if (task.status !== 'pending') {
    throw new TaskNotExecutableError(taskId, {
      kind: 'task_not_pending',
      currentStatus: task.status,
    });
  }

  // Rule 4: At least one role assigned
  if (task.assignedRoles.length === 0) {
    throw new TaskNotExecutableError(taskId, { kind: 'no_roles_assigned' });
  }

  // Rule 5: Required context available (goals must be non-empty)
  const missingContext: string[] = [];
  if (project.projectDoc.goals.length === 0) {
    missingContext.push('goals');
  }
  if (missingContext.length > 0) {
    throw new TaskNotExecutableError(taskId, {
      kind: 'missing_context',
      missing: missingContext,
    });
  }

  // All rules passed - build and return ExecutableTask
  const context = buildTaskContext(
    project.projectDoc,
    project.plan,
    project.notes
  );

  return {
    taskId: task.id,
    objective: task.objective,
    roles: task.assignedRoles,
    context,
  };
}

/**
 * Validate that a status transition is allowed.
 * Throws TaskNotExecutableError if the transition is invalid.
 */
export function validateTransition(
  taskId: string,
  from: TaskStatus,
  to: TaskStatus
): void {
  if (!isValidTransition(from, to)) {
    throw new TaskNotExecutableError(taskId, {
      kind: 'invalid_transition',
      from,
      to,
    });
  }
}

/**
 * Assign a task for execution.
 * 
 * This function:
 * 1. Loads the project and validates task readiness
 * 2. Validates the status transition (pending → running)
 * 3. Persists the status change
 * 4. Updates project lastUpdatedAt timestamp
 * 5. Returns the ExecutableTask
 * 
 * If any step fails, the function throws and no partial state is persisted
 * (validation happens before any writes).
 */
export async function assignTaskForExecution(
  config: Config,
  projectId: string,
  taskId: string
): Promise<ExecutableTask> {
  // Load and parse the full project
  const result = await loadProjectById(config, projectId);
  if (result.kind === 'error') {
    throw new Error(`Failed to load project ${projectId}: ${result.errorMessage}`);
  }

  const project = result.project;

  // Validate readiness (throws if not ready)
  const executableTask = prepareExecutableTask(project, taskId);

  // Find the task to get current status for transition validation
  const task = findTask(project, taskId)!;

  // Validate the transition (pending → running)
  validateTransition(taskId, task.status, 'running');

  // Persist changes: status update + meta timestamp
  // We do validation first, then writes, to minimize partial state risk
  const timestamp = getIsoTimestamp();

  await updateTaskStatus(config, projectId, taskId, 'running');
  await updateProjectMeta(config, projectId, { lastUpdatedAt: timestamp });

  return executableTask;
}
