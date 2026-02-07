# Ticket 026 - Audit Log and Run History (Append-Only Operational Trace)

## Title

Audit Log and Run History (Append-Only Operational Trace)

## Goal

Introduce an **append-only audit log** and a **structured run history** so Nexus maintains a clear, chronological record of:

- What happened
- When it happened
- Why it happened (where applicable)

This ticket improves **traceability, debuggability, and operator trust**, without turning execution artifacts into long-term memory.

---

## Context

From earlier tickets:

- Project intent is persisted via plans, tasks, and decisions (003, 016)
- Session runs are captured as raw transcripts (006)
- Decisions explain _why_ major choices were made
- Alerts and summaries help operators in real time (022–024)

What’s missing is a **single chronological narrative** of events across the project lifecycle.

---

## Design principles

1. **Append-only**
    - No mutation or deletion
2. **Chronological**
    - Events ordered by time
3. **Lightweight**
    - Minimal schema, easy to inspect
4. **Non-authoritative**
    - Audit log explains _what happened_, not _what is true_
5. **Local-first**
    - Plain text + JSON only

---

## Two complementary records

### 1. Audit Log (Project-level)

A human-readable, append-only log of **important project events**.

### 2. Run History Index (Execution-level)

A machine-readable index summarizing **session runs**, linking to raw transcripts under `runs/`.

---

## Storage layout

Under each project directory:

```
projects/<project-id>/
  audit.log
  run-history.json
```

---

## Audit log

### File: `audit.log`

- Format: plain text
- Append-only
- One event per block
- Human-readable first

#### Entry format

```
[2026-02-01T13:42:10Z] TASK_ASSIGNED
Task T-006 assigned for execution
Roles: planner, reviewer, devils-advocate
```

```
[2026-02-01T13:45:02Z] GOVERNANCE_ESCALATION
Task T-006 escalated due to conflicting reports
```

```
[2026-02-01T13:47:19Z] DECISION_RECORDED
Decision 004 — Task T-006: Request revisions
```

---

### Audit event types (MVP)

```ts
type AuditEventType =
    | 'PROJECT_CREATED'
    | 'PLAN_APPROVED'
    | 'TASK_CREATED'
    | 'TASK_ASSIGNED'
    | 'TASK_BLOCKED'
    | 'TASK_COMPLETED'
    | 'SESSION_RUN_STARTED'
    | 'SESSION_RUN_FAILED'
    | 'SESSION_RUN_SUCCEEDED'
    | 'GOVERNANCE_ESCALATION'
    | 'DECISION_RECORDED'
    | 'PROJECT_PAUSED'
    | 'PROJECT_COMPLETED';
```

Events may include free-form detail text.

---

## Run history index

### File: `run-history.json`

Purpose:

- Provide a **compact index** of all session runs
- Enable quick lookup without scanning directories
- Support future UI views (timeline, filtering)

---

### Format

```json
{
    "version": 1,
    "runs": [
        {
            "runId": "20260201T131200Z-planner",
            "taskId": "T-006",
            "role": "planner",
            "status": "success",
            "startedAt": "2026-02-01T13:12:00Z",
            "completedAt": "2026-02-01T13:12:47Z",
            "path": "runs/nexus-mvp/20260201T131200Z-planner"
        },
        {
            "runId": "20260201T131400Z-reviewer",
            "taskId": "T-006",
            "role": "reviewer",
            "status": "error",
            "startedAt": "2026-02-01T13:14:00Z",
            "completedAt": "2026-02-01T13:14:12Z",
            "path": "runs/nexus-mvp/20260201T131400Z-reviewer"
        }
    ]
}
```

Notes:

- `path` is relative to `stateDir`
- This file is append-only at the array level
- No deletion or mutation of past entries

---

## API design

### Audit logging

```ts
function appendAuditEvent(
    projectId: string,
    event: {
        type: AuditEventType;
        message: string;
        details?: string[];
    }
): Promise<void>;
```

---

### Run history update

```ts
function recordRunHistory(
    projectId: string,
    runMeta: {
        runId: string;
        taskId?: string;
        role: Role;
        status: 'success' | 'error' | 'cancelled';
        startedAt: string;
        completedAt: string;
        path: string;
    }
): Promise<void>;
```

---

## Integration points

### Audit log entries should be added when:

- Project created
- Plan approved
- Task created
- Task assigned
- Task blocked or completed
- Governance escalates
- Decision recorded
- Project paused or completed

### Run history entries should be added when:

- A session run completes (success, error, or cancelled)
- Retries are **not** separate entries (only final run)

---

## Error handling & safety

- Append operations must be atomic:
    - Use file append for `audit.log`
    - For `run-history.json`, write temp file then rename
- If audit logging fails:
    - Log error
    - Do not block main execution (best-effort)
- If run history write fails:
    - Surface warning alert to operator

---

## Proposed file structure

### New files

```
src/storage/auditLog.ts
src/storage/runHistory.ts
```

### Updated files

```
src/server/runExecutor.ts
src/core/orchestration/sessionRunner.ts
src/core/governance/evaluateReports.ts
src/storage/decisionRecorder.ts
```

---

## Implementation steps

1. Implement audit log append helper
2. Implement run history read/write helper
3. Wire audit events into orchestration and governance paths
4. Wire run history recording into run executor completion
5. Ensure no blocking behavior on audit failures

---

## Testing

Add tests under `test/audit/`:

- Audit log appends entries in order
- Entries are human-readable
- Run history records runs correctly
- Append-only behavior enforced
- Failure to write audit log does not crash execution

Use temp project fixtures.

---

## Acceptance criteria (Definition of Done)

- [ ] Audit log exists and is append-only
- [ ] Major project events are recorded
- [ ] Run history index summarizes all session runs
- [ ] No mutation of historical entries
- [ ] Failures are contained and visible
- [ ] `bun test` passes

---

## Deliverables

- Audit logging implementation
- Run history index implementation
- Integration across execution and governance
- Tests validating correctness and safety
