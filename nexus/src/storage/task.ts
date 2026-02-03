import { join } from 'node:path';
import { ensureDir } from '../fs/ensureDirs.ts';
import { getNextSequenceId } from './ids.ts';
import { TASKS_DIR, TASK_FILE, REPORTS_DIR, getIsoTimestamp } from './layout.ts';
import type { Config } from '../config/config.ts';

export async function createTask(config: Config, projectId: string, title: string): Promise<string> {
    const projectDir = join(config.projectsDir, projectId);
    const tasksDir = join(projectDir, TASKS_DIR);
    
    const taskId = await getNextSequenceId(tasksDir, 'T');
    const taskPath = join(tasksDir, taskId);
    const reportsDir = join(taskPath, REPORTS_DIR);
    const taskFilePath = join(taskPath, TASK_FILE);

    await ensureDir(reportsDir);

    const template = `# Task: ${title}
- ID: ${taskId}
- Project: ${projectId}
- Status: pending
- Created: ${getIsoTimestamp()}

## Summary
(Auto-generated)
`;

    await Bun.write(taskFilePath, template);
    return taskId;
}

export async function updateTaskStatus(config: Config, projectId: string, taskId: string, status: string): Promise<void> {
    const taskFilePath = join(config.projectsDir, projectId, TASKS_DIR, taskId, TASK_FILE);
    const file = Bun.file(taskFilePath);
    
    if (!(await file.exists())) {
        throw new Error(`Task file not found: ${taskFilePath}`);
    }

    const content = await file.text();
    const updatedContent = content.replace(/^- Status: .*$/m, `- Status: ${status}`);
    
    await Bun.write(taskFilePath, updatedContent);
}
