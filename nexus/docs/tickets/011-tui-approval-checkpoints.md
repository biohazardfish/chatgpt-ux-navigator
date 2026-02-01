# Ticket 011 - TUI Approval Checkpoints (User-in-the-Loop Decisions)

## Title

TUI Approval Checkpoints (User-in-the-Loop Decisions)

## Goal

Implement **explicit approval checkpoints** in the Nexus TUI so that **no major action proceeds without deliberate user confirmation**.

This ticket introduces:
- A generic approval dialog system
- A blocking execution model while approval is pending
- Clear presentation of context, options, and recommended action

This is the first place where **user authority is enforced in the UI**.

---

## Context

From earlier tickets:

- TUI shell and navigation exist (008)
- Tasks and project state can be inspected (009, 010)
- Governance logic will soon need to:
  - Approve plans
  - Accept or reject task results
  - Resolve conflicts

This ticket provides the **UI mechanism**, not the governance decisions themselves.

---

## Scope

### Included
- A modal-style approval dialog
- Support for multiple approval types
- Keyboard-driven accept / revise / defer / abort
- Blocking behavior while approval is unresolved
- Recording the user’s choice in memory (persistence comes later)

### Excluded
- Actual governance logic that triggers approvals
- Persistence of approvals as Decisions (later ticket)
- Multiple simultaneous approvals (MVP supports one at a time)

---

## Approval model

### Approval Request

Define a generic structure:

```ts
interface ApprovalRequest {
  id: string
  type:
    | 'plan-approval'
    | 'task-acceptance'
    | 'conflict-resolution'
    | 'project-completion'
  title: string
  context: string        // human-readable explanation
  options: ApprovalOption[]
  recommendedOptionId?: string
}
```

```ts
interface ApprovalOption {
  id: string
  label: string          // e.g. "Approve", "Request Changes"
  description?: string
  action:
    | 'accept'
    | 'revise'
    | 'defer'
    | 'abort'
}
```

---

## User actions

At minimum, approvals must support:

- **Accept** — proceed as proposed
- **Revise** — pause execution and request changes
- **Defer** — pause without decision
- **Abort** — cancel the current action

Not all approvals need all options, but the UI must support them.

---

## TUI behavior

### Blocking semantics

- When an approval request is active:
  - Normal navigation is disabled
  - Only approval-related keys are active
  - Footer clearly indicates “Awaiting approval”

### Visual layout (conceptual)

```
┌───────────────────────────────────────────────┐
│ APPROVAL REQUIRED                              │
├───────────────────────────────────────────────┤
│ Plan Approval                                  │
│                                               │
│ Context:                                      │
│ The initial project plan has been generated   │
│ and must be approved before execution begins. │
│                                               │
│ Options:                                      │
│ [1] Approve plan        (recommended)          │
│ [2] Request revisions                          │
│ [3] Defer decision                             │
│ [4] Abort project                              │
│                                               │
│ Press number key to choose                     │
└───────────────────────────────────────────────┘
```

---

## Keyboard interaction

- `1..9` — select option
- `Esc` — no-op (explicit choice required)
- No mouse support

Once a choice is made:
- Approval dialog closes
- Result is passed back to the app layer
- TUI returns to previous view

---

## TUI state changes

Extend TUI state:

```ts
interface TuiState {
  activeView: ViewId
  statusMessage: string
  project?: Project

  approvalRequest?: ApprovalRequest
}
```

When `approvalRequest` is defined:
- Render approval modal
- Suspend normal views

---

## Architecture & boundaries

### Separation of responsibilities

- **TUI**
  - Renders approval request
  - Captures user choice
- **App / Governance layer**
  - Creates approval requests
  - Receives approval result
  - Decides next steps

The TUI must **not** decide what an approval means.

---

## Proposed file changes

### New files
```
src/tui/approval/
  modal.ts
  types.ts
```

### Updated files
```
src/tui/index.ts
src/tui/state.ts
src/tui/keybindings.ts
```

---

## Implementation steps

1. **Approval types**
   - Define types in `approval/types.ts`
   - Export for app-layer use

2. **Modal rendering**
   - Render centered overlay box
   - Dim or ignore background content
   - Highlight recommended option

3. **Key handling**
   - Intercept keys when approval active
   - Map number keys to options
   - Ignore unrelated keys

4. **Result handling**
   - Invoke callback or emit event with:
     ```ts
     {
       approvalId: string
       selectedOptionId: string
       action: 'accept' | 'revise' | 'defer' | 'abort'
     }
     ```
   - Clear `approvalRequest` from state

---

## Error handling

- If approval request is malformed:
  - Render error message
  - Do not crash TUI
- If no options provided:
  - Log error
  - Refuse to render modal

---

## Testing

### Unit tests
Add under `test/tui/approval/`:

- Modal renders with correct options
- Recommended option is highlighted
- Key press selects correct option
- Blocking behavior enforced

Mock approval requests; no governance logic needed.

Manual verification:
- Visual clarity
- No accidental dismissal

---

## Acceptance criteria (Definition of Done)

- [ ] Approval modal renders correctly
- [ ] Normal navigation is blocked during approval
- [ ] User can select among options via keyboard
- [ ] Selected option is returned to app layer
- [ ] TUI resumes normal operation afterward
- [ ] No governance logic embedded in UI
- [ ] `bun test` passes

---

## Deliverables

- Approval modal UI
- Approval request/response types
- Integration with TUI state and keybindings
