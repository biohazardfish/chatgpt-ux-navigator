# Ticket 004 - Domain Model: Project, Goal, Plan, Task, Report, Decision

## Title

Domain Model: Project, Goal, Plan, Task, Report, Decision

## Goal

Define and implement the **in-memory domain model** for Nexus that:

- Maps **1:1 to the persistent storage format** defined in ticket 003
- Encodes **invariants and lifecycle rules** explicitly
- Provides a stable foundation for orchestration, governance, and TUI logic
- Avoids embedding behavior that belongs to later phases (execution, UI, concurrency)

This ticket establishes the **authoritative types and rules** Nexus reasons over.

---

## Context

By design:

- Markdown files are the **source of truth**
- Domain models are **structured representations** of that state
- ChatGPT sessions never mutate domain objects directly
- All orchestration and governance logic operates on these models

This ticket focuses on **structure and correctness**, not orchestration behavior.

---

## Design principles

1. **Reflect persisted reality**  
   Domain objects should not invent fields that don’t exist on disk.

2. **Explicit lifecycle states**  
   Status enums over booleans or inferred state.

3. **Pure data + light validation**  
   Minimal methods; no side effects or I/O.

4. **Governance-ready**  
   The model must support later decisions like “can this task proceed?” or “does this require approval?”

---

## Core domain objects

### 1. Project

Represents a loaded project in memory.

```ts
interface Project {
  meta: ProjectMeta
  projectDoc: ProjectDoc
  plan: Plan
  notes: Notes
  tasks: Task[]
  decisions: Decision[]
}
```

#### Invariants
- `projectId` is immutable
- Exactly **one active plan**
- Tasks are uniquely identified within a project

---

### 2. ProjectMeta

From `meta.json`.

```ts
interface ProjectMeta {
  version: number
  projectId: string
  createdAt: string   // ISO
  lastUpdatedAt: string
  status: 'active' | 'paused' | 'completed'
}
```

---

### 3. ProjectDoc (from `project.md`)

```ts
interface ProjectDoc {
  title: string
  goals: string[]
  constraints: string[]
  nonGoals: string[]
}
```

Notes:
- Parsed from Markdown sections
- Order preserved where possible

---

### 4. Plan

From `plan.md`.

```ts
interface Plan {
  status: 'draft' | 'approved' | 'superseded'
  phases: string[]
  notes: string[]
}
```

#### Invariants
- Only `approved` plans may drive task execution
- Transition to `superseded` requires a recorded Decision (enforced later)

---

### 5. Notes

From `notes.md`.

```ts
interface Notes {
  assumptions: string[]
  clarifications: string[]
  lessonsLearned: string[]
}
```

Notes are:
- Mutable
- Append-heavy
- Never authoritative for decisions

---

### 6. Task

From `tasks/<task-id>/task.md`.

```ts
interface Task {
  id: string            // e.g. T-003
  title: string
  status: TaskStatus
  objective: string
  assignedRoles: Role[]
  relatedGoals: string[]
  createdAt: string
}
```

```ts
type TaskStatus =
  | 'pending'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'aborted'
```

#### Invariants
- Terminal states: `completed`, `aborted`
- Only `pending` → `running` allowed automatically
- Re-running a completed task requires explicit override (later governance)

---

### 7. Role

```ts
type Role =
  | 'planner'
  | 'implementer'
  | 'reviewer'
  | 'researcher'
  | 'devils-advocate'
```

Notes:
- String union for easy serialization
- No behavior attached here

---

### 8. Report

Derived from files in `tasks/<task-id>/reports/`.

```ts
interface Report {
  runId: string
  role: Role
  status: 'success' | 'partial' | 'blocked'
  summary: string
  artifacts: string[]
  risks: string[]
  next: string[]
  rawText: string
}
```

#### Notes
- `rawText` is preserved for traceability
- Parsed fields are best-effort but validated
- Reports are **advisory**, never authoritative

---

### 9. Decision

From `decisions/*.md`.

```ts
interface Decision {
  id: number
  title: string
  date: string
  context: string
  options: string[]
  decision: string
  rationale: string
  consequences: string[]
}
```

#### Invariants
- Decisions are immutable once loaded
- Ordering is defined by ID, not filesystem order

---

## Parsing responsibility

This ticket should define **parsers** that:

- Convert Markdown → domain objects
- Fail with actionable errors if required sections are missing
- Preserve unknown sections as raw text where appropriate (future-proofing)

Parsing helpers should be **pure functions**:
```ts
parseProjectDoc(markdown: string): ProjectDoc
parsePlan(markdown: string): Plan
parseTask(markdown: string): Task
parseDecision(markdown: string): Decision
parseReport(markdown: string): Report
```

---

## Validation rules (MVP scope)

Implement lightweight validation:

- Required sections exist
- Status values are valid
- IDs match expected formats
- Roles are known roles

No deep semantic validation yet (that’s governance later).

---

## Proposed file structure

### New files
```
src/core/domain/
  project.ts
  plan.ts
  task.ts
  report.ts
  decision.ts
  role.ts
  index.ts
```

### Parsing helpers
```
src/core/parsing/
  markdown.ts        // shared helpers
  project.ts
  plan.ts
  task.ts
  decision.ts

src/core/report/
  convention.ts      // strict report contract + docs
  parser.ts
  errors.ts
  index.ts
```

---

## Integration with storage layer

- Storage layer (ticket 003) is responsible for:
  - Reading raw files
  - Writing updates
- Domain layer (this ticket) is responsible for:
  - Interpreting raw content
  - Enforcing invariants in memory

**No file I/O inside domain code.**

---

## Testing

Add tests under `test/domain/`:

- Parse valid markdown → domain object
- Missing required sections → clear error
- Invalid status/role → rejected
- Round-trip sanity: markdown → object → expected fields

Use fixture markdown files for clarity.

---

## Acceptance criteria (Definition of Done)

- [ ] Domain types defined for Project, Plan, Task, Report, Decision
- [ ] Parsers implemented for all core markdown files
- [ ] Validation rejects malformed or invalid content
- [ ] Domain model aligns exactly with storage format from ticket 003
- [ ] No I/O or orchestration logic included
- [ ] `bun test` passes with domain coverage

---

## Deliverables

- Domain model TypeScript definitions
- Markdown parsers with validation
- Tests validating correctness and failure modes
