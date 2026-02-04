# Plan: Nexus State Storage Implementation (Ticket 003)

## TL;DR

> **Quick Summary**: Implement the persistent storage layer for Nexus projects, tasks, and decisions using a plain-text/Markdown strategy.
> 
> **Deliverables**:
> - `src/storage/` module with Project, Task, and Decision management.
> - Strict directory layout enforcement.
> - `bun test` suite for all storage operations.
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Layout/Utils → Project → Task/Decision

---

## Context

### Original Request
Implement "Ticket 003" (Persistent State Storage Format) for Nexus, defining how project state is saved to disk.

### Interview Summary
**Key Discussions**:
- **Target**: `nexus/docs/tickets/003-state-storage-format.md`.
- **Approach**: Use native `Bun.file` and template strings for Markdown (no new dependencies).
- **Config**: `src/config/config.ts` already provides `stateDir` and `projectsDir`.

### Metis Review
**Identified Gaps** (addressed):
- **Path Traversal**: Added strict regex validation for `projectId` (`^[a-z0-9-]+$`).
- **ID Generation**: Added specific task to handle sequential ID scanning (`T-001`).
- **Date Formats**: Distinct handling for ISO (metadata) vs YYYY-MM-DD (decisions).

---

## Work Objectives

### Core Objective
Implement the "canonical source of truth" storage layer for Nexus.

### Concrete Deliverables
- `src/storage/layout.ts` (Paths, Validation, Date helpers)
- `src/storage/ids.ts` (Sequential ID generator)
- `src/storage/project.ts` (Create/Load projects)
- `src/storage/task.ts` (Create/Update tasks)
- `src/storage/decision.ts` (Append decisions)

### Definition of Done
- [ ] `bun test` passes for all storage operations.
- [ ] Directory structure matches Ticket 003 exactly.
- [ ] No path traversal vulnerabilities.
- [ ] Files are human-readable Markdown.

### Must Have
- Markdown templates for `project.md`, `task.md`, etc.
- `meta.json` for machine-readable state.
- Atomic writes where possible.

### Must NOT Have (Guardrails)
- No specialized Markdown libraries (use template strings).
- No business logic or orchestration (storage only).
- No session persistence (explicitly excluded).

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
> ALL verification is executed by the agent using `bun test`.

### Test Decision
- **Infrastructure exists**: YES (`bun test` is set up).
- **Automated tests**: YES (TDD).
- **Framework**: `bun test`.

### If TDD Enabled
Each TODO follows RED-GREEN-REFACTOR:
1. **RED**: Write failing test in `nexus/test/storage/`.
2. **GREEN**: Implement code in `nexus/src/storage/`.
3. **REFACTOR**: Clean up.

### Agent-Executed QA Scenarios

```
Scenario: Create Project and Verify Structure
  Tool: Bash
  Preconditions: Clean state directory
  Steps:
    1. Run test script that calls storage.createProject("demo-proj")
    2. Assert: Directory "nexus_state/projects/demo-proj" exists
    3. Assert: File "project.md" contains "# Project: Demo Proj"
    4. Assert: File "meta.json" is valid JSON
  Expected Result: Project structure created correctly
  Evidence: Terminal output of verification script
```

```
Scenario: Prevent Path Traversal
  Tool: Bash
  Preconditions: None
  Steps:
    1. Run test script calling storage.createProject("../../evil")
    2. Assert: Error thrown "Invalid project ID"
    3. Assert: Directory "../../evil" does NOT exist
  Expected Result: Security validation blocks invalid paths
  Evidence: Test output
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation):
├── Task 1: Layout & Validation Utils
└── Task 2: ID Generator & Utils

Wave 2 (Core Logic):
├── Task 3: Project Storage (depends on 1)
├── Task 4: Task Storage (depends on 1, 2)
└── Task 5: Decision Storage (depends on 1, 2)

Critical Path: Task 1 → Task 3 → Task 4
```

---

## TODOs

- [x] 1. Implement Storage Layout & Validation Utils

  **What to do**:
  - [x] Create `nexus/src/storage/layout.ts`.
  - [x] Define constants for directory structure.
  - [x] Implement `validateProjectId(id)` (regex `^[a-z0-9-]+$`).
  - [x] Implement `getIsoTimestamp()` and `getDateString()`.
  - [x] Create `nexus/test/storage/layout.test.ts` to verify validation.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocked By**: None

  **References**:
  - Ticket 003: "High-level state layout" section.
  - Ticket 003: "Project ID" constraints.

  **Acceptance Criteria**:
  - [x] `validateProjectId` returns true for "my-project", false for "My Project" or "../evil".
  - [x] Date helpers return correct formats.
  - [x] `bun test nexus/test/storage/layout.test.ts` passes.

- [x] 2. Implement Sequential ID Generator

  **What to do**:
  - [x] Create `nexus/src/storage/ids.ts`.
  - [x] Implement `getNextSequenceId(dir, prefix)`:
    - Scans directory for files matching `prefix-XXX` or `XXX-slug`.
    - Returns next formatted ID (e.g., `T-004`).
  - [x] Create `nexus/test/storage/ids.test.ts`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocked By**: None

  **References**:
  - Ticket 003: "Tasks > Directory" (T-001 format).
  - Ticket 003: "Decisions > File naming" (001-slug format).

  **Acceptance Criteria**:
  - [x] correctly identifies max ID from existing files.
  - [x] returns "001" (formatted) if empty.
  - [x] `bun test nexus/test/storage/ids.test.ts` passes.

- [x] 3. Implement Project Storage (Create/Load)

  **What to do**:
  - [x] Create `nexus/src/storage/project.ts`.
  - [x] Implement `createProject(id, data)`:
    - Creates dir, writes `project.md`, `plan.md`, `notes.md`, `meta.json`.
  - [x] Implement `loadProject(id)`: reads files.
  - [x] Create `nexus/test/storage/project.test.ts`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocked By**: Task 1

  **References**:
  - Ticket 003: "Core markdown files" templates.
  - Ticket 003: "meta.json" format.

  **Acceptance Criteria**:
  - [x] Creates all required files.
  - [x] `project.md` contains User's template data.
  - [x] `meta.json` has correct version (1).
  - [x] `bun test nexus/test/storage/project.test.ts` passes.

- [x] 4. Implement Task Storage

  **What to do**:
  - [x] Create `nexus/src/storage/task.ts`.
  - [x] Implement `createTask(projectId, data)`:
    - Uses `ids.ts` to get `T-XXX`.
    - Creates `tasks/T-XXX/task.md`.
  - [x] Implement `updateTaskStatus(projectId, taskId, status)`.
  - [x] Create `nexus/test/storage/task.test.ts`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocked By**: Task 1, Task 2

  **References**:
  - Ticket 003: "Tasks" section.
  - Ticket 003: "task.md" template.

  **Acceptance Criteria**:
  - [x] Creates task directory and file.
  - [x] Updates status in markdown file (regex replace or rewrite).
  - [x] `bun test nexus/test/storage/task.test.ts` passes.

- [x] 5. Implement Decision Storage

  **What to do**:
  - [x] Create `nexus/src/storage/decision.ts`.
  - [x] Implement `appendDecision(projectId, title, content)`:
    - Uses `ids.ts` to get `001`.
    - Writes `decisions/001-slug.md`.
  - [x] Create `nexus/test/storage/decision.test.ts`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocked By**: Task 1, Task 2

  **References**:
  - Ticket 003: "Decisions" section.
  - Ticket 003: "Decision file format".

  **Acceptance Criteria**:
  - [x] Generates correct filename with slug.
  - [x] Writes immutable decision file.
  - [x] `bun test nexus/test/storage/decision.test.ts` passes.

---

## Success Criteria

### Verification Commands
```bash
cd nexus && bun test
```

### Final Checklist
- [ ] `nexus/src/storage` populated.
- [ ] `nexus/test/storage` populated and passing.
- [ ] `meta.json` schema version is 1.
- [ ] All IDs are sequential and formatted.
