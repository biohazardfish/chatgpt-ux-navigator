# Ticket 010 - TUI Task List and Task Details Views

## Title

TUI Task List and Task Details Views

## Goal

Implement **task inspection views** in the Nexus TUI so the operator can:

- See all tasks in the current project
- Understand task status and scope at a glance
- Drill into a single task to inspect:
  - Task definition
  - Assigned roles
  - Associated reports (parsed + raw access later)

This is a **read-only inspection feature** and a prerequisite for governance and approvals.

---

## Context

From earlier tickets:

- TUI shell and navigation exist (ticket 008)
- Dashboard shows project summary (ticket 009)
- Domain model defines `Task` and `Report` (ticket 004)
- Storage format supports tasks and reports (ticket 003)

This ticket **exposes task state to the operator**, without allowing edits or execution.

### Rendering baseline (OpenTUI)

- Build task list/detail views on `@opentui/core` components.
- Prefer OpenTUI-native selection and focus behavior over compatibility shims.
- Keep keyboard handling aligned with OpenTUI key events and focused renderables.

---

## Scope

### Included
- Task list view
- Task detail view
- Keyboard navigation between tasks
- Read-only rendering of task data

### Excluded
- Creating, editing, or deleting tasks
- Starting or canceling task execution
- Approving or rejecting task results

---

## Views overview

### 1. Task List View

Displays all tasks in the project.

Example layout:

```
Tasks (12 total)

[T-001] Repo bootstrap               Completed
[T-002] Config and paths             Completed
[T-003] Storage format               Completed
[T-004] Domain model                 Completed
[T-005] Server client                Running
[T-006] Streaming and capture        Pending
```

---

### 2. Task Detail View

Shows details for a selected task.

Example layout:

```
Task T-005 — Server client

Status: Running
Created: 2026-02-01T13:10:00Z

Objective:
Implement HTTP client to POST prompts to server.

Assigned Roles:
- Planner
- Implementer

Related Goals:
- MVP execution loop

Reports:
- [planner] 20260201T131200Z  success
- [reviewer] 20260201T131400Z  partial
```

If no reports exist:
```
Reports:
(none yet)
```

---

## Navigation & keybindings

### Task List
- `↑ / ↓` — move selection
- `Enter` — open task detail
- `Esc` — return to dashboard

### Task Detail
- `Esc` — return to task list

(No scrolling required in MVP; truncate overflow if necessary.)

---

## TUI state changes

Extend TUI state:

```ts
interface TuiState {
  activeView: ViewId
  statusMessage: string
  project?: Project

  // Task navigation
  selectedTaskIndex?: number
  activeTaskId?: string
}
```

---

## Architecture & boundaries

- Views **receive domain objects**, never read files
- Selection state lives in TUI state
- Task list and detail views are separate renderers

---

## Proposed file changes

### New files
```
src/tui/views/tasks/
  list.ts
  detail.ts
```

### Updated files
```
src/tui/views/tasks.ts        (router between list/detail)
src/tui/state.ts
src/tui/keybindings.ts
```

---

## Implementation steps

1. **Task List rendering**
   - Sort tasks by ID (or creation time)
   - Highlight selected row
   - Show status with simple color coding:
     - Completed → green
     - Running → yellow
     - Blocked → red
     - Pending → default

2. **Selection handling**
   - Initialize selection at index 0
   - Clamp selection on bounds
   - Update `selectedTaskIndex` on arrow keys

3. **Open task detail**
   - On `Enter`, set `activeTaskId`
   - Switch view to task detail

4. **Task detail rendering**
   - Lookup task by ID
   - Render fields in a vertical layout
   - List reports (from parsed domain data)
   - Show report status only (no deep inspection yet)

5. **Back navigation**
   - `Esc` returns to task list
   - Preserve selection index

---

## Error handling

- If a task referenced in state no longer exists:
  - Show error message
  - Return to task list
- Do not crash TUI due to malformed task data

---

## Testing

### Unit tests
Add under `test/tui/tasks/`:

- Task list renders correct number of rows
- Selection movement logic works
- Task detail renders correct task fields

Mock `Project`, `Task`, and `Report` objects.

Manual verification:
- Keyboard navigation
- Readability in small terminals

---

## Acceptance criteria (Definition of Done)

- [ ] Task list view shows all tasks with status
- [ ] Operator can navigate task list with keyboard
- [ ] Task detail view renders full task information
- [ ] Reports are listed per task
- [ ] Navigation between list and detail works
- [ ] No mutation or execution logic included
- [ ] `bun test` passes

---

## Deliverables

- Task list and detail TUI views
- Keyboard navigation wiring
- Tests for rendering and state transitions
