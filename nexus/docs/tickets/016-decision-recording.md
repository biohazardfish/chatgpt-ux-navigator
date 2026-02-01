# Ticket 016 - Decision Recording (Persistent Governance Outcomes)

## Title

Decision Recording (Persistent Governance Outcomes)

## Goal

Implement **persistent decision recording** so that all approved, high-impact governance outcomes are captured as **immutable decision records** in project state.

This ticket ensures that:
- Important choices are never lost
- Rationale and trade-offs are preserved
- Future work is guided by past decisions

This is a **core governance milestone**.

---

## Context

From earlier tickets:

- Governance evaluation determines outcomes and may escalate to the user (ticket 015)
- TUI supports explicit approval checkpoints (ticket 011)
- Storage format defines decision files (ticket 003)

This ticket bridges **user approvals → durable project memory**.

---

## Scope

### Included
- Creating and persisting decision records
- Mapping governance outcomes and user approvals to decisions
- Sequential numbering and naming
- Linking decisions to tasks and context

### Excluded
- Editing or deleting decisions
- Advanced decision querying or visualization
- Automatic decision generation without user approval

---

## Decision triggers (MVP)

A decision **must** be recorded when:

1. A task outcome is **escalated** and the user selects:
   - Accept
   - Revise
   - Abort
2. A task is explicitly **accepted** after governance evaluation
3. A plan is approved or superseded (future use; scaffold now)

Low-impact, automatic outcomes may be excluded for MVP, but task-level acceptance **must** be recorded.

---

## Decision content

Decision files live in:

```
projects/<project-id>/decisions/
```

### File naming
Sequential, zero-padded:

```
001-task-T-005-accept.md
002-task-T-006-revise.md
```

---

### Decision file format

```md
# Decision 002 — Task T-006 Resolution

## Date
2026-02-01

## Context
Task T-006 produced conflicting reports between Planner and Reviewer.

## Options Considered
- Accept as-is
- Request revisions
- Abort task

## Decision
Request revisions.

## Rationale
The reviewer identified unresolved risks that must be addressed.

## Consequences
- Task remains blocked
- Follow-up task required
```

---

## API design

### Decision input

```ts
interface DecisionInput {
  projectId: string
  taskId?: string
  title: string
  context: string
  options: string[]
  decision: string
  rationale: string
  consequences: string[]
}
```

---

### Recording function

```ts
function recordDecision(
  input: DecisionInput
): Decision
```

- Assigns next sequential ID
- Writes decision file
- Updates project `meta.json.lastUpdatedAt`
- Returns parsed `Decision`

---

## Integration flow (MVP)

1. Governance evaluation escalates and produces `ApprovalRequest`
2. User selects an option in TUI
3. App layer maps:
   - Approval option → `DecisionInput`
4. Call `recordDecision`
5. Continue execution based on decision (out of scope)

---

## Persistence rules

- Decision IDs are **monotonic per project**
- Decision files are **immutable**
- If a decision file already exists at a computed ID:
  - Throw and fail loudly (never overwrite)

---

## Error handling

- Missing required fields → error
- Invalid project or decision directory → error
- Partial writes must not occur (write temp file then rename)

---

## Proposed file structure

### New files
```
src/storage/decisionRecorder.ts
```

### Updated files
```
src/storage/decision.ts     // reuse parsing logic
src/app/approvalHandler.ts  // map approval → decision (light glue)
```

---

## Implementation steps

1. **Determine next ID**
   - Scan `decisions/` directory
   - Compute next sequential integer

2. **Render decision markdown**
   - Use fixed template
   - Fill fields deterministically

3. **Atomic write**
   - Write to temp file
   - Rename to final filename

4. **Update metadata**
   - Update `meta.json.lastUpdatedAt`

5. **Return parsed Decision**
   - Parse written file using domain parser

---

## Testing

Add tests under `test/storage/decision.test.ts`:

- First decision is `001-*`
- Sequential numbering increments
- File contents match input
- Existing ID collision throws
- Atomic write behavior (simulate failure)

Use temp project fixtures.

---

## Acceptance criteria (Definition of Done)

- [ ] Decisions are persisted as markdown files
- [ ] Sequential numbering enforced
- [ ] Decisions are immutable
- [ ] Metadata updated correctly
- [ ] Approval flow can record decisions
- [ ] Tests cover success and failure cases
- [ ] `bun test` passes

---

## Deliverables

- Decision recording implementation
- Glue logic from approval to decision input
- Tests validating durability and correctness
