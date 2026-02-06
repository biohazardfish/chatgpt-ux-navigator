# Ticket 008 - TUI Shell and Navigation (Nexus Operator Interface MVP)

## Title

TUI Shell and Navigation (Nexus Operator Interface MVP)

## Goal

> Glossary: nexus/docs/006-session-orchestration.md#glossary

Implement the **foundational Terminal User Interface (TUI) shell** for Nexus that allows an operator to:

- Start Nexus and see a live UI instead of console logs
- Navigate between high-level views using the keyboard
- See application status and notifications
- Provide a structural frame for all future TUI features

This ticket delivers the **minimum usable TUI skeleton**, not full functionality.

---

## Context

Nexus is explicitly **not a chat UI**.  
The TUI is an **operational control surface**.

From earlier tickets:
- Domain, storage, server execution, and report parsing exist or are in progress
- The TUI must surface state and request approvals, but not embed logic

This ticket establishes **layout, navigation, and event loop**, nothing more.

---

## Design principles

1. **Keyboard-first**
2. **Predictable layout**
3. **No visual noise**
4. **Clear separation between UI and logic**

---

## TUI scope (MVP)

Canonical MVP decisions: see `nexus/docs/006-session-orchestration.md#mvp-decisions-resolved`.

This ticket includes:

- A fullscreen TUI
- A persistent header
- A main content pane
- A footer / status bar
- Keyboard navigation between placeholder views
- Run one task (single-task execution trigger)

This ticket explicitly excludes:
- Editing state
- Triggering arbitrary tasks/workflows beyond the minimal “run one task” flow
- Approval dialogs
- Real-time streaming output (Future work; TUI mirrors buffered JSON capture only)
- Parallel control surface (Future work; execution stays sequential per `nexus/docs/006-session-orchestration.md#mvp-decisions-resolved`)

### MVP alignment notes

- **Run one task extension:** The TUI may expose a single entry point that kicks off the sequential runner defined in ticket 013 while respecting buffered-only capture from ticket 006. No other orchestration controls ship in MVP.
- **Non-goals:** Any UI concept resembling streaming response playback or parallel operator dashboards must be labeled **Future work** and link back to the canonical session orchestration decisions so readers understand the constraint.

---

## Technology choice

- **Library**: `blessed` or `blessed-contrib`
  - Both work well with Bun
  - Prefer `blessed` alone unless charts are required
- Avoid heavy abstractions or frameworks

---

## Layout specification

```
┌───────────────────────────────────────────────┐
│ Nexus — <project-id>            [q] Quit      │  ← Header
├───────────────────────────────────────────────┤
│                                               │
│   Main View Area                               │
│                                               │
│   (content depends on active view)             │
│                                               │
├───────────────────────────────────────────────┤
│ Status: Ready   View: Dashboard   Mode: Normal │  ← Footer
└───────────────────────────────────────────────┘
```

---

## Views (placeholders)

Define view identifiers (no real data yet):

- `dashboard`
- `tasks`
- `sessions`
- `decisions`
- `logs`

Each view:
- Renders a title and placeholder text
- Can be switched via keybindings

---

## Navigation & keybindings

### Global keys
- `q` → quit Nexus (with confirmation later; for now immediate)
- `?` → help overlay (placeholder text)
- `Esc` → no-op or back (placeholder)

### View switching
- `1` → Dashboard
- `2` → Tasks
- `3` → Sessions
- `4` → Decisions
- `5` → Logs

Active view is highlighted in footer.

---

## TUI state model

Minimal UI state:

```ts
interface TuiState {
  activeView:
    | 'dashboard'
    | 'tasks'
    | 'sessions'
    | 'decisions'
    | 'logs'
  statusMessage: string
}
```

No business state here — only UI state.

---

## Architecture

### Separation of concerns

- `tui/`
  - Layout
  - Keybindings
  - Rendering
- `app/`
  - Bootstrapping
  - Wiring domain/state later

TUI should not:
- Read files directly
- Call server client
- Mutate project state

---

## Proposed file structure

### New files
```
src/tui/
  index.ts          # create + start TUI
  layout.ts         # screen + boxes
  views/
    dashboard.ts
    tasks.ts
    sessions.ts
    decisions.ts
    logs.ts
  keybindings.ts
  state.ts
```

### Updates
- `src/app/bootstrap.ts`
  - Start TUI instead of printing “ready”

---

## Implementation steps

1. **Initialize screen**
   - Create blessed screen
   - Enable mouse = false
   - Smart CSR on

2. **Create layout**
   - Header box
   - Main content box
   - Footer box
   - Handle resize events

3. **Define views**
   - Each view exports `render(container, state)`
   - Render placeholder content

4. **Keybindings**
   - Bind number keys to switch views
   - Bind `q` to exit
   - Update `TuiState` and re-render

5. **Render loop**
   - On state change, clear and redraw main view
   - Update footer status line

---

## Error handling

- If TUI fails to initialize:
  - Log error
  - Exit with non-zero code
- Do not swallow exceptions inside key handlers

---

## Testing

Minimal tests only:

- `test/tui/state.test.ts`
  - State transitions (view switching)

Manual verification is acceptable for:
- Layout correctness
- Keyboard behavior

(No snapshot testing required.)

---

## Acceptance criteria (Definition of Done)

- [ ] Nexus starts in a fullscreen TUI
- [ ] Header, main pane, and footer render correctly
- [ ] Number keys switch views
- [ ] Footer reflects active view
- [ ] `q` cleanly exits
- [ ] No business logic embedded in TUI
- [ ] `bun test` passes

---

## Deliverables

- TUI shell with navigation
- Placeholder views
- Clean separation of UI state and logic
