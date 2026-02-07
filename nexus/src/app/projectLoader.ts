import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config/config.ts';
import { loadProject as readProjectFiles } from '../storage/project.ts';
import {
  DECISIONS_DIR,
  NOTES_FILE,
  PLAN_FILE,
  PROJECT_FILE,
  TASKS_DIR,
  TASK_FILE,
  validateProjectId,
} from '../storage/layout.ts';
import { isPathInsideRoot } from '../fs/paths.ts';
import { parseProjectDoc } from '../core/parsing/project.ts';
import { parsePlan } from '../core/parsing/plan.ts';
import { parseNotes } from '../core/parsing/notes.ts';
import { parseTask } from '../core/parsing/task.ts';
import { parseDecision } from '../core/parsing/decision.ts';
import { DomainParseError, type Project, type RawContent } from '../core/domain/index.ts';
import type { Notes } from '../core/domain/notes.ts';
import type { Task } from '../core/domain/task.ts';
import type { Decision } from '../core/domain/decision.ts';
import type { TaskStatus } from '../core/domain/status.ts';

export type ProjectActivityState = 'idle' | 'running' | 'blocked';

export type TaskStatusCounts = Record<TaskStatus, number>;

export interface NotesSectionCounts {
  assumptions: number;
  clarifications: number;
  lessonsLearned: number;
  projectNotes: number;
}

export interface ProjectSummary {
  goalCount: number;
  constraintCount: number;
  nonGoalCount: number;
  planPhaseCount: number;
  planNotesCount: number;
  taskCounts: TaskStatusCounts;
  decisionCount: number;
  notesCounts: NotesSectionCounts;
  activityState: ProjectActivityState;
}

export interface LoadedProject extends Project {
  raw: {
    projectDoc: RawContent;
    plan: RawContent;
    notes: RawContent;
  };
  projectNotes: string[];
}

export interface ProjectLoaderSuccess {
  kind: 'success';
  projectId: string;
  project: LoadedProject;
  summary: ProjectSummary;
}

export interface ProjectLoaderError {
  kind: 'error';
  projectId: string;
  errorMessage: string;
}

export type ProjectLoaderResult = ProjectLoaderSuccess | ProjectLoaderError;

export interface LoadInitialProjectParams {
  config: Config;
  preferredProjectId?: string;
}

export interface LoadInitialProjectResult {
  projectId?: string;
  project?: LoadedProject;
  summary?: ProjectSummary;
  errorMessage?: string;
  availableProjectIds: string[];
}

const TASK_STATUS_KEYS: TaskStatus[] = ['pending', 'running', 'blocked', 'completed', 'aborted'];

export async function listProjectIds(config: Config): Promise<string[]> {
  try {
    const entries = await readdir(config.projectsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && validateProjectId(entry.name))
      .filter((entry) =>
        isPathInsideRoot(join(config.projectsDir, entry.name), config.projectsDir),
      )
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function loadProjectById(
  config: Config,
  projectId: string,
): Promise<ProjectLoaderResult> {
  if (!validateProjectId(projectId)) {
    return {
      kind: 'error',
      projectId,
      errorMessage: `Invalid project ID: ${projectId}`,
    };
  }

  const projectDir = join(config.projectsDir, projectId);
  if (!isPathInsideRoot(projectDir, config.projectsDir)) {
    return {
      kind: 'error',
      projectId,
      errorMessage: `Project directory is outside projects root: ${projectDir}`,
    };
  }

  try {
    const baseProject = await readProjectFiles(config, projectId);

    const { raw: projectDocRaw, ...projectDoc } = parseProjectDoc(baseProject.projectMd, {
      path: join(projectDir, PROJECT_FILE),
    });
    const { raw: planRaw, ...plan } = parsePlan(baseProject.planMd, {
      path: join(projectDir, PLAN_FILE),
    });
    const { raw: notesRaw, projectNotes, ...notes } = parseNotes(baseProject.notesMd, {
      path: join(projectDir, NOTES_FILE),
    });

    const [tasks, decisions] = await Promise.all([
      loadTasks(projectDir),
      loadDecisions(projectDir),
    ]);

    const typedNotes = notes as Notes;
    const project: LoadedProject = {
      meta: baseProject.meta,
      projectDoc,
      plan,
      notes: typedNotes,
      tasks,
      decisions,
      raw: {
        projectDoc: projectDocRaw,
        plan: planRaw,
        notes: notesRaw,
      },
      projectNotes,
    };

    return {
      kind: 'success',
      projectId,
      project,
      summary: summarizeProject(project),
    };
  } catch (error) {
    return {
      kind: 'error',
      projectId,
      errorMessage: formatLoaderError(error, projectId),
    };
  }
}

export async function loadInitialProject(
  params: LoadInitialProjectParams,
): Promise<LoadInitialProjectResult> {
  const { config, preferredProjectId } = params;
  const projectIds = await listProjectIds(config);
  const preferredIsAvailable =
    typeof preferredProjectId === 'string' &&
    validateProjectId(preferredProjectId) &&
    projectIds.includes(preferredProjectId);

  const selectedId = preferredIsAvailable
    ? preferredProjectId
    : projectIds.length === 1
      ? projectIds[0]
      : undefined;

  if (!selectedId) {
    return { availableProjectIds: projectIds };
  }

  const result = await loadProjectById(config, selectedId);
  if (result.kind === 'success') {
    return {
      projectId: selectedId,
      project: result.project,
      summary: result.summary,
      availableProjectIds: projectIds,
    };
  }

  return {
    projectId: selectedId,
    errorMessage: result.errorMessage,
    availableProjectIds: projectIds,
  };
}

export function summarizeProject(project: LoadedProject): ProjectSummary {
  const taskCounts = createEmptyTaskCounts();
  for (const task of project.tasks) {
    taskCounts[task.status] += 1;
  }

  return {
    goalCount: project.projectDoc.goals.length,
    constraintCount: project.projectDoc.constraints.length,
    nonGoalCount: project.projectDoc.nonGoals.length,
    planPhaseCount: project.plan.phases.length,
    planNotesCount: project.plan.notes.length,
    taskCounts,
    decisionCount: project.decisions.length,
    notesCounts: {
      assumptions: project.notes.assumptions.length,
      clarifications: project.notes.clarifications.length,
      lessonsLearned: project.notes.lessonsLearned.length,
      projectNotes: project.projectNotes.length,
    },
    activityState: deriveActivityState(taskCounts),
  };
}

function deriveActivityState(counts: TaskStatusCounts): ProjectActivityState {
  if (counts.running > 0) {
    return 'running';
  }

  if (counts.blocked > 0) {
    return 'blocked';
  }

  return 'idle';
}

async function loadTasks(projectDir: string): Promise<Task[]> {
  const tasksDir = join(projectDir, TASKS_DIR);
  const entries = await entriesForDir(tasksDir, 'Tasks');
  const tasks = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const filePath = join(tasksDir, entry.name, TASK_FILE);
        const file = Bun.file(filePath);
        if (!(await file.exists())) {
          throw new Error(`Task file missing: ${filePath}`);
        }
        const text = await file.text();
        return parseTask(text, { path: filePath });
      }),
  );

  tasks.sort((a, b) => a.id.localeCompare(b.id));
  return tasks;
}

async function loadDecisions(projectDir: string): Promise<Decision[]> {
  const decisionsDir = join(projectDir, DECISIONS_DIR);
  const entries = await entriesForDir(decisionsDir, 'Decisions');
  const decisions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(async (entry) => {
        const filePath = join(decisionsDir, entry.name);
        const file = Bun.file(filePath);
        if (!(await file.exists())) {
          throw new Error(`Decision file missing: ${filePath}`);
        }
        const text = await file.text();
        return parseDecision(text, { path: filePath });
      }),
  );

  decisions.sort((a, b) => a.id - b.id);
  return decisions;
}

async function entriesForDir(path: string, label: string): Promise<Dirent[]> {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      throw new Error(`${label} directory is missing: ${path}`);
    }
    throw error;
  }
}

function createEmptyTaskCounts(): TaskStatusCounts {
  return TASK_STATUS_KEYS.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as TaskStatusCounts);
}

function formatLoaderError(error: unknown, projectId: string): string {
  if (error instanceof DomainParseError) {
    const sectionPrefix = error.section ? `${error.section}: ` : '';
    const pathSuffix = error.path ? ` (${error.path})` : '';
    return `Failed to load project "${projectId}": ${sectionPrefix}${error.message}${pathSuffix}`;
  }

  if (error instanceof Error) {
    return `Failed to load project "${projectId}": ${error.message}`;
  }

  return `Failed to load project "${projectId}": Unknown loader error`;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === 'object' && 'code' in error);
}
