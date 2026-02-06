# Ticket 013 - Session Runner (Basic Role-Based Execution)

## Title

Session Runner (Basic Role-Based Execution)

## Goal

**Note:** Canonical terminology is defined in `nexus/docs/006-session-orchestration.md#glossary`.

Implement the **basic session runner** that takes an `ExecutableTask` and:

- Executes one session **per assigned role**
- Sends role-specific prompts to the local server
- Captures raw outputs via the run system (ticket 006)
- Returns results to the orchestration layer for later parsing and governance

This is the **first end-to-end execution loop**: task → roles → server → captured output.

---

## Context

From earlier tickets:

- Tasks can be prepared and assigned for execution (`ExecutableTask`) (ticket 012)
- Server client can POST prompts (ticket 005)
- Session runs can be captured and persisted (ticket 006)
- No governance or report parsing happens yet

This ticket wires those pieces together.

---

## Scope

### Included
- Sequential execution of roles for a task
- One server call per role
- Role-aware prompt headers
- Run capture for each role
- Aggregation of results per task execution

### Excluded
- Parallel execution
- Retry or backoff
- Streaming UI
- Report parsing
- Governance decisions

---

## Execution model (MVP)

For a given task:

1. Roles are executed **in order**
2. Each role:
   - Receives a role-specific prompt
   - Produces exactly one session run
3. Failure of any role:
   - Stops execution
   - Marks task as `blocked`
   - Surfaces error to caller

### Client preflight (MVP)

Before executing any roles, the runner must preflight client availability via `GET /clients`.

- In MVP, `clientId == role name`.
- If any required role client is missing, the runner must **fail fast** (no role runs started) and surface diagnostics including:
  - Missing role name(s)
  - Available clientId(s) returned by `GET /clients`
- Diagnostics should be logged + bubbled up in the same structured format everywhere, and other docs should reference `nexus/docs/006-session-orchestration.md#mvp-decisions-resolved` when restating this behavior.

### Temporary chat default (MVP)

Each role execution defaults to a **temporary chat** per run:

- Default endpoint: `POST /responses/:clientId/new`
- Carryover (reusing an existing chat/session for the same `clientId`) is an explicit opt-in at the orchestration/caller level; it must not happen implicitly.
- Any mention of carryover must cite `nexus/docs/006-session-orchestration.md#mvp-decisions-resolved` to reinforce the policy that temporary chats are the default and carryover is opt-in only.

### Failure behavior (MVP)

- A failure in any role stops the session runner immediately, marks the task `blocked`, and returns the diagnostics to callers.
- This applies to transport errors, capture errors, or prompt issues; no retries yet.
- References to this failure contract should link to the canonical session orchestration summary instead of duplicating variations.

---

## Prompt structure (MVP)

The session runner is responsible for **minimal, consistent prompt framing**.

### Prompt template

```
ROLE: <Role>

TASK OBJECTIVE:
<objective>

PROJECT CONTEXT:
- Goals:
  - ...
- Plan:
  - ...
- Notes:
  - ...

INSTRUCTIONS:
You are acting as the <Role>.
Complete the task objective from this perspective.
Follow the required report format exactly.
```

Notes:
- The **exact report format text** (from ticket 007) should be appended verbatim.
- Prompt composition logic stays minimal and deterministic.

---

## API design

### Runner function

```ts
interface SessionResult {
  role: Role
  runId: string
  responseText: string
}

async function runTaskSessions(
  params: {
    project: Project
    executableTask: ExecutableTask
  }
): Promise<SessionResult[]>
```

---

## Status updates

- When execution starts:
  - Task status is already `running` (from ticket 012)
- On successful completion of all roles:
  - Task status remains `running` (final status set later by governance)
- On failure:
  - Update task status to `blocked`
  - Persist reason in task notes or logs (simple string for MVP)

---

## Error handling

Errors may originate from:
- Server client
- Run capture
- Prompt validation

On error:
1. Stop executing further roles
2. Mark task as `blocked`
3. Re-throw error with:
   - taskId
   - role
   - runId (if available)

No retries yet.

---

## Proposed file structure

### New files
```
src/core/orchestration/sessionRunner.ts
```

### Updated files
```
src/storage/task.ts        // add helper: markBlocked(taskId, reason)
src/core/orchestration/taskAssignment.ts (minor integration)
```

---

## Implementation steps

1. **Iterate roles**
   - Use role order from `ExecutableTask.roles`

2. **Compose prompt**
   - Inject objective + context
   - Append report convention text

3. **Execute run**
   - Call `executeSessionRun` (ticket 006)
   - Capture `runId` and `responseText`

4. **Collect results**
   - Push `{ role, runId, responseText }` to result list

5. **Handle failure**
   - Catch error
   - Mark task `blocked`
   - Abort loop

---

## Testing

Add tests under `test/orchestration/sessionRunner.test.ts`:

- Successful run with 2 roles
- Prompt includes role and objective
- Failure in second role stops execution
- Task marked blocked on failure

Mock:
- `executeSessionRun`
- Storage updates

Do **not** hit real server.

---

## Acceptance criteria (Definition of Done)

- [ ] Roles execute sequentially
- [ ] Each role produces exactly one session run
- [ ] Prompts are role-aware and deterministic
- [ ] Errors stop execution and block task
- [ ] No governance or parsing logic included
- [ ] `bun test` passes

---

## Deliverables

- Session runner implementation
- Role-based prompt composition
- Tests covering success and failure paths
