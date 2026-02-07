# Ticket 028 - Fixture Projects and Demo Scenarios (Onboarding + Manual QA)

## Title

Fixture Projects and Demo Scenarios (Onboarding + Manual QA)

## Goal

Create a curated set of **fixture projects** and **demo scenarios** that can be used for:

- Developer onboarding (“see Nexus working in 5 minutes”)
- Manual QA and regression checks
- UI demonstrations
- Reproducible bug reports

This ticket complements automated tests (027) with **human-friendly, realistic project states**.

---

## Context

From earlier tickets:

- Storage format is stable and inspectable (003)
- TUI provides dashboards, task inspection, alerts, search, summaries (008–024)
- Governance and decision recording exist (015–016, 020–021)
- Audit log and run history exist (026)

We now need “living examples” that represent real workflows.

---

## Scope

### Included

- Multiple fixture project directories checked into the repo
- A small set of scripted demo flows (CLI scripts or markdown walkthroughs)
- Documentation for how to load and explore fixture projects in the TUI

### Excluded

- Automated E2E against a real server
- Complex data generators
- Performance test fixtures

---

## Fixture project library

Add fixture projects under:

```
fixtures/projects/
  001-minimal-approved/
  002-conflict-escalation/
  003-devils-advocate/
  004-long-running-project/
```

Each fixture project is a **complete `projects/<project-id>/` directory** consistent with ticket 003.

---

## Fixture 001 — Minimal Approved

**Purpose:** “Hello world” for Nexus.

Includes:

- Approved plan
- 3 tasks:
    - 1 completed with a decision
    - 1 pending
    - 1 running
- Small notes file

Expected UI behaviors:

- Dashboard shows healthy status
- Task list is small and navigable
- Summaries show recent activity

---

## Fixture 002 — Conflict Escalation

**Purpose:** Demonstrate governance escalation and blocked task.

Includes:

- One task with two reports (planner success, reviewer partial)
- Task status blocked
- Approval-required alert (if alerts are persisted; if not, include in demo instructions)
- Decision record: “Request revisions”

Expected UI behaviors:

- Blockers & risks summary populated
- Alerts view shows conflict/approval
- Task detail shows mixed report statuses

---

## Fixture 003 — Devil’s Advocate

**Purpose:** Demonstrate adversarial input and its weighting.

Includes:

- Task with roles: implementer + reviewer + devils-advocate
- Devil’s Advocate report contains significant risks
- Governance escalation recorded, decision chosen

Expected UI behaviors:

- Escalation context mentions DA findings
- Decision log shows resolution

---

## Fixture 004 — Long-Running Project

**Purpose:** Stress test UI search/filter and summaries.

Includes:

- 30–60 tasks across all statuses
- 10+ decisions
- Notes with multiple assumptions/clarifications
- Audit log and run history with many entries (can be synthetic)

Expected UI behaviors:

- Search and filter are genuinely useful
- Summaries remain readable
- Task list performance acceptable

---

## Demo scenarios

Add a `fixtures/demos/` folder:

```
fixtures/demos/
  001-walkthrough-minimal.md
  002-walkthrough-conflict.md
  003-walkthrough-devils-advocate.md
  004-walkthrough-long-running.md
```

Each walkthrough must include:

- What the scenario demonstrates
- Which fixture project to copy into `stateDir/projects/`
- Step-by-step TUI navigation instructions
- Expected output sections (dashboard highlights, which task to open, etc.)

---

## Optional: helper script (recommended)

Provide a Bun script to install fixtures into a local `stateDir`:

```
scripts/install-fixtures.ts
```

Usage:

```bash
bun run scripts/install-fixtures.ts --stateDir ./nexus_state --fixture 002-conflict-escalation
```

Behavior:

- Copies fixture project directory into `<stateDir>/projects/`
- Does not overwrite existing projects unless `--force`

---

## Proposed file changes

### New files

```
fixtures/projects/001-minimal-approved/...
fixtures/projects/002-conflict-escalation/...
fixtures/projects/003-devils-advocate/...
fixtures/projects/004-long-running-project/...

fixtures/demos/*.md
scripts/install-fixtures.ts
```

### Updated files

```
README.md
```

Add “Try demo fixtures” section.

---

## Data correctness requirements

- All fixture projects must:
    - Match current schema version
    - Parse cleanly via domain parsers
    - Load without migrations (unless explicitly intended as a migration demo)
- Task IDs, decision numbering, and meta timestamps should be consistent

---

## Testing

Minimal automated validation:

Add a test `test/fixtures/fixtures-validate.test.ts` that:

- Iterates fixture projects
- Loads them via storage + domain parsers
- Asserts no parsing errors

This prevents fixtures from drifting out of date.

---

## Acceptance criteria (Definition of Done)

- [ ] 4 fixture projects exist and load successfully
- [ ] Each fixture has a clear, documented demo walkthrough
- [ ] Optional install script copies fixtures into a chosen stateDir safely
- [ ] README documents how to use fixtures
- [ ] Automated validation test ensures fixtures stay compatible
- [ ] `bun test` passes

---

## Deliverables

- Fixture project library
- Demo walkthrough documentation
- Optional fixture installer script
- Fixture validation test
