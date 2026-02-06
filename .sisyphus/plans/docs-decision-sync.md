# Docs Decision Sync Plan (Update Nexus docs with resolved open-question decisions)

## TL;DR

> **Quick Summary**: Update Nexus documentation to reflect the decisions made during planning for session orchestration + run capture + basic session runner + minimal TUI, and remove/mark contradictions (streaming UI, SSE parsing, parallel execution, model API usage).
>
> **Deliverables**:
> - Updated docs with a single canonical “MVP Decisions / Constraints” section
> - Consistent terminology (session/run/thread/clientId/role)
> - Repo-wide doc contradiction scan checks (agent-executable)
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Canonical decisions section → update target docs → contradiction scans

---

## Context

### Source Decisions (to encode)
- Sessions are **ChatGPT Web UI threads**, controlled indirectly via **browser extension + local server**; Nexus does **not** call model APIs.
- Implementation scope (for the next plan): include tickets **006 (run transcripts)** + **013 (sequential runner)** + **minimal blessed TUI “run one task”**.
- Exclude (for MVP): parallel execution (ticket 018), SSE parsing in Nexus, streaming UI.
- Run capture: **buffered JSON mode** only.
- Temporary chat: default **new temporary chat per run** (`POST /responses/:clientId/new`), opt-in carryover.
- Client routing: `clientId == role name` (planner/implementer/reviewer/researcher/devils-advocate). Requires one connected extension WS client per role.
- Missing client: **fail fast** with diagnostics (missing roles + available clients).
- Runtime UI state: stored in `<stateDir>/config.jsonc` (JSONC). Precedence: `nexus.config.json` overrides state config.
- Tests: yes, tests-after (`bun test`).

### Target docs (primary)
- `nexus/docs/006-session-orchestration.md`
- `nexus/docs/tickets/006-response-streaming-and-capture.md`
- `nexus/docs/tickets/013-session-runner-basic.md`
- `nexus/docs/tickets/008-tui-shell-and-navigation.md`

### Additional docs to scan/update if contradictory
- `nexus/docs/009-tui-usage.md`
- `nexus/README.md` (if it describes capabilities/config)

---

## Work Objectives

### Core Objective
Make documentation consistent and execution-ready by recording resolved decisions and removing/marking mismatched claims.

### Definition of Done
- [ ] Each primary doc contains accurate MVP constraints (or references a single canonical section)
- [ ] Contradiction scans pass (no unqualified claims about SSE parsing / streaming UI / parallel execution / model API usage)
- [ ] Terminology is consistent across docs (glossary present)

### Guardrails (to prevent scope creep)
- Do not expand into implementing features; this plan is doc-only.
- Do not “solve” architectural gaps beyond documenting chosen constraints.
- Any mention of streaming/parallelism must be either removed or labeled explicitly as **Future work**.

---

## Verification Strategy (MANDATORY — agent-executable)

> No manual reading required to “prove” completion. Verification is via deterministic repo searches.

### Contradiction Scans (commands to run)
Executor should run these scans and ensure any matches are either removed or clearly marked Future work / Out of scope.

```bash
# From repo root

# Streaming/SSE/UI claims
rg -n "\bSSE\b|server-sent|token[- ]by[- ]token|live (output|stream)|streaming UI|parse SSE" nexus/docs

# Parallelism claims
rg -n "parallel session|concurrent runs|multi-task concurrency" nexus/docs

# Model API claims
rg -n "OpenAI API|model API|provider API|calls the model" nexus/docs

# Endpoint semantics
rg -n "/responses/.*(/new)?|GET /clients" nexus/docs

# clientId/role routing
rg -n "clientId|responseId|role name" nexus/docs

# state config precedence
rg -n "config\.jsonc|nexus\.config\.json|stateDir" nexus/docs
```

Acceptance for scans:
- Matches are acceptable only if they:
  - Align with the decisions above, OR
  - Are explicitly labeled as “Future work” and don’t imply current MVP behavior.

---

## Execution Strategy

Wave 1 (Canonicalize decisions & terminology):
- Task 1: Choose canonical “MVP Decisions / Constraints” section location
- Task 2: Add glossary (single source) and reference it

Wave 2 (Apply updates + verify):
- Task 3: Update each primary doc to reference canonical decisions and align scope
- Task 4: Update secondary docs if they contradict (README, TUI usage)
- Task 5: Run contradiction scans; fix remaining mismatches

---

## TODOs

### 1) Create canonical “MVP Decisions / Constraints” section

**What to do**:
- Pick one doc as the single source of truth. Recommended location:
  - `nexus/docs/006-session-orchestration.md` (because it’s the overarching orchestration semantics doc)
- Add a new section:
  - `## MVP Decisions (Resolved)`
  - `## Glossary` (or link to a shared glossary section)

**Must include** (verbatim decisions):
- No model APIs; ChatGPT Web UI threads via extension + local server
- Buffered-only run capture in Nexus (no SSE parsing)
- Default temporary chat per run; carryover is opt-in
- `clientId == role name` and implications + failure diagnostics
- Scope includes 006+013+minimal TUI; excludes 018, streaming UI
- State config file and precedence

**Recommended Agent Profile**:
- Category: `writing`

**Parallelization**:
- Can Run In Parallel: YES (Wave 1)

**References**:
- `nexus/docs/006-session-orchestration.md`
- `server/src/http/routes/responses.ts` (for `/new` semantics)
- `server/src/http/routes/clients.ts` (GET `/clients`)

**Acceptance Criteria**:
- [ ] Canonical section exists in one doc
- [ ] Other docs can reference it instead of duplicating

---

### 2) Add/standardize glossary terminology

**What to do**:
- In the canonical doc (or a single glossary doc), define:
  - Session vs Run vs Thread
  - Role
  - clientId
  - Temporary chat
  - Carryover

**Must NOT do**:
- Do not redefine terms inconsistently across documents.

**Recommended Agent Profile**:
- Category: `writing`

**Parallelization**:
- Can Run In Parallel: YES (Wave 1)

**Acceptance Criteria**:
- [ ] Glossary exists and is referenced by at least the 4 primary docs

---

### 3) Update primary docs to match canonical decisions

**What to do**:
- `nexus/docs/006-session-orchestration.md`
  - Add canonical decisions + glossary
  - Explicitly state authority boundaries and “no parallel communication” (already present)

- `nexus/docs/tickets/006-response-streaming-and-capture.md`
  - Add explicit callout:
    - MVP is buffered JSON capture only
    - “Optional streaming responses” remains Future work for Nexus-side parsing
  - Clarify `responseId` vs server `clientId` as chosen:
    - In MVP, `responseId` is the `clientId` (role name)

- `nexus/docs/tickets/013-session-runner-basic.md`
  - Add “Client preflight required” (role clients must be connected)
  - Clarify default `/new` behavior and carryover opt-in
  - Clarify failure behavior: stop on first failure; mark blocked

- `nexus/docs/tickets/008-tui-shell-and-navigation.md`
  - Add MVP extension:
    - Minimal TUI includes “run one task” flow for this milestone
  - Add explicit non-goals:
    - no streaming UI, no parallel control surface

**Recommended Agent Profile**:
- Category: `writing`

**Parallelization**:
- Can Run In Parallel: YES (Wave 2)

**Acceptance Criteria**:
- [ ] Each doc either includes or links to canonical decisions section
- [ ] No doc implies SSE parsing or streaming UI is part of MVP

---

### 4) Update secondary docs if they contradict

**What to do**:
- Scan and update (only if needed):
  - `nexus/docs/009-tui-usage.md`
  - `nexus/README.md`
- Ensure they:
  - Do not claim model API usage
  - Do not imply live streaming UI
  - Do not imply parallel session execution in MVP

**Recommended Agent Profile**:
- Category: `writing`

**Parallelization**:
- Can Run In Parallel: YES (Wave 2)

**Acceptance Criteria**:
- [ ] Contradiction scans (below) show no mismatched MVP claims

---

### 5) Run contradiction scans and fix remaining mismatches

**What to do**:
- Run the Verification commands listed above.
- For each match:
  - Either align wording to the chosen decisions, or
  - Mark explicitly as “Future work” and reference the canonical decision section.

**Recommended Agent Profile**:
- Category: `writing`

**Parallelization**:
- Can Run In Parallel: NO (final pass)

**Acceptance Criteria**:
- [ ] All scans are reviewed and mismatches resolved

---

## Handoff

1) Execute this docs plan first.
2) Then execute the implementation plan: `.sisyphus/plans/006-session-orchestration.md`.

## Cleanup

Executor should delete the draft after the plan is complete:
- Remove: `.sisyphus/drafts/docs-decisions-sync.md`
