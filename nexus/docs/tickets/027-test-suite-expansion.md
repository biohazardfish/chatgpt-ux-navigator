# Ticket 027 - Test Suite Expansion (Coverage, Fixtures, Regression Guardrails)

## Title

Test Suite Expansion (Coverage, Fixtures, Regression Guardrails)

## Goal

Expand and standardize the Nexus test suite to improve reliability and prevent regressions as the system grows. This ticket establishes:

- A consistent testing structure
- Better coverage of critical subsystems (storage, parsing, orchestration, governance, TUI state)
- Reusable fixtures and helpers
- A baseline “regression safety net” for future optimization work

---

## Context

By this stage, Nexus includes:

- Config + paths + safety (002)
- Storage format and helpers (003)
- Domain parsing (004)
- Server client + run capture (005–006)
- Report parser (007)
- Orchestration runners + context injection (012–014, 018–019)
- Governance + conflicts + decisions (015–021)
- TUI views + alerts + search + summaries (008–024)
- Audit log + run history (026)

We need broader automated coverage beyond the E2E smoke test (017).

---

## Scope

### Included
- Increase test coverage across modules
- Establish fixture conventions and helpers
- Add negative-path tests for safety and correctness
- Add CI-friendly test command structure (still `bun test`)

### Excluded
- Code coverage tooling integration (optional; only if lightweight)
- Full terminal UI snapshot testing
- Performance benchmarks (separate ticket)

---

## Test organization standard

Restructure or standardize tests under:

```
test/
  fixtures/
    projects/
    reports/
  helpers/
    tempFs.ts
    projectFactory.ts
    mockServer.ts
  unit/
    config/
    paths/
    storage/
    domain/
    report/
    orchestration/
    governance/
    tui/
  e2e/
    mvp-flow.test.ts
```

Notes:
- If existing tests are flat, reorganize them without changing semantics.

---

## Required coverage areas (MVP targets)

### A. Config & paths
- Env overrides
- Config file precedence
- Path traversal rejection
- Directory creation

### B. Storage
- Project create/load
- Task create/update (status transitions)
- Decision recorder immutability + numbering
- Migrations runner behavior (025)
- Audit log append-only (026)
- Run history index append-only (026)

### C. Domain parsing
- Valid markdown parses correctly
- Missing sections fail with actionable errors
- Unknown sections tolerated (if supported)

### D. Report parsing
- Strict convention enforcement
- Helpful error types
- Edge cases: whitespace, empty sections, multiline summary

### E. Orchestration
- Task assignment readiness rules
- Session runner prompt composition integration
- Parallel runner concurrency limit enforcement (018)
- Retry classification (019)

### F. Governance
- Outcome rules (015)
- Conflict heuristics (020)
- Devil’s Advocate weighting (021)

### G. TUI state logic (headless)
- Navigation state transitions
- Alerts store behavior
- Search/filter selectors
- Summary builders (024)

---

## Fixtures

### Report fixtures
Create canonical fixtures:
- `planner-success.txt`
- `reviewer-success.txt`
- `reviewer-partial.txt`
- `devils-advocate-partial.txt`
- `blocked.txt`
- `invalid-missing-section.txt`

### Project fixtures
Provide minimal persisted project directories in fixtures, e.g.:

```
test/fixtures/projects/basic-approved/
  meta.json
  project.md
  plan.md
  notes.md
  tasks/...
  decisions/...
```

These fixtures should be copied into temp dirs for tests (never mutate fixture originals).

---

## Helpers

### Temp filesystem helper
`test/helpers/tempFs.ts`:
- Create temp dir
- Copy fixture dirs
- Cleanup

### Project factory
`test/helpers/projectFactory.ts`:
- Build in-memory `Project` objects for unit tests without filesystem

### Mock server / run executor
`test/helpers/mockServer.ts`:
- Mock `ServerClient` or `executeSessionRun` with deterministic outputs and delays

---

## Regression tests (required additions)

1. **Path traversal regression**  
   Confirm every storage write path uses `resolveInsideRoot` (via unit tests on helpers).

2. **Decision immutability regression**  
   Attempt to overwrite existing decision file → must fail.

3. **Retry non-retryable regression**  
   `HTTP 400` or `cancelled` must not retry.

4. **Concurrency regression**  
   Global semaphore max concurrent runs is never exceeded.

5. **Conflict detection regression**  
   Contradictory artifacts trigger escalation.

---

## Test quality standards

- Tests must not depend on:
  - Running local server
  - Terminal dimensions
  - Network
- Tests must be deterministic:
  - Avoid real timers; use fake timers or controlled delays where possible
- Prefer small unit tests; reserve E2E for integration flow (017)

---

## Implementation steps

1. Create folder structure under `test/`
2. Move existing tests into appropriate categories
3. Add fixture files (reports, projects)
4. Add helpers (tempFs, projectFactory, mockServer)
5. Implement missing tests for required coverage
6. Ensure `bun test` runs everything and passes

---

## Acceptance criteria (Definition of Done)

- [ ] Test suite is organized into a clear structure
- [ ] Fixtures exist for reports and projects
- [ ] Helpers exist for temp filesystem and mocks
- [ ] All listed coverage areas have meaningful tests
- [ ] Regression tests for safety and correctness exist
- [ ] `bun test` runs reliably and passes

---

## Deliverables

- Expanded and organized test suite
- Fixture library (reports + projects)
- Test helper utilities
- Regression coverage for critical subsystems
