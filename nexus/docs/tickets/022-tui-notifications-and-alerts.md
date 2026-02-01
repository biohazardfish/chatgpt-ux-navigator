# Ticket 022 - TUI Notifications and Alerts (Operator Awareness & Attention Management)

## Title

TUI Notifications and Alerts (Operator Awareness & Attention Management)

## Goal

Add a **notifications and alerts system** to the Nexus TUI so the operator is clearly informed about:

- Blocked or failed tasks
- Conflicts and escalations
- Pending approval checkpoints
- Errors and warnings during execution

This ticket ensures **important events are visible, persistent, and actionable** without overwhelming the user.

---

## Context

From earlier tickets:

- TUI shell and views exist (008–011)
- Governance can block tasks or escalate to approvals (015, 020, 021)
- Approvals are modal and blocking (011)

What’s missing is a **non-modal, persistent signaling layer** that tells the operator *what needs attention and why*.

---

## Design principles

1. **Signal over noise**
   - Only surface events that matter to operator decisions
2. **Persistent until acknowledged**
   - Alerts should not disappear silently
3. **Non-intrusive by default**
   - Do not interrupt unless necessary
4. **Actionable**
   - Alerts should guide the operator to the relevant view or action

---

## Alert types (MVP)

Define a finite set of alert types:

```ts
type AlertType =
  | 'task-blocked'
  | 'task-failed'
  | 'conflict-detected'
  | 'approval-required'
  | 'execution-error'
  | 'system-warning'
```

---

## Alert severity

```ts
type AlertSeverity =
  | 'info'
  | 'warning'
  | 'error'
```

Severity mapping (MVP):

| Alert Type           | Severity |
|----------------------|----------|
| approval-required    | warning  |
| conflict-detected    | warning  |
| task-blocked         | error    |
| task-failed          | error    |
| execution-error      | error    |
| system-warning       | warning  |

---

## Alert model

```ts
interface Alert {
  id: string
  type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  relatedProjectId?: string
  relatedTaskId?: string
  createdAt: string
  acknowledged: boolean
}
```

Alerts are **UI-level state**, not persisted to project storage (MVP).

---

## TUI behavior

### Where alerts appear

1. **Header indicator**
   - Show alert count by severity
   - Example:
     ```
     Alerts: ⚠ 2  ✖ 1
     ```

2. **Footer status**
   - If an unacknowledged alert exists, show the most recent alert summary

3. **Alerts view**
   - Dedicated view listing all alerts

---

## Alerts view layout (MVP)

```
Alerts

[✖] Task T-006 blocked
    Conflict detected between Planner and Devil’s Advocate

[⚠] Approval required
    Resolve task T-006 outcome
```

Legend:
- ✖ error
- ⚠ warning
- ℹ info

---

## Navigation & interaction

### Global keys
- `a` → open Alerts view
- `Enter` → acknowledge selected alert
- `Esc` → return to previous view

### Alert acknowledgment
- Marks alert as `acknowledged = true`
- Acknowledged alerts remain visible but de-emphasized
- Header/ footer indicators update immediately

---

## Alert creation rules (MVP)

Alerts should be created when:

- Governance outcome = `blocked`
- Governance detects conflicts
- ApprovalRequest is generated
- Session execution fails after retries
- System-level errors occur (config, I/O)

Alert creation is done in the **app/governance layer**, not the TUI.

---

## TUI state changes

Extend TUI state:

```ts
interface TuiState {
  ...
  alerts: Alert[]
  selectedAlertIndex?: number
}
```

---

## Architecture & boundaries

- **Alert generation**
  - Happens in orchestration/governance layers
- **Alert rendering & acknowledgment**
  - Handled by TUI
- **No persistence**
  - Alerts reset on restart (intentional for MVP)

---

## Proposed file structure

### New files
```
src/tui/alerts/
  types.ts
  store.ts
  view.ts
```

### Updated files
```
src/tui/state.ts
src/tui/keybindings.ts
src/tui/index.ts
```

---

## Implementation steps

1. **Define alert types and model**
   - Centralized in `alerts/types.ts`

2. **Alert store**
   - In-memory store with helpers:
     ```ts
     addAlert(alert: Alert)
     acknowledgeAlert(alertId: string)
     getUnacknowledgedAlerts()
     ```

3. **Header and footer indicators**
   - Update layout to show alert counts

4. **Alerts view**
   - Render list
   - Support selection + acknowledgment

5. **Integration points**
   - Wire alert creation calls from:
     - Governance evaluation
     - Approval escalation
     - Execution error paths

---

## Error handling

- Malformed alerts should be logged and ignored
- UI must not crash if alert list is empty

---

## Testing

Add tests under `test/tui/alerts/`:

- Alert added → visible in header indicator
- Acknowledging alert updates state
- Alerts view renders correct content
- Severity counts update correctly

Mock alerts; no orchestration required.

---

## Acceptance criteria (Definition of Done)

- [ ] Alerts appear when important events occur
- [ ] Header and footer reflect alert state
- [ ] Alerts persist until acknowledged
- [ ] Operator can view and acknowledge alerts
- [ ] Alerts do not block execution unless paired with approval
- [ ] No persistence required
- [ ] `bun test` passes

---

## Deliverables

- Alert model and store
- Alerts view in TUI
- Integration hooks for alert creation
- Tests validating alert behavior
