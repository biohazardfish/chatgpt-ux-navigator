import {join} from 'node:path';
import {ensureDir} from '../fs/ensureDirs.ts';
import {getNextSequenceId} from './ids.ts';
import {TASKS_DIR, TASK_FILE, REPORTS_DIR, getIsoTimestamp} from './layout.ts';
import type {Config} from '../config/config.ts';

const VALID_STATUSES = ['pending', 'running', 'blocked', 'completed', 'aborted'] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];
const VALID_STATUS_SET = new Set<string>(VALID_STATUSES);

function normalizeStatus(status: string): ValidStatus {
    const candidate = status.trim().toLowerCase();
    if (!VALID_STATUS_SET.has(candidate)) {
        throw new Error(
            `Invalid task status: ${status}. Expected one of: ${VALID_STATUSES.join('|')}`
        );
    }
    return candidate as ValidStatus;
}

export async function createTask(
    config: Config,
    projectId: string,
    title: string
): Promise<string> {
    const projectDir = join(config.projectsDir, projectId);
    const tasksDir = join(projectDir, TASKS_DIR);

    const taskId = await getNextSequenceId(tasksDir, 'T');
    const taskPath = join(tasksDir, taskId);
    const reportsDir = join(taskPath, REPORTS_DIR);
    const taskFilePath = join(taskPath, TASK_FILE);

    await ensureDir(reportsDir);

    const template = [
        `# Task ${taskId} — ${title}`,
        '',
        '# Status',
        'pending',
        '',
        '# Objective',
        '(Auto-generated)',
        '',
        '# Assigned Roles',
        '- planner',
        '',
        '# Related Goals',
        '- (none)',
        '',
        '# Created At',
        getIsoTimestamp(),
        '',
    ].join('\n');

    await Bun.write(taskFilePath, template);
    return taskId;
}

export async function updateTaskStatus(
    config: Config,
    projectId: string,
    taskId: string,
    status: string
): Promise<void> {
    const taskFilePath = join(config.projectsDir, projectId, TASKS_DIR, taskId, TASK_FILE);
    const file = Bun.file(taskFilePath);

    if (!(await file.exists())) {
        throw new Error(`Task file not found: ${taskFilePath}`);
    }

    const nextStatus = normalizeStatus(status);
    const content = await file.text();
    const {updated, changed} = setStatusInMarkdown(content, nextStatus);
    if (!changed) {
        throw new Error(`Unable to update task status; missing Status section in: ${taskFilePath}`);
    }

    await Bun.write(taskFilePath, updated);
}

function setStatusInMarkdown(
    markdown: string,
    status: string
): {updated: string; changed: boolean} {
    // Preferred schema: level-1 heading.
    const h1Regex = /(^#\s*Status\s*$\n)([\s\S]*?)(?=^#\s|(?![\s\S]))/im;
    if (h1Regex.test(markdown)) {
        return {
            updated: markdown.replace(h1Regex, (_match, header) => `${header}${status}\n\n`),
            changed: true,
        };
    }

    // Legacy fallback: level-2 section.
    const h2Regex = /(^##\s*Status\s*$\n)([\s\S]*?)(?=^##\s|(?![\s\S]))/im;
    if (h2Regex.test(markdown)) {
        return {
            updated: markdown.replace(h2Regex, (_match, header) => `${header}${status}\n\n`),
            changed: true,
        };
    }

    // Legacy fallback: metadata bullet.
    if (/^-\s*Status:\s*.*$/m.test(markdown)) {
        return {
            updated: markdown.replace(/^-\s*Status:\s*.*$/m, `- Status: ${status}`),
            changed: true,
        };
    }

    return {updated: markdown, changed: false};
}

function upsertSection(markdown: string, heading: string, body: string): string {
    const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sectionRegex = new RegExp(
        `(^#\\s*${escapedHeading}\\s*$\\n)([\\s\\S]*?)(?=^#\\s|(?![\\s\\S]))`,
        'im'
    );
    const normalizedBody = (body ?? '').trim() || '(no reason provided)';

    if (sectionRegex.test(markdown)) {
        return markdown.replace(sectionRegex, (_match, header) => `${header}${normalizedBody}\n\n`);
    }

    const trimmed = markdown.replace(/\s*$/, '');
    return [trimmed, '', `# ${heading}`, normalizedBody, ''].join('\n');
}

export async function markBlocked(
    config: Config,
    projectId: string,
    taskId: string,
    reason: string
): Promise<void> {
    const taskFilePath = join(config.projectsDir, projectId, TASKS_DIR, taskId, TASK_FILE);
    const file = Bun.file(taskFilePath);

    if (!(await file.exists())) {
        throw new Error(`Task file not found: ${taskFilePath}`);
    }

    const content = await file.text();
    const {updated, changed} = setStatusInMarkdown(content, 'blocked');
    if (!changed) {
        throw new Error(`Unable to mark blocked; missing Status section in: ${taskFilePath}`);
    }

    const nextContent = upsertSection(updated, 'Blocked Reason', reason);
    await Bun.write(taskFilePath, nextContent);
}

export async function markTaskBlocked(
    config: Config,
    projectId: string,
    taskId: string,
    reason: string
): Promise<void> {
    await markBlocked(config, projectId, taskId, reason);
}
