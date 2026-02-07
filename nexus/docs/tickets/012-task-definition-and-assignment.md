# Ticket 012 - Task Definition and Assignment (Orchestration Foundations)

## Title

Task Definition and Assignment (Orchestration Foundations)

## Goal

Implement the **task definition and assignment layer** that allows Nexus to:

- Create executable task specifications from project state
- Assign one or more **roles** to a task
- Prepare tasks for execution without yet running them
- Enforce basic task lifecycle invariants

This ticket is the **bridge between planning/state and execution**.

---

## Context

From earlier tickets:

- Tasks exist as persistent state (`task.md`) and domain objects (ticket 003, 004)
- Roles are explicitly modeled
- TUI can inspect tasks but not execute them
- Server execution and run capture exist (tickets 005–006)

What’s missing is a **formal, executable task specification** that orchestration can act on.

---

## Scope

### Included

- Executable task specification (`ExecutableTask`)
- Role assignment rules
- Task lifecycle state transitions (in-memory + persisted)
- Validation of task readiness

### Excluded

- Prompt composition
- Session execution (next ticket)
- Governance decisions on task acceptance
- TUI triggers for execution

---

## Key concept: Executable Task

Define a structure that represents a task **ready to be executed**.

```ts
interface ExecutableTask {
    taskId: string;
    objective: string;
    roles: Role[];
    context: TaskContext;
}
```

```ts
interface TaskContext {
    goals: string[];
    planExcerpt: string;
    notes: string[];
    constraints: string[];
}
```

This is **derived**, not persisted.

---

## Task readiness rules

A task may be assigned for execution only if:

1. Project has an **approved plan**
2. Task status is `pending`
3. At least one role is assigned
4. Required context is available

If any rule fails → task is not executable.

---

## Assignment model

### Role assignment

- Roles come from persisted `task.md`
- Order matters:
    - Primary role first (e.g. Planner)
    - Secondary roles later
- This ticket does **not** enforce role sequencing yet (parallel vs serial comes later)

---

## Task lifecycle transitions (MVP)

Allowed transitions:

```
pending → running → completed
pending → running → blocked
pending → aborted
running → blocked
running → completed
```

Disallowed transitions:

- Any transition from `completed` or `aborted` (terminal)

---

## Persistence requirements

When assignment occurs:

- Update task status to `running`
- Update `lastUpdatedAt` in `meta.json`
- No run or report files are written yet

Rollback:

- If assignment fails, task status must remain unchanged

---

## API design

### Task preparation

```ts
function prepareExecutableTask(project: Project, taskId: string): ExecutableTask;
```

Throws if task is not executable.

### Task assignment

```ts
function assignTaskForExecution(project: Project, taskId: string): ExecutableTask;
```

- Validates readiness
- Persists status change (`pending` → `running`)
- Returns `ExecutableTask`

---

## Proposed file structure

### New files

```
src/core/orchestration/
  taskAssignment.ts
```

### Updated files

```
src/storage/task.ts        // add status update helpers
src/core/domain/task.ts   // ensure lifecycle enums exist
```

---

## Implementation steps

1. **Validation**
    - Check plan status
    - Check task exists and is pending
    - Validate roles non-empty

2. **Context assembly**
    - Extract goals from `ProjectDoc`
    - Extract plan phases (as excerpt string)
    - Extract notes and constraints

3. **Persist transition**
    - Update task status to `running`
    - Update project meta timestamp

4. **Return executable task**
    - No side effects beyond persistence

---

## Error handling

Errors must be:

- Typed (e.g. `TaskNotExecutableError`)
- Descriptive (include taskId + reason)
- Non-destructive (no partial state updates)

---

## Testing

Add tests under `test/orchestration/`:

- Task with approved plan → executable
- Task with draft plan → rejected
- Task already running → rejected
- Task with no roles → rejected
- Status transition persisted correctly

Use temp project fixtures.

---

## Acceptance criteria (Definition of Done)

- [ ] ExecutableTask abstraction exists
- [ ] Task readiness rules enforced
- [ ] Task status transitions persisted correctly
- [ ] Errors are explicit and safe
- [ ] No execution or prompt logic included
- [ ] `bun test` passes

---

## Deliverables

- Task assignment/orchestration foundation
- Validation logic and lifecycle enforcement
- Tests covering valid and invalid paths
