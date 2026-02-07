# Ticket 024 - Better Project Summaries (Automated Project Digests)

## Title

Better Project Summaries (Automated Project Digests)

## Goal

Implement **automated, high-level project summaries** that help the operator quickly understand:

- What has happened recently
- What decisions have been made
- What work is blocked or risky
- What still needs attention

This ticket focuses on **summarization of existing state**, not new execution or governance behavior.

---

## Context

From earlier tickets:

- Project state, tasks, reports, and decisions are persisted (003, 016)
- TUI can display dashboards, tasks, alerts, and filters (008–023)
- Large projects become hard to reason about from raw lists alone

This ticket introduces **derived summaries** that compress project history into **operator-friendly views**.

---

## Design principles

1. **Derived, never authoritative**
    - Summaries are computed from existing state
2. **Deterministic**
    - No AI calls or inference
3. **Explainable**
    - Every summary line can be traced to concrete data
4. **Cheap to compute**
    - Recomputed on demand or on state change

---

## Summary types (MVP)

Introduce three complementary summaries.

---

### 1. Project Digest (Overview)

A concise snapshot of project health.

Example:

```
Project Digest — Nexus MVP

Status:
- Active
- Approved plan
- 2 blocked tasks

Recent Activity:
- Task T-006 blocked due to conflicting reports
- Decision 004 recorded: Request revisions for T-006

Attention Required:
- Approval pending for task T-007
- Blocked tasks: T-006
```

---

### 2. Recent Decisions Summary

Highlights governance history.

Example:

```
Recent Decisions:
- [004] Task T-006 — Request revisions
- [003] Storage layout approved
- [002] Report format finalized
```

Limit to last **N decisions** (default: 5).

---

### 3. Blockers & Risks Summary

Focuses operator attention.

Example:

```
Blockers & Risks:
- T-006: Conflicting recommendations (Planner vs Devil’s Advocate)
- T-009: Session execution failed after retries
```

---

## Summary data sources

Summaries must be computed from:

- `ProjectMeta` (status)
- `Plan` (status)
- `Task[]` (status + last update)
- `Decision[]` (date + title)
- Active `Alert[]` (from TUI state, not persisted)

No new persisted fields introduced.

---

## Summary model

Define derived summary structures:

```ts
interface ProjectDigest {
    projectId: string;
    statusLine: string[];
    recentActivity: string[];
    attentionRequired: string[];
}

interface DecisionsSummary {
    items: {
        id: number;
        title: string;
        date: string;
    }[];
}

interface BlockersSummary {
    items: {
        taskId: string;
        reason: string;
    }[];
}
```

---

## Computation rules (MVP)

### Status

- Project status from `meta.status`
- Plan status from `plan.status`
- Count blocked tasks

---

### Recent activity

Include events from:

- Most recently updated tasks (last N = 5)
- Most recent decisions (last N = 3)

Order by recency.

---

### Attention required

Include:

- Unacknowledged alerts of severity `warning` or `error`
- Blocked tasks
- Pending approvals (if any)

---

## TUI integration

### Dashboard enhancement

Extend Dashboard view (ticket 009):

- Add a **“Project Digest”** section at the top
- Replace raw counts-only view with narrative summary

---

### Dedicated Summary View (optional but recommended)

Add a new view:

- `summary`

Accessible via:

- Key `s`

Shows:

- Full Project Digest
- Recent Decisions
- Blockers & Risks

---

## Architecture & boundaries

- Summary computation lives outside TUI views
- TUI renders summary objects only
- No storage or mutation logic in summaries

---

## Proposed file structure

### New files

```
src/core/summary/
  projectDigest.ts
  decisionsSummary.ts
  blockersSummary.ts
  index.ts
```

### Updated files

```
src/tui/views/dashboard.ts
src/tui/views/summary.ts     (if added)
src/tui/keybindings.ts
```

---

## Implementation steps

1. **Implement summary builders**
    - Pure functions consuming domain objects + alerts
2. **Add unit tests**
    - Deterministic output for known inputs
3. **Integrate into dashboard**
    - Render digest at top
4. **(Optional) Add summary view**
    - Render extended summaries

---

## Error handling

- Missing data → omit section
- Empty summaries → display “No recent activity”

No errors should bubble to UI.

---

## Testing

Add tests under `test/summary/`:

- Digest includes blocked tasks
- Decisions summary limited correctly
- Alerts surface in attention section
- Stable ordering

Mock project, tasks, decisions, alerts.

---

## Acceptance criteria (Definition of Done)

- [ ] Project Digest summarizes project health clearly
- [ ] Recent Decisions summary accurate and limited
- [ ] Blockers & Risks highlight critical issues
- [ ] Summaries derived only from existing state
- [ ] Dashboard uses new summary
- [ ] Optional summary view accessible
- [ ] `bun test` passes

---

## Deliverables

- Summary computation logic
- Dashboard integration
- Optional dedicated summary view
- Tests validating summary correctness
