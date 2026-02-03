import { join } from "node:path";
import { Config } from "../config/config.ts";
import { ensureDirs } from "../fs/ensureDirs.ts";
import { isPathInsideRoot } from "../fs/paths.ts";
import { 
  validateProjectId, 
  PROJECT_FILE, 
  PLAN_FILE, 
  NOTES_FILE, 
  META_FILE,
  DECISIONS_DIR,
  TASKS_DIR,
  REPORTS_DIR,
  getIsoTimestamp
} from "./layout.ts";

export interface ProjectData {
  title: string;
  goals: string[];
  constraints: string[];
  nonGoals: string[];
}

export interface ProjectMeta {
  version: number;
  projectId: string;
  createdAt: string;
  lastUpdatedAt: string;
  status: 'active' | 'paused' | 'completed';
}

export interface Project {
  meta: ProjectMeta;
  projectMd: string;
  planMd: string;
  notesMd: string;
}

export async function createProject(config: Config, projectId: string, data: ProjectData): Promise<void> {
  if (!validateProjectId(projectId)) {
    throw new Error(`Invalid project ID: ${projectId}`);
  }

  const projectDir = join(config.projectsDir, projectId);
  
  if (!isPathInsideRoot(projectDir, config.projectsDir)) {
    throw new Error(`Project directory is outside projects root: ${projectDir}`);
  }

  const metaFile = Bun.file(join(projectDir, META_FILE));
  if (await metaFile.exists()) {
    throw new Error(`Project already exists: ${projectId}`);
  }

  await ensureDirs([
    projectDir,
    join(projectDir, DECISIONS_DIR),
    join(projectDir, TASKS_DIR),
    join(projectDir, REPORTS_DIR)
  ]);

  const timestamp = getIsoTimestamp();
  const meta: ProjectMeta = {
    version: 1,
    projectId,
    createdAt: timestamp,
    lastUpdatedAt: timestamp,
    status: 'active'
  };

  const projectMd = `# Project: ${data.title}

# Goals

${data.goals.map(g => `- ${g}`).join('\n')}

# Constraints

${data.constraints.map(c => `- ${c}`).join('\n')}

# Non-Goals

${data.nonGoals.map(n => `- ${n}`).join('\n')}
`;

  const planMd = `# Current Plan

# Status

Draft

# Phases

# Notes
`;

  const notesMd = `# Project Notes

# Assumptions

# Clarifications

# Lessons Learned
`;

  await Promise.all([
    Bun.write(join(projectDir, META_FILE), JSON.stringify(meta, null, 2)),
    Bun.write(join(projectDir, PROJECT_FILE), projectMd),
    Bun.write(join(projectDir, PLAN_FILE), planMd),
    Bun.write(join(projectDir, NOTES_FILE), notesMd)
  ]);
}

export async function loadProject(config: Config, projectId: string): Promise<Project> {
  const projectDir = join(config.projectsDir, projectId);
  
  if (!isPathInsideRoot(projectDir, config.projectsDir)) {
    throw new Error(`Project directory is outside projects root: ${projectDir}`);
  }

  const metaFile = Bun.file(join(projectDir, META_FILE));
  if (!await metaFile.exists()) {
    throw new Error(`Project does not exist: ${projectId}`);
  }

  const [metaText, projectMd, planMd, notesMd] = await Promise.all([
    metaFile.text(),
    Bun.file(join(projectDir, PROJECT_FILE)).text(),
    Bun.file(join(projectDir, PLAN_FILE)).text(),
    Bun.file(join(projectDir, NOTES_FILE)).text()
  ]);

  return {
    meta: JSON.parse(metaText),
    projectMd,
    planMd,
    notesMd
  };
}
