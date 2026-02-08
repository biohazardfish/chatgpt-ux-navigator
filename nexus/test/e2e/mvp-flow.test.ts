/// <reference lib="dom" />

/**
 * Ticket 017 — MVP End-to-End Flow Smoke Test
 *
 * Validates the complete Nexus MVP loop:
 *   Project → Task → Run → Report → Governance → Decision
 *
 * Two scenarios:
 *   A. Happy path — single role, success → accept → completed
 *   B. Conflict path — two roles, disagreement → escalate → decision recorded
 */

import {afterEach, beforeEach, describe, expect, it, mock} from 'bun:test';
import {mkdir, mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import type {Config} from '../../src/config/config.ts';
import type {ExecuteSessionRunParams} from '../../src/server/runExecutor.ts';
import {
    createRunDir,
    generateRunId,
    writeRunMeta,
    writeRunPrompt,
    writeRunResponse,
} from '../../src/storage/runs.ts';
import {TASKS_DIR, TASK_FILE, DECISIONS_DIR} from '../../src/storage/layout.ts';

import {makeTestConfig, setupProject, writeTask, loadFixture} from './appDriver.ts';

// ---------------------------------------------------------------------------
// Module mocks — must be set up before importing mocked consumers
// ---------------------------------------------------------------------------

type FetchFn = typeof globalThis.fetch;

/**
 * Rich mock for `executeSessionRun`:
 * - Queues fixture response texts
 * - Creates real run directories with prompt.txt, response.txt, meta.json
 */
type ExecuteBehavior = {responseText: string};

let executeRunQueue: ExecuteBehavior[] = [];
let executeRunCalls: ExecuteSessionRunParams[] = [];

mock.module('../../src/server/runExecutor.ts', () => ({
    executeSessionRun: async (params: ExecuteSessionRunParams) => {
        executeRunCalls.push(params);
        const behavior = executeRunQueue.shift();
        if (!behavior) {
            throw new Error('Unexpected executeSessionRun call — queue empty');
        }

        const {config, projectId, taskId, role, responseId} = params;
        const startedAt = new Date();
        const runId = generateRunId(role, startedAt);
        const runDir = await createRunDir(config, projectId, runId);

        // Write real disk artifacts
        await writeRunPrompt(runDir, params.prompt);
        await writeRunResponse(runDir, behavior.responseText);
        await writeRunMeta(runDir, {
            runId,
            projectId,
            ...(typeof taskId === 'string' && taskId.trim() ? {taskId} : {}),
            role,
            responseId,
            startedAt: startedAt.toISOString(),
            completedAt: new Date().toISOString(),
            status: 'success',
        });

        return {runId, runDir, responseText: behavior.responseText};
    },
}));

// Import consumers AFTER mock.module
const {assignTaskForExecution} = await import(
    '../../src/core/orchestration/taskAssignment.ts'
);
const {runTaskSessions} = await import(
    '../../src/core/orchestration/sessionRunner.ts'
);
import {parseReport} from '../../src/core/report/index.ts';
import {evaluateReports} from '../../src/core/governance/evaluateReports.ts';
import {updateTaskStatus} from '../../src/storage/task.ts';
import {markBlocked} from '../../src/storage/task.ts';
import {recordDecision} from '../../src/storage/decisionRecorder.ts';
import {mapApprovalToDecision} from '../../src/app/approvalHandler.ts';
import {loadProjectById} from '../../src/app/projectLoader.ts';
import type {Role} from '../../src/core/domain/role.ts';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MVP E2E Smoke Test', () => {
    let stateDir: string;
    let config: Config;
    let originalFetch: FetchFn;

    // Fixtures loaded once
    let plannerSuccessTxt: string;
    let reviewerPartialTxt: string;

    beforeEach(async () => {
        stateDir = await mkdtemp(join(tmpdir(), 'nexus-e2e-'));
        config = makeTestConfig(stateDir);

        // Ensure base dirs
        await mkdir(config.projectsDir, {recursive: true});
        await mkdir(config.runsDir, {recursive: true});
        await mkdir(config.logsDir, {recursive: true});

        // Reset mock state
        executeRunQueue = [];
        executeRunCalls = [];

        // Save and override fetch for listClients preflight
        originalFetch = globalThis.fetch;

        // Load fixtures
        plannerSuccessTxt = await loadFixture('planner-success.txt');
        reviewerPartialTxt = await loadFixture('reviewer-partial.txt');
    });

    afterEach(async () => {
        globalThis.fetch = originalFetch;
        await rm(stateDir, {recursive: true, force: true});
    });

    // -----------------------------------------------------------------------
    // Scenario A — Happy Path (single role, success)
    // -----------------------------------------------------------------------

    describe('Scenario A — Happy Path', () => {
        const PROJECT_ID = 'nexus-mvp';
        const TASK_ID = 'T-001';

        it('completes the full MVP loop: assign → run → parse → govern → decide', async () => {
            // ------ 1. Setup project & task on disk ------
            await setupProject(config, PROJECT_ID, {
                goals: ['Deliver MVP end-to-end'],
                approvePlan: true,
                planPhases: ['- Phase 1: core implementation'],
            });

            await writeTask(config, PROJECT_ID, TASK_ID, {
                objective: 'Implement the core MVP feature set',
                roles: ['planner'],
                status: 'pending',
            });

            // Mock fetch for listClients preflight
            globalThis.fetch = (async (input: RequestInfo | URL) => {
                const url = typeof input === 'string' ? input : input.toString();
                if (url.includes('/clients')) {
                    return new Response(
                        JSON.stringify({clients: ['planner']}),
                        {status: 200, headers: {'Content-Type': 'application/json'}}
                    );
                }
                throw new Error(`Unexpected fetch: ${url}`);
            }) as FetchFn;

            // Queue fixture response for the planner role
            executeRunQueue.push({responseText: plannerSuccessTxt});

            // ------ 2. Assign task (pending → running) ------
            const execTask = await assignTaskForExecution(config, PROJECT_ID, TASK_ID);
            expect(execTask.taskId).toBe(TASK_ID);
            expect(execTask.roles).toEqual(['planner']);

            // ------ 3. Run session ------
            const sessionResults = await runTaskSessions({
                config,
                projectId: PROJECT_ID,
                taskId: TASK_ID,
            });
            expect(sessionResults).toHaveLength(1);
            expect(sessionResults[0].role).toBe('planner');

            // ------ 4. Parse report ------
            const report = parseReport({
                expectedRole: 'planner',
                rawText: sessionResults[0].responseText,
                runId: sessionResults[0].runId,
            });
            expect(report.status).toBe('success');
            expect(report.role).toBe('planner');

            // ------ 5. Governance evaluation ------
            const projectResult = await loadProjectById(config, PROJECT_ID);
            if (projectResult.kind === 'error') throw new Error(projectResult.errorMessage);
            const project = projectResult.project;

            // Find the task in the loaded project
            const taskObj = project.tasks.find(t => t.id === TASK_ID)!;
            expect(taskObj).toBeDefined();

            const govResult = evaluateReports({project, task: taskObj, reports: [report]});
            expect(govResult.outcome).toBe('accept');

            // ------ 6. Mark task completed & record decision ------
            await updateTaskStatus(config, PROJECT_ID, TASK_ID, 'completed');

            const decision = await recordDecision(config, {
                projectId: PROJECT_ID,
                taskId: TASK_ID,
                title: `Task ${TASK_ID} accepted`,
                context: govResult.summary.rationale,
                options: ['Accept', 'Revise', 'Abort'],
                decision: 'Accept',
                rationale: govResult.summary.rationale,
                consequences: [
                    `Task ${TASK_ID} is marked as completed`,
                    'Work can proceed to downstream tasks',
                ],
            });
            expect(decision.id).toBe(1);

            // ------ 7. Assertions — filesystem artifacts ------

            // Task file reflects completed status
            const taskFilePath = join(
                config.projectsDir, PROJECT_ID, TASKS_DIR, TASK_ID, TASK_FILE
            );
            const taskContent = await Bun.file(taskFilePath).text();
            expect(taskContent).toContain('completed');

            // Run directory exists with prompt.txt and response.txt
            const runsProjectDir = join(config.runsDir, PROJECT_ID);
            const runEntries = await readdir(runsProjectDir);
            expect(runEntries.length).toBeGreaterThanOrEqual(1);

            const runDir = join(runsProjectDir, runEntries[0]);
            const promptFile = Bun.file(join(runDir, 'prompt.txt'));
            const responseFile = Bun.file(join(runDir, 'response.txt'));
            const metaFile = Bun.file(join(runDir, 'meta.json'));
            expect(await promptFile.exists()).toBe(true);
            expect(await responseFile.exists()).toBe(true);
            expect(await metaFile.exists()).toBe(true);

            const responseContent = await responseFile.text();
            expect(responseContent).toContain('STATUS: success');

            const metaContent = JSON.parse(await metaFile.text());
            expect(metaContent.status).toBe('success');
            expect(metaContent.role).toBe('planner');

            // Decision file exists
            const decisionsDir = join(config.projectsDir, PROJECT_ID, DECISIONS_DIR);
            const decisionFiles = await readdir(decisionsDir);
            const mdFiles = decisionFiles.filter(f => f.endsWith('.md'));
            expect(mdFiles.length).toBe(1);
            expect(mdFiles[0]).toMatch(/^001-/);

            const decisionContent = await Bun.file(join(decisionsDir, mdFiles[0])).text();
            expect(decisionContent).toContain(`Task ${TASK_ID} accepted`);
            expect(decisionContent).toContain('Accept');
        });
    });

    // -----------------------------------------------------------------------
    // Scenario B — Conflict Path (two roles, escalate)
    // -----------------------------------------------------------------------

    describe('Scenario B — Conflict Path', () => {
        const PROJECT_ID = 'nexus-mvp';
        const TASK_ID = 'T-002';

        it('detects conflict, escalates, and records decision with approval', async () => {
            // ------ 1. Setup project & task on disk ------
            await setupProject(config, PROJECT_ID, {
                goals: ['Deliver MVP end-to-end'],
                approvePlan: true,
                planPhases: ['- Phase 1: core implementation'],
            });

            await writeTask(config, PROJECT_ID, TASK_ID, {
                objective: 'Review and validate the implementation plan',
                roles: ['planner', 'reviewer'],
                status: 'pending',
            });

            // Mock fetch for listClients preflight (both roles connected)
            globalThis.fetch = (async (input: RequestInfo | URL) => {
                const url = typeof input === 'string' ? input : input.toString();
                if (url.includes('/clients')) {
                    return new Response(
                        JSON.stringify({clients: ['planner', 'reviewer']}),
                        {status: 200, headers: {'Content-Type': 'application/json'}}
                    );
                }
                throw new Error(`Unexpected fetch: ${url}`);
            }) as FetchFn;

            // Queue fixture responses: planner succeeds, reviewer partial
            executeRunQueue.push(
                {responseText: plannerSuccessTxt},
                {responseText: reviewerPartialTxt}
            );

            // ------ 2. Assign task (pending → running) ------
            const execTask = await assignTaskForExecution(config, PROJECT_ID, TASK_ID);
            expect(execTask.taskId).toBe(TASK_ID);
            expect(execTask.roles).toEqual(['planner', 'reviewer']);

            // ------ 3. Run sessions (both roles) ------
            const sessionResults = await runTaskSessions({
                config,
                projectId: PROJECT_ID,
                taskId: TASK_ID,
            });
            expect(sessionResults).toHaveLength(2);
            expect(sessionResults.map(r => r.role)).toEqual(['planner', 'reviewer']);

            // ------ 4. Parse reports ------
            const reports = sessionResults.map(result =>
                parseReport({
                    expectedRole: result.role as Role,
                    rawText: result.responseText,
                    runId: result.runId,
                })
            );
            expect(reports[0].status).toBe('success');
            expect(reports[1].status).toBe('partial');

            // ------ 5. Governance evaluation — expect escalation ------
            const projectResult = await loadProjectById(config, PROJECT_ID);
            if (projectResult.kind === 'error') throw new Error(projectResult.errorMessage);
            const project = projectResult.project;

            const taskObj = project.tasks.find(t => t.id === TASK_ID)!;
            expect(taskObj).toBeDefined();

            const govResult = evaluateReports({project, task: taskObj, reports});
            expect(govResult.outcome).toBe('escalate');
            expect(govResult.approvalRequest).toBeDefined();

            // ------ 6. Mark task blocked ------
            await markBlocked(config, PROJECT_ID, TASK_ID, govResult.summary.rationale);

            // ------ 7. Simulate operator approval: "Request revisions" ------
            const approvalRequest = govResult.approvalRequest!;
            const approvalResult = {
                approvalId: approvalRequest.id,
                selectedOptionId: 'revise',
                action: 'revise' as const,
            };

            const decisionInput = mapApprovalToDecision(
                PROJECT_ID,
                approvalRequest,
                approvalResult,
                govResult.summary
            );
            expect(decisionInput.decision).toBe('Request revisions');

            // ------ 8. Record decision ------
            const decision = await recordDecision(config, decisionInput);
            expect(decision.id).toBe(1);
            expect(decision.decision).toBe('Request revisions');

            // ------ 9. Assertions — filesystem artifacts ------

            // Task file reflects blocked status
            const taskFilePath = join(
                config.projectsDir, PROJECT_ID, TASKS_DIR, TASK_ID, TASK_FILE
            );
            const taskContent = await Bun.file(taskFilePath).text();
            expect(taskContent).toContain('blocked');

            // Two run directories exist (one per role)
            const runsProjectDir = join(config.runsDir, PROJECT_ID);
            const runEntries = await readdir(runsProjectDir);
            expect(runEntries.length).toBe(2);

            // Verify both run dirs have the expected files
            for (const entry of runEntries) {
                const runDir = join(runsProjectDir, entry);
                expect(await Bun.file(join(runDir, 'prompt.txt')).exists()).toBe(true);
                expect(await Bun.file(join(runDir, 'response.txt')).exists()).toBe(true);
                expect(await Bun.file(join(runDir, 'meta.json')).exists()).toBe(true);
            }

            // One run should be for planner, the other for reviewer
            const runRoles = runEntries.map(entry => {
                // Run ID format: YYYYMMDDTHHMMSSZ-<role>
                const parts = entry.split('-');
                return parts[parts.length - 1];
            });
            expect(runRoles.sort()).toEqual(['planner', 'reviewer']);

            // Decision file exists with correct option text
            const decisionsDir = join(config.projectsDir, PROJECT_ID, DECISIONS_DIR);
            const decisionFiles = await readdir(decisionsDir);
            const mdFiles = decisionFiles.filter(f => f.endsWith('.md'));
            expect(mdFiles.length).toBe(1);
            expect(mdFiles[0]).toMatch(/^001-/);

            const decisionContent = await Bun.file(join(decisionsDir, mdFiles[0])).text();
            expect(decisionContent).toContain('Request revisions');
            expect(decisionContent).toContain('conflict');
        });
    });
});
