# Docs 006 - Session Orchestration

This document describes how Nexus creates, manages, and terminates ChatGPT sessions to execute tasks.

> Reference note: all other docs discussing session policy must link back to `nexus/docs/006-session-orchestration.md#mvp-decisions-resolved` and `nexus/docs/006-session-orchestration.md#glossary` instead of duplicating this content.

Session orchestration is a core responsibility of Nexus and is designed to enable **clean execution boundaries** and **predictable behavior** (MVP execution is sequential).

---

## MVP Decisions (Resolved)

This section is the canonical MVP truth; older sections below may describe future work.

- Sessions are **ChatGPT Web UI threads**, controlled indirectly via **browser extension + local server**; Nexus does **not** call model APIs.
- Implementation scope (for the next plan): include tickets **006 (run transcripts)** + **013 (sequential runner)** + **minimal blessed TUI “run one task”**.
- Exclude (for MVP): parallel execution (ticket 018), SSE parsing in Nexus, streaming UI.
- Execution order is **strictly sequential**; any mention of concurrency must be marked as Future work referencing this section.
- Run capture: **buffered JSON mode** only.
- Temporary chat: default **new temporary chat per run** (`POST /responses/:clientId/new`), opt-in carryover.
- Client routing: `clientId == role name` (planner/implementer/reviewer/researcher/devils-advocate). Requires one connected extension WS client per role.
- Missing client: **fail fast** with diagnostics (missing roles + available clients).
- Runtime UI state: stored in `<stateDir>/config.jsonc` (JSONC). Precedence: `nexus.config.json` overrides state config.
- Tests: yes, tests-after (`bun test`).

## Glossary

> Use direct references to `nexus/docs/006-session-orchestration.md#glossary` when citing these canonical definitions.

- **Session**: A single ChatGPT Web UI conversation thread (what ChatGPT calls a “chat”). In MVP, sessions are controlled indirectly via the browser extension + local server.
- **Thread**: Synonym for **Session** in this MVP doc set (i.e., a ChatGPT Web UI conversation thread).
- **Run**: One execution attempt/capture unit for a task. A run may create a new temporary chat by default, and produces a buffered JSON capture.
- **Role**: The worker persona assigned to a run (e.g., planner/implementer/reviewer/researcher/devils-advocate).
- **clientId**: The routing key used to target a connected extension client. In MVP, `clientId == role name`. NOTE: some docs may call this `responseId`; for MVP they are the same identifier.
- **Temporary chat / Carryover**: **Temporary chat** is the MVP default: start a fresh ChatGPT thread per run. **Carryover** is opt-in: reuse an existing session/thread across runs instead of starting a new temporary chat.

## Sessions as Execution Units

In Nexus, a **session** is a live ChatGPT conversation created to perform a specific task with a specific role.

Sessions are treated as:
- Ephemeral
- Replaceable
- Isolated from each other

They are not sources of long-term memory or authority.

---

## Session Creation

Nexus creates sessions on demand when a task enters execution.

When creating a session, Nexus specifies:
- The assigned role
- The task objective
- Relevant project context
- Constraints or expectations
- Required response structure

Sessions are always created intentionally; there are no background or idle sessions.

---

## Context Injection

Each session receives **selective context**, not the entire project history.

Injected context may include:
- Task description
- Relevant goals
- Excerpts from the current plan
- Relevant notes or prior decisions
- Constraints or assumptions

Nexus controls context size and relevance to:
- Reduce noise
- Avoid accidental bias
- Prevent context bloat

---

## Parallel Execution (Future work)

**Future work:** Nexus may run multiple sessions in parallel (excluded from MVP; see ticket 018).

In MVP, Nexus runs sessions sequentially (one at a time).

If/when implemented, common reasons include:
- Speeding up work
- Comparing perspectives
- Reducing risk on critical tasks

In that mode, parallel sessions:
- Do not share context
- Do not communicate directly
- Are reconciled only through Nexus

This prevents cross-contamination and groupthink.

---

## Monitoring and Control

While sessions are running, Nexus:
- Tracks session status
- Captures final outputs in buffered JSON mode (no streaming UI / SSE parsing in MVP)
- Detects stalls or failures

Nexus may:
- Cancel a session
- Restart a session
- Start a follow-up session (sequential in MVP)
- Narrow or reframe the task

Session control is dynamic and responsive.

---

## Session Termination

Sessions are terminated when:
- The task completes
- The task is canceled
- Nexus shuts down
- The project is paused or ended

Termination is explicit.

No session is kept alive for future reuse.

---

## Restart Behavior

When Nexus restarts:
- All previous sessions are considered terminated
- No session state is restored
- New sessions always start fresh

If needed, Nexus can:
- Re-inject summaries or notes
- Re-issue tasks intentionally

This ensures clean and predictable execution.

---

## Error and Failure Handling

If a session fails or produces unusable output:
- Nexus records the failure
- The session is discarded
- A retry or alternative approach may be triggered

Failures are contained at the session level and do not corrupt project state.

---

## Authority Boundaries

Sessions:
- Execute tasks
- Produce reports
- Offer suggestions

Sessions do **not**:
- Make final decisions
- Modify project state directly
- Override plans or goals

All authority flows through Nexus.

> Reminder: other docs discussing governance authority should cite `nexus/docs/006-session-orchestration.md#authority-boundaries` to preserve a single canonical statement.

---

## Summary

In Nexus:

- Sessions are short-lived workers
- Context is injected intentionally
- Execution is sequential in MVP (parallelism is future work)
- Failures are isolated
- No session persists across restarts

This orchestration model enables scalable AI-assisted work without sacrificing control or clarity.
