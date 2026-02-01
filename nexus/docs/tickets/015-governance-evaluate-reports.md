# Ticket 015 - Governance: Evaluate Reports and Determine Task Outcome

## Title

Governance: Evaluate Reports and Determine Task Outcome

## Goal

Implement the **governance evaluation layer** that takes parsed `Report` objects from completed session runs and determines:

- Whether a task is **accepted**, **partially accepted**, **blocked**, or **requires escalation**
- Whether follow-up actions are needed
- Whether explicit **user approval** is required before proceeding

This ticket is where Nexus begins to **decide**, not just execute.

---

## Context

From earlier tickets:

- Tasks can be executed per role (ticket 013)
- Raw outputs are captured (ticket 006)
- Outputs are parsed into structured `Report` objects (ticket 007)
- Tasks remain `running` after execution, pending governance
- TUI approval checkpoints exist (ticket 011)

This ticket evaluates results and determines **next steps**, but does not yet implement replanning or new task creation.

---

## Scope

### Included
- Aggregating multiple reports for a task
- Determining task outcome
- Detecting conflicts between reports
- Deciding whether to:
  - Accept task
  - Partially accept and request follow-up
  - Block task
  - Escalate to user approval
- Updating task status accordingly

### Excluded
- Creating new tasks
- Revising plans
- Persisting decisions (next ticket)
- UI presentation logic

---

## Inputs and outputs

### Inputs
- `Project`
- `Task`
- `Report[]` (one per role, parsed and validated)

### Outputs
- Updated task status
- Optional `ApprovalRequest` (for TUI)
- Governance result summary (in-memory, logged)

---

## Governance outcomes (MVP)

Define an explicit outcome enum:

```ts
type GovernanceOutcome =
  | 'accept'
  | 'partial'
  | 'blocked'
  | 'escalate'
```

---

## Evaluation rules (MVP)

### 1. Single-report tasks

If a task has only one report:

- `STATUS: success`
  → `accept`
- `STATUS: partial`
  → `partial`
- `STATUS: blocked`
  → `blocked`

---

### 2. Multi-report tasks

Evaluate across reports:

#### Status aggregation
- If **any** report is `blocked`
  → `blocked`
- Else if reports disagree (`success` vs `partial`)
  → `escalate`
- Else if all `success`
  → `accept`
- Else
  → `partial`

---

### 3. Conflict detection (MVP)

A conflict is detected if:
- Reports have different `status` values **and**
- At least one report is not `success`

Conflicts trigger:
- `GovernanceOutcome = escalate`

No semantic diffing yet (that comes later).

---

## Task status transitions

Based on outcome:

| Outcome    | Task Status Change |
|-----------|--------------------|
| accept    | `running → completed` |
| partial   | `running → blocked`   |
| blocked   | `running → blocked`   |
| escalate  | `running → blocked`   |

> For MVP, escalation blocks execution until user decision.

---

## Approval escalation

When outcome is `escalate`, produce an `ApprovalRequest`:

```ts
ApprovalRequest {
  id: `task-${taskId}-resolution`
  type: 'task-acceptance'
  title: `Resolve task ${taskId}`
  context: <summary of conflicting reports>
  options: [
    { id: 'accept', label: 'Accept as-is', action: 'accept' },
    { id: 'revise', label: 'Request revisions', action: 'revise' },
    { id: 'abort', label: 'Abort task', action: 'abort' }
  ]
  recommendedOptionId?: string
}
```

This is passed to the TUI layer; no persistence yet.

---

## Governance summary

Create a lightweight in-memory summary:

```ts
interface GovernanceSummary {
  taskId: string
  outcome: GovernanceOutcome
  rationale: string
  reportStatuses: Record<Role, Report['status']>
}
```

Used for:
- Logging
- Debugging
- Later decision persistence

---

## API design

```ts
interface EvaluateReportsParams {
  project: Project
  task: Task
  reports: Report[]
}

interface EvaluateReportsResult {
  outcome: GovernanceOutcome
  summary: GovernanceSummary
  approvalRequest?: ApprovalRequest
}
```

```ts
function evaluateReports(
  params: EvaluateReportsParams
): EvaluateReportsResult
```

---

## Persistence rules (MVP)

- Task status **must** be updated based on outcome
- No decision files written yet
- No notes appended yet (optional logging only)

---

## Proposed file structure

### New files
```
src/core/governance/
  evaluateReports.ts
  types.ts
```

### Updated files
```
src/storage/task.ts      // allow completed/blocked updates
src/tui/state.ts        // allow approval request injection
```

---

## Error handling

- If no reports provided:
  - Throw explicit error
- If report roles do not match task roles:
  - Throw explicit error
- Governance errors must not leave task in an inconsistent state

---

## Testing

Add tests under `test/governance/`:

- Single-report success → accept
- Single-report blocked → blocked
- Multi-report all success → accept
- Mixed success/partial → escalate
- Any blocked → blocked
- ApprovalRequest generated on escalation

Mock `Project`, `Task`, and `Report`.

---

## Acceptance criteria (Definition of Done)

- [ ] Governance outcome determined deterministically
- [ ] Conflicts detected and escalated
- [ ] Task status updated correctly
- [ ] ApprovalRequest generated when required
- [ ] No UI or persistence of decisions yet
- [ ] `bun test` passes

---

## Deliverables

- Governance evaluation logic
- Clear outcome and escalation rules
- Tests covering all paths
