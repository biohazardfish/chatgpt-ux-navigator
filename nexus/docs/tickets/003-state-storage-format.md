# Ticket 003 - Persistent State Storage Format (projects, plans, tasks, decisions)

## Title

Persistent State Storage Format (projects, plans, tasks, decisions)

---

## Goal

Define and implement the **on-disk state layout and file formats** for Nexus so that:

- All **project intent and governance state** is persisted locally
- State is **human-readable, inspectable, and editable** (plain text + Markdown)
- State is **stable across restarts**
- Later tickets (tasks, governance, TUI) can rely on a clear, versioned structure

This ticket establishes the _canonical source of truth_ for Nexus project state.

---

# Context

Nexus deliberately **does not persist ChatGPT sessions**.  
Instead, it persists **curated intent**:

- Goals
- Plans
- Tasks and their lifecycle
- Reports (interpreted, not raw transcripts)
- Decisions and notes

This ticket defines _what_ is stored, _where_, and _in what format_ — but does **not** implement orchestration or TUI behavior yet.

---

# Design principles (non-negotiable)

1. **Human-readable first**
    - Markdown for narrative state
    - Small JSON/YAML only where structure is critical

2. **Append-friendly**
    - Decisions, notes, and task history should be append-only where possible

3. **Explicit over implicit**
    - No hidden derived state
    - No inference from filenames alone

4. **Forward-compatible**
    - Include a version marker
    - Avoid fragile schemas

---

# High-level state layout

All persistent state lives under `stateDir` (from ticket 002).

```
<stateDir>/
  projects/
    <project-id>/
      project.md
      plan.md
      notes.md
      decisions/
        001-<slug>.md
        002-<slug>.md
      tasks/
        <task-id>/
          task.md
          reports/
            <run-id>-<role>.md
      meta.json
```

---

# Project identity

## Project ID

- A short, filesystem-safe string (e.g. `auth-mvp`, `nexus-bootstrap`)
- Chosen at project creation time
- Immutable once created

## `meta.json`

Machine-readable metadata for Nexus internals.

**Format (JSON):**

```json
{
    "version": 1,
    "projectId": "nexus-mvp",
    "createdAt": "2026-02-01T12:00:00Z",
    "lastUpdatedAt": "2026-02-01T12:34:00Z",
    "status": "active"
}
```

Purpose:

- Versioning
- Quick loading without parsing markdown
- Non-narrative state only

---

# Core markdown files

## `project.md`

Top-level project definition.

**Required sections:**

```md
# Project: Nexus MVP

# Goals

- Build a usable Nexus MVP
- Support planning, tasks, and governance

# Constraints

- Local-first
- Bun runtime
- Plain text + markdown only

# Non-Goals

- Full autonomy
- Cloud sync
```

---

## `plan.md`

Current approved plan only (no history here).

```md
# Current Plan

# Status

Approved | Draft | Superseded

# Phases

1. Repo bootstrap
2. Core orchestration
3. MVP TUI

# Notes

- Plan changes require user approval
```

Old plans are **not kept here**; when superseded, they may be copied to `notes.md` or referenced in a decision.

---

## `notes.md`

Living, curated memory.

```md
# Project Notes

# Assumptions

- Sessions are ephemeral
- Output is plain text only

# Clarifications

- Reports must follow a strict text convention

# Lessons Learned

- (append over time)
```

---

# Tasks

## Directory

```
tasks/<task-id>/
```

- `task-id` format: `T-001`, `T-002`, etc. (sequential per project)

## `task.md`

Authoritative task definition.

```md
# Task T-003 — Design Report Format

# Status

Pending | Running | Blocked | Completed | Aborted

# Objective

Define a text-based report convention that can be parsed reliably.

# Assigned Roles

- Planner
- Reviewer

# Related Goals

- Governance
- Persistence

# Created At

2026-02-01T13:10:00Z
```

---

## Reports

Stored under:

```
tasks/<task-id>/reports/
```

Filename:

```
<run-id>-<role>.md
```

Example:

```
20260201T131200Z-planner.md
```

**Report file format (raw but structured text):**

```md
# Report — Planner

STATUS: success

SUMMARY:
Defines a minimal, parseable report structure using headers.

ARTIFACTS:

- Proposed template

RISKS:

- LLMs may drift from format

NEXT:

- Validate with reviewer role
```

> Raw transcripts from the server (if persisted later) **do not belong here**.  
> These are **interpreted reports**, not logs.

---

# Decisions

## Directory

```
decisions/
```

## File naming

Sequential, append-only:

```
001-report-format.md
002-storage-layout.md
```

## Decision file format

```md
# Decision 002 — Storage Layout

# Date

2026-02-01

# Context

We need a persistent, inspectable project state.

# Options Considered

1. JSON-only
2. Markdown-first (chosen)

# Decision

Use markdown for narrative state, JSON only for metadata.

# Rationale

Human readability and debuggability outweigh strict schema guarantees.

# Consequences

- Parsing logic required
- Manual edits possible
```

Decisions are **immutable once written**.

---

# Versioning & migration

- `meta.json.version` is the **storage schema version**
- This ticket sets version = `1`
- No migration logic required yet
- Future changes must:
    - Introduce a new version
    - Provide a migration plan (future ticket)

---

# API surface (for later tickets)

This ticket should introduce **read/write helpers** only for:

- Creating a new project skeleton
- Loading a project (read all core files)
- Writing updates to:
    - `meta.json` timestamps
    - task status changes
    - appending decisions

No orchestration logic yet.

---

# Proposed files to implement

## New

- `src/storage/layout.ts`
    - constants for directory and file names
- `src/storage/project.ts`
    - `createProject(projectId, initialData)`
    - `loadProject(projectId)`
- `src/storage/task.ts`
    - `createTask(projectId, taskData)`
    - `updateTaskStatus(...)`
- `src/storage/decision.ts`
    - `appendDecision(...)`

## Update

- `src/config/config.ts`
    - Use `projectsDir` from config

---

# Testing

Add tests under `test/storage/`:

- Create project → verify directory + files exist
- Create task → verify task structure
- Append decision → verify numbering and immutability
- Reload project → verify data consistency

Use temp directories; do not touch real `stateDir`.

---

# Acceptance criteria (Definition of Done)

- [ ] Storage layout exactly matches documented structure
- [ ] All persisted files are plain text or markdown (except `meta.json`)
- [ ] Projects, tasks, and decisions can be created and reloaded
- [ ] No session or transcript data is persisted here
- [ ] Schema versioning is present
- [ ] `bun test` passes

---

# Deliverables

- Implemented storage layout and helpers
- Tests covering creation and reload
- This format documented in code comments where appropriate
