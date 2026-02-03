export const PROJECTS_DIR = 'projects';
export const PROJECT_FILE = 'project.md';
export const PLAN_FILE = 'plan.md';
export const NOTES_FILE = 'notes.md';
export const DECISIONS_DIR = 'decisions';
export const TASKS_DIR = 'tasks';
export const META_FILE = 'meta.json';
export const TASK_FILE = 'task.md';
export const REPORTS_DIR = 'reports';

export function validateProjectId(id: string): boolean {
    return /^[a-z0-9-]+$/.test(id);
}

export function getIsoTimestamp(): string {
    return new Date().toISOString();
}

export function getDateString(): string {
    return new Date().toISOString().split('T')[0];
}
