import type { Project } from './project.ts';
import type { TaskStatus } from './status.ts';

export type TaskStatusCounts = Record<TaskStatus, number>;

export interface NotesSectionCounts {
  assumptions: number;
  clarifications: number;
  lessonsLearned: number;
  projectNotes: number;
}

export type ProjectActivityState = 'idle' | 'running' | 'blocked';

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

const TASK_STATUS_KEYS: TaskStatus[] = ['pending', 'running', 'blocked', 'completed', 'aborted'];

export function createEmptyTaskCounts(): TaskStatusCounts {
  return TASK_STATUS_KEYS.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as TaskStatusCounts);
}

export function summarizeProject(project: Project): ProjectSummary {
  const taskCounts = createEmptyTaskCounts();
  for (const task of project.tasks) {
    taskCounts[task.status] += 1;
  }

  // Calculate projectNotes count. In LoadedProject it was project.projectNotes.length.
  // But Project interface does not have projectNotes (string[]).
  // LoadedProject adds it.
  // The 'Project' interface in core/domain/project.ts has 'notes: Notes'.
  // 'Notes' interface has 'projectNotes: string[]'? Let's check.
  
  // Checking src/core/domain/notes.ts...
  // If Project doesn't have projectNotes, we might need to adjust.
  
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
      projectNotes: project.notes.projectNotes.length,
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
