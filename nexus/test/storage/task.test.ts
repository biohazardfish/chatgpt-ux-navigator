import { expect, describe, it, beforeEach, afterEach } from "bun:test";
import { rm, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createTask, updateTaskStatus } from "../../src/storage/task.ts";
import { TASK_FILE, TASKS_DIR, REPORTS_DIR } from "../../src/storage/layout.ts";
import type { Config } from "../../src/config/config.ts";

const TEST_STATE_DIR = join(import.meta.dir, "test_state");

const mockConfig: Config = {
    serverBaseUrl: "http://localhost:8765",
    stateDir: TEST_STATE_DIR,
    projectsDir: join(TEST_STATE_DIR, "projects"),
    runsDir: join(TEST_STATE_DIR, "runs"),
    logsDir: join(TEST_STATE_DIR, "logs"),
    logLevel: "info"
};

describe("task storage", () => {
    beforeEach(async () => {
        await mkdir(mockConfig.projectsDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(TEST_STATE_DIR, { recursive: true, force: true });
    });

    it("should create a task with sequential ID", async () => {
        const projectId = "test-project";
        const taskId1 = await createTask(mockConfig, projectId, "First Task");
        expect(taskId1).toBe("T-001");

        const taskId2 = await createTask(mockConfig, projectId, "Second Task");
        expect(taskId2).toBe("T-002");

        const taskPath1 = join(mockConfig.projectsDir, projectId, TASKS_DIR, taskId1);
        const taskFile1 = Bun.file(join(taskPath1, TASK_FILE));
        expect(await taskFile1.exists()).toBe(true);
        
        const content1 = await taskFile1.text();
        expect(content1).toContain("# Task: First Task");
        expect(content1).toContain("- ID: T-001");
        expect(content1).toContain("- Status: pending");

        const reportsDir1 = join(taskPath1, REPORTS_DIR);
        const reportsStat = await stat(reportsDir1);
        expect(reportsStat.isDirectory()).toBe(true);
    });

    it("should update task status", async () => {
        const projectId = "test-project";
        const taskId = await createTask(mockConfig, projectId, "Status Test");
        
        await updateTaskStatus(mockConfig, projectId, taskId, "in_progress");
        
        const taskFile = Bun.file(join(mockConfig.projectsDir, projectId, TASKS_DIR, taskId, TASK_FILE));
        const content = await taskFile.text();
        expect(content).toContain("- Status: in_progress");
        expect(content).not.toContain("- Status: pending");
    });

    it("should preserve other metadata when updating status", async () => {
        const projectId = "test-project";
        const taskId = await createTask(mockConfig, projectId, "Metadata Test");
        
        const taskFilePath = join(mockConfig.projectsDir, projectId, TASKS_DIR, taskId, TASK_FILE);
        const originalContent = await Bun.file(taskFilePath).text();
        
        await updateTaskStatus(mockConfig, projectId, taskId, "completed");
        
        const updatedContent = await Bun.file(taskFilePath).text();
        expect(updatedContent).toContain("- Status: completed");
        
        const originalLines = originalContent.split("\n");
        const updatedLines = updatedContent.split("\n");
        
        expect(originalLines.length).toBe(updatedLines.length);
        expect(updatedLines.find(l => l.startsWith("- ID:"))).toBe(originalLines.find(l => l.startsWith("- ID:")));
        expect(updatedLines.find(l => l.startsWith("- Created:"))).toBe(originalLines.find(l => l.startsWith("- Created:")));
    });
});
