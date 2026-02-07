# Ticket 017 - MVP End-to-End Flow Smoke Test (Project → Task → Run → Report → Governance → Decision)

## Title

MVP End-to-End Flow Smoke Test (Project → Task → Run → Report → Governance → Decision)

## Goal

Add an **automated smoke test scenario** that validates the complete Nexus MVP loop works end-to-end across the main subsystems:

- Project loading/creation (storage)
- Task selection and assignment (orchestration)
- Session execution (server client + run capture)
- Report parsing
- Governance evaluation
- Approval → Decision recording

This test is primarily to prevent regressions and prove the MVP is “working usable”.

---

## Context

By this point, the MVP should have:

- Persistent storage format (003)
- Domain model + parsing (004)
- Server prompt POST client (005)
- Run capture and persistence (006)
- Report convention + parser (007)
- TUI foundation and approval mechanism (008–011)
- Task assignment + runner + context injection (012–014)
- Governance evaluation (015)
- Decision recording (016)

However, unit tests alone won’t guarantee integration correctness. This ticket ensures all the pieces connect.

---

## Scope

### Included

- A scripted E2E “happy path” using mocks for server responses
- A scripted E2E “conflict path” that triggers escalation and records a decision
- Verifies on-disk artifacts created correctly (project dirs, run transcripts, decisions)

### Excluded

- Real server dependency (must not require localhost server running)
- Full TUI interaction automation (use a headless “app driver” instead)

---

## Test strategy

### Core approach

Implement an **App Driver** that runs the orchestration loop without rendering the TUI:

- Simulate approval decisions programmatically
- Use mocked `ServerClient` / `executeSessionRun` responses
- Use real filesystem writes to a temp `stateDir` to validate storage and runs

---

## Scenarios

### Scenario A — Happy Path (single role, success)

1. Create temp `stateDir`
2. Create a project skeleton `nexus-mvp`
3. Write:
    - `project.md` with goals
    - `plan.md` with status `Approved`
4. Create task `T-001` with role `planner`, status `pending`
5. Assign task for execution → status becomes `running`
6. Run sessions:
    - Server returns a valid report with `STATUS: success`
7. Parse report → success
8. Governance evaluates → `accept`
9. Task marked `completed`
10. Decision recorded: “Task T-001 accepted”

**Assertions**

- `tasks/T-001/task.md` reflects completed status
- A run directory exists under `runs/<projectId>/<runId>/` with `prompt.txt` and `response.txt`
- A decision file exists under `decisions/001-*.md`

---

### Scenario B — Conflict Path (two roles, escalate)

1. Same initial setup
2. Create task `T-002` with roles: `planner`, `reviewer`
3. Assign and run roles sequentially:
    - Planner returns `STATUS: success`
    - Reviewer returns `STATUS: partial`
4. Governance detects conflict → `escalate` (task blocked)
5. Simulate operator approval:
    - choose “Request revisions”
6. Record decision: “Task T-002 resolution — Request revisions”

**Assertions**

- Task status is `blocked`
- Two run directories exist (one per role)
- Decision file exists with correct option text

---

## App driver design

Introduce a small internal helper used only by tests (and potentially future CLI automation):

```ts
interface AppDriverDeps {
    storage: StorageFacade;
    assignTaskForExecution: typeof assignTaskForExecution;
    runTaskSessions: typeof runTaskSessions;
    parseReport: typeof parseReport;
    evaluateReports: typeof evaluateReports;
    recordDecision: typeof recordDecision;
}

async function runMvpFlow(params: {
    projectId: string;
    taskId: string;
    approvalChoice?: 'accept' | 'revise' | 'abort';
}): Promise<void>;
```

In tests, inject a mocked runner returning predetermined response texts.

---

## Mocking requirements

### Mock run executor

For deterministic behavior, mock `executeSessionRun` (or mock the `ServerClient`) to return known `responseText` payloads.

Example valid report payloads should be stored as fixtures:

- `test/fixtures/reports/planner-success.txt`
- `test/fixtures/reports/reviewer-partial.txt`

---

## Filesystem isolation

All tests must run against a temp directory.

- Use `fs.mkdtemp` for `stateDir`
- Configure Nexus config to point at that directory
- Cleanup after each test

---

## Proposed file changes

### New files

```
test/e2e/mvp-flow.test.ts
test/fixtures/reports/planner-success.txt
test/fixtures/reports/reviewer-partial.txt
test/fixtures/reports/planner-success-2.txt (optional)
```

### Optional helper (test-only)

```
test/e2e/appDriver.ts
```

---

## Implementation steps

1. Build fixtures for report text that conforms to ticket 007 convention
2. Build a temp project using storage helpers
3. Mock session execution to return those fixtures
4. Execute orchestration flow:
    - assign → run → parse → govern → persist
5. Assert filesystem side effects

---

## Acceptance criteria (Definition of Done)

- [ ] `bun test` runs the E2E tests successfully
- [ ] Happy path scenario proves full loop works
- [ ] Conflict scenario proves escalation + decision recording works
- [ ] Tests do not require real server or UI automation
- [ ] Artifacts are validated on disk (runs + decisions + task status)

---

## Deliverables

- E2E smoke test suite (2 scenarios)
- Report fixtures
- Minimal app driver helper (if needed)
