# Ticket 023 - TUI Search and Filter (Efficient Navigation at Scale)

## Title

TUI Search and Filter (Efficient Navigation at Scale)

## Goal

Add **search and filtering capabilities** to the Nexus TUI so operators can efficiently navigate **large projects** with many tasks, alerts, and decisions.

This ticket focuses on **operator productivity**, not new orchestration behavior.

---

## Context

From earlier tickets:

- TUI supports dashboard, tasks, task details, alerts, and approvals (008–022)
- Alerts and tasks can grow large over time
- Keyboard-only navigation becomes inefficient without filtering

This ticket introduces **non-destructive, read-only views** over existing data.

### Rendering baseline (OpenTUI)

- Search/filter UI must be implemented with `@opentui/core` renderables.
- Search input capture and filter toggles should use OpenTUI key/input events.
- Do not introduce blessed compatibility layers for this feature.

---

## Scope

### Included
- Search and filter for:
  - Task list
  - Alerts list
- Keyboard-driven query input
- Clear indication of active filters
- Zero impact on underlying project state

### Excluded
- Full-text search across markdown files
- Editing or batch operations
- Persisting filters across restarts

---

## Design principles

1. **Fast and reversible**
   - Filters can be applied and cleared instantly
2. **Non-destructive**
   - Never hide data permanently
3. **Visible**
   - Active filters/search terms must be obvious
4. **Keyboard-first**
   - No modal text editors or mouse interaction

---

## Search & filter model

### Search query
- Simple case-insensitive substring match
- Applies to:
  - Task ID
  - Task title
  - Alert title
  - Alert message

No regex or advanced query language in MVP.

---

### Filters (MVP)

#### Task filters
- By status:
  - `pending`
  - `running`
  - `blocked`
  - `completed`
- By role (any assigned role)
- By task ID prefix (e.g. `T-01`)

#### Alert filters
- By severity:
  - `info`
  - `warning`
  - `error`
- By acknowledged state:
  - `acknowledged`
  - `unacknowledged`

---

## TUI interaction model

### Global keys
- `/` → enter search mode
- `f` → toggle filter panel
- `Esc` → exit search / clear filters (context-sensitive)

---

### Search mode

When `/` is pressed:

- Footer switches to input mode:
  ```
  Search: _
  ```
- Typed characters update the search query live
- `Enter` confirms search
- `Esc` cancels search and clears query

Search applies immediately to the active view (tasks or alerts).

---

### Filter panel (MVP)

Activated via `f`.

Example (Tasks view):

```
Filters:
[x] Status: blocked
[ ] Status: running
[ ] Status: completed

[x] Role: reviewer
[ ] Role: planner
```

Interaction:
- Arrow keys navigate
- Space toggles filter
- `Esc` closes panel

---

## Visual indicators

- Active search query shown in footer:
  ```
  Search: "blocked"
  ```
- Active filters shown in header or sub-header:
  ```
  Filters: status=blocked, role=reviewer
  ```

---

## TUI state changes

Extend TUI state:

```ts
interface TuiState {
  ...
  searchQuery?: string
  activeFilters: {
    taskStatus?: TaskStatus[]
    taskRoles?: Role[]
    alertSeverity?: AlertSeverity[]
    alertAcknowledged?: boolean
  }
}
```

---

## Architecture & boundaries

- Filtering logic lives in **pure selector functions**
- Views receive **already-filtered lists**
- No file I/O or domain mutation
- No coupling to orchestration or governance

---

## Proposed file structure

### New files
```
src/tui/search/
  input.ts          // search mode handling
  selectors.ts      // pure filtering functions
src/tui/filters/
  panel.ts
  types.ts
```

### Updated files
```
src/tui/state.ts
src/tui/keybindings.ts
src/tui/views/tasks/list.ts
src/tui/alerts/view.ts
```

---

## Implementation steps

1. **Define filter types**
   - Centralize filter definitions and defaults

2. **Implement selectors**
   - `filterTasks(tasks, searchQuery, filters)`
   - `filterAlerts(alerts, searchQuery, filters)`

3. **Search input handling**
   - Capture keystrokes
   - Update `searchQuery` in state
   - Trigger re-render

4. **Filter panel**
   - Render available filters based on view
   - Toggle filters in state

5. **Integrate into views**
   - Apply selectors before rendering lists
   - Handle empty result states gracefully

---

## Error handling

- Invalid filter combinations should result in empty lists, not errors
- Search input should never crash TUI

---

## Testing

Add tests under `test/tui/search/`:

- Search matches task IDs and titles
- Filter by task status
- Combined search + filter
- Clearing filters restores full list
- Alert filtering by severity and acknowledgment

Mock tasks and alerts.

---

## Acceptance criteria (Definition of Done)

- [ ] Operator can search tasks and alerts via `/`
- [ ] Operator can apply and clear filters via `f`
- [ ] Active search and filters are visible
- [ ] Filtering is non-destructive and reversible
- [ ] No performance issues on moderate list sizes
- [ ] `bun test` passes

---

## Deliverables

- Search input mode
- Filter panel UI
- Pure selector functions
- Tests validating search and filtering behavior
