import type { Decision } from './decision.ts';
import type { Notes } from './notes.ts';
import type { Plan } from './plan.ts';
import type { ProjectStatus } from './status.ts';
import type { Task } from './task.ts';

export interface RawSection {
  title: string;
  body: string;
}

export interface RawContent {
  preamble?: string;
  sections: RawSection[];
}

export interface ProjectMeta {
  version: number;
  projectId: string;
  createdAt: string;
  lastUpdatedAt: string;
  status: ProjectStatus;
}

export interface ProjectDoc {
  title: string;
  goals: string[];
  constraints: string[];
  nonGoals: string[];
}

export interface Project {
  meta: ProjectMeta;
  projectDoc: ProjectDoc;
  plan: Plan;
  notes: Notes;
  tasks: Task[];
  decisions: Decision[];
}
