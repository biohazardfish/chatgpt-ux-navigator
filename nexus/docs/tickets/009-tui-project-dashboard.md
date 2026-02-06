# Ticket 009 - TUI Project Dashboard (Project Summary View)

## Title

TUI Project Dashboard (Project Summary View)

## Goal

Implement the **Dashboard view** in the Nexus TUI that gives the operator an at-a-glance, read-only summary of the **current project state**.

This view is the **home screen** of Nexus and answers:
- What project am I in?
- What are the goals?
- What is the plan status?
- What is currently happening?

---

## Context

From earlier tickets:

- A TUI shell with navigation exists (ticket 008)
- Project state is persisted in local files (ticket 003)
- Domain models parse that state (ticket 004)

This ticket **connects the TUI to real project data**, but remains **read-only** and **non-interactive**.

### Rendering baseline (OpenTUI)

- This ticket targets the OpenTUI stack defined in `nexus/docs/000-tech-tack.md`.
- Use `@opentui/core` primitives (renderer + renderables) for layout and text output.
- Avoid blessed-era widget assumptions; new view code should map to OpenTUI renderables directly.

---

## Scope

### Included
- Render current project summary
- Display goals, plan status, and task counts
- Surface high-level status (idle / running / blocked)
- Graceful handling of “no project loaded”

### Excluded
- Editing goals or plans
- Creating tasks
- Starting or stopping execution
- Approval prompts

Those come in later tickets.

---

## Dashboard layout (MVP)

```
Project: Nexus MVP
Status: Active

Goals:
- Build a usable Nexus MVP
- Support planning, tasks, and governance

Plan:
- Status: Approved
- Phases:
  1. Repo bootstrap
  2. Core orchestration
  3. MVP TUI

Tasks:
- Pending: 3
- Running: 1
- Blocked: 0
- Completed: 5

Decisions:
- Recorded: 4

Notes:
- Assumptions: 2
- Clarifications: 1
```

If no project is loaded:

```
No project loaded.

Press [n] to create a new project
or [o] to open an existing one.
```

(`n` / `o` behavior may be stubbed or no-op for now.)

---

## Data requirements

Dashboard needs **aggregated, read-only access** to:

- `ProjectMeta`
- `ProjectDoc` (goals)
- `Plan` (status, phases)
- `Task[]` (status counts)
- `Decision[]` (count only)
- `Notes` (section counts only)

---

## TUI state changes

Extend TUI state:

```ts
interface TuiState {
  activeView: ViewId
  statusMessage: string
  project?: Project
}
```

- `project` may be `undefined`
- Dashboard must handle both cases gracefully

---

## Architecture & boundaries

### Where project loading happens
- **Not in the dashboard view**
- Project loading should occur in:
  - `app/bootstrap.ts` (initial load)
  - or a small `app/projectLoader.ts`

Dashboard receives:
```ts
renderDashboard(container, tuiState)
```

---

## Proposed file changes

### New / updated files

```
src/tui/views/dashboard.ts    (real implementation)
src/app/projectLoader.ts      (load project from storage)
src/app/bootstrap.ts          (inject project into TUI state)
```

No changes to storage or domain layers.

---

## Implementation steps

1. **Project loading**
   - On startup, attempt to load:
     - last-used project (if you track it)
     - OR a single project if only one exists
     - OR none (dashboard shows empty state)
   - For MVP, a hardcoded project ID is acceptable.

2. **Aggregate derived values**
   - Count tasks by status
   - Count decisions
   - Count notes sections

3. **Render dashboard**
   - Clear container
   - Render text blocks in order
   - Use bold or color sparingly (project title, headings)

4. **Empty state handling**
   - If `tuiState.project === undefined`
   - Render “No project loaded” message

---

## Error handling

- If project loading fails:
  - Show error message in dashboard
  - Update footer status message
- Do not crash TUI on malformed project data

---

## Testing

### Unit tests
Add under `test/tui/dashboard.test.ts`:

- Renders project summary with mock project
- Renders empty state when no project

Mock `Project` object; do not hit filesystem.

Manual verification:
- Visual layout
- Readability at typical terminal sizes

---

## Acceptance criteria (Definition of Done)

- [ ] Dashboard view shows real project data
- [ ] Task counts by status are correct
- [ ] Plan status and phases render correctly
- [ ] No-project state is handled cleanly
- [ ] Dashboard is read-only
- [ ] No storage or server logic in TUI
- [ ] `bun test` passes

---

## Deliverables

- Implemented dashboard view
- Project data wired into TUI state
- Tests for dashboard rendering
