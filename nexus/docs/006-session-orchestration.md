# Docs 006 - Session Orchestration

This document describes how Nexus creates, manages, and terminates ChatGPT sessions to execute tasks.

Session orchestration is a core responsibility of Nexus and is designed to enable **parallel work**, **clean execution boundaries**, and **predictable behavior**.

---

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

## Parallel Execution

Nexus may run multiple sessions in parallel.

Common reasons include:
- Speeding up work
- Comparing perspectives
- Reducing risk on critical tasks

Parallel sessions:
- Do not share context
- Do not communicate directly
- Are reconciled only through Nexus

This prevents cross-contamination and groupthink.

---

## Monitoring and Control

While sessions are running, Nexus:
- Tracks session status
- Streams partial outputs if available
- Detects stalls or failures

Nexus may:
- Cancel a session
- Restart a session
- Spawn additional sessions
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

---

## Summary

In Nexus:

- Sessions are short-lived workers
- Context is injected intentionally
- Parallelism is controlled
- Failures are isolated
- No session persists across restarts

This orchestration model enables scalable AI-assisted work without sacrificing control or clarity.
