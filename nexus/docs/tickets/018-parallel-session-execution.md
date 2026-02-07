# Ticket 018 - Parallel Session Execution (Multi-Role / Multi-Task Concurrency)

## Title

Parallel Session Execution (Multi-Role / Multi-Task Concurrency)

## Goal

Enable Nexus to execute **multiple sessions concurrently** to improve throughput and support core Nexus patterns:

- Multiple roles on the same task (e.g., Implementer + Reviewer) in parallel where appropriate
- Multiple independent tasks in parallel (within configured limits)
- Operator-visible control of running work (at least cancellation hooks)

This ticket adds **concurrency orchestration** on top of the sequential session runner from ticket 013.

---

## Context

Currently:

- Session execution is **sequential** per task (ticket 013)
- Run capture persists raw outputs (ticket 006)
- Governance expects a set of parsed reports (ticket 015)

Nexus design explicitly emphasizes controlled parallelism, but with governance and containment.

---

## Scope

### Included

- Parallel execution engine for session runs
- Concurrency limits (global + per-task)
- Cancellation support (best-effort)
- Deterministic aggregation of results
- Failure containment rules (do not corrupt project state)

### Excluded

- Sophisticated scheduling (priority queues, fairness)
- Rate-limit adaptation
- Streaming UI display
- Cross-session communication (forbidden by design)

---

## Concurrency model

### Two dimensions

1. **Intra-task parallelism**
    - Execute multiple roles for one task concurrently (optional per task)
2. **Inter-task parallelism**
    - Execute multiple tasks concurrently (bounded)

---

## Configuration

Extend config (ticket 002) with:

- `NEXUS_MAX_CONCURRENT_RUNS` (default: `3`)
- `NEXUS_MAX_CONCURRENT_ROLES_PER_TASK` (default: `2`)

Expose via `Config`.

---

## Execution policies (MVP)

### Role execution policy per task

Add `executionMode` to `ExecutableTask` (derived, not persisted):

```ts
type ExecutionMode = 'sequential' | 'parallel';

interface ExecutableTask {
    taskId: string;
    objective: string;
    roles: Role[];
    context: TaskContext;
    executionMode: ExecutionMode;
}
```

Rules:

- Default: `sequential`
- Allow tasks to opt-in to `parallel` via a simple heuristic:
    - If roles include both `planner` and `reviewer` → allow parallel
    - Otherwise sequential
- (Later tickets can expose this to operator configuration)

---

## Failure rules

When running roles in parallel:

- If any role run fails at the transport level:
    - Mark task `blocked`
    - Do not attempt governance
    - Surface error
- If some roles succeed and others fail:
    - Persist successful run artifacts (already done by run capture)
    - Still mark task blocked (no partial acceptance)

When running tasks in parallel:

- One task failure must not stop other tasks, but must be recorded and surfaced.

---

## Cancellation

Provide a basic cancellation mechanism:

- `AbortController` per run
- If `fetch` supports abort → cancel network request
- Always mark run meta status as `error` with `error: "cancelled"` when cancelled

Expose API:

```ts
interface RunningHandle {
    cancel(): void;
    promise: Promise<SessionResult[]>;
}
```

---

## API design

Introduce a parallel runner that replaces or wraps `runTaskSessions`.

```ts
async function runTaskSessionsParallel(params: {
    project: Project;
    executableTask: ExecutableTask;
    config: Config;
}): Promise<SessionResult[]>;
```

For inter-task parallelism:

```ts
async function runTasksInParallel(params: {
    project: Project;
    executableTasks: ExecutableTask[];
    config: Config;
}): Promise<Record<string, SessionResult[]>>; // taskId -> results
```

---

## Implementation approach

### Concurrency limiter

Implement a simple semaphore:

- `acquire()` / `release()`
- Limits total concurrent runs across all tasks

---

## Proposed file structure

### New files

```
src/core/orchestration/concurrency/
  semaphore.ts
  scheduler.ts
src/core/orchestration/parallelRunner.ts
```

### Updated files

```
src/server/runExecutor.ts          // accept AbortSignal
src/core/orchestration/sessionRunner.ts  // delegate to parallel runner based on mode
src/config/config.ts               // add concurrency limits
```

---

## Implementation steps

1. Add config fields and defaults
2. Implement semaphore limiter
3. Update run executor to accept `AbortSignal`
4. Implement parallel role execution:
    - Map roles → promises
    - Limit concurrency using semaphore
5. Implement inter-task execution helper (optional but recommended in this ticket)
6. Ensure deterministic ordering in results:
    - Sort `SessionResult[]` by original role order before returning

---

## Testing

Add tests under `test/orchestration/parallel.test.ts`:

- Respects global concurrency limit
- Parallel roles execute and aggregate
- Cancellation marks run status and rejects promise
- Failure in one role blocks the task

Use mocked run executor with controllable delays.

---

## Acceptance criteria (Definition of Done)

- [ ] Roles can execute in parallel when enabled
- [ ] Global concurrency limit enforced
- [ ] Optional per-task role concurrency limit enforced
- [ ] Cancellation supported (best-effort) and persisted in run meta
- [ ] Failures are contained and do not corrupt project state
- [ ] Results returned in deterministic order
- [ ] `bun test` passes

---

## Deliverables

- Concurrency primitives (semaphore)
- Parallel session runner
- Configurable concurrency limits
- Tests validating concurrency behavior
