# Docs 011 - State and Persistence

This document describes what information Nexus persists, what it does not persist, and how state is managed across restarts.

Clear and intentional persistence is essential for trust, predictability, and long-running projects.

---

## Persistent State

Nexus maintains a **persistent project state** that survives restarts.

Persistent state includes:

- Project identity
- Goals
- Current and past plans
- Tasks and task history
- Notes and assumptions
- Decisions and approvals
- Conflict resolutions

This state represents the _intent and reasoning_ behind the project.

---

## Per-Project Persistence

Persistence is scoped **per project**.

Each project has its own:

- State
- History
- Notes
- Decisions

Projects are isolated from one another.

---

## Ephemeral State

Certain data is intentionally **not persisted**.

Ephemeral state includes:

- ChatGPT conversations
- Session context
- In-progress responses
- Live execution metadata

All sessions are treated as disposable workers.

When Nexus stops, all sessions are terminated.

---

## Restart Behavior

On restart:

- Nexus reloads project state
- No ChatGPT sessions are resumed
- Execution does not continue automatically

If work needs to resume:

- Nexus creates new sessions
- Relevant context is re-injected intentionally
- Tasks are re-issued explicitly

This avoids unintended continuation from stale context.

---

## Notes as Memory

Nexus uses **notes** as its long-term memory.

Notes may include:

- Clarified assumptions
- Important constraints
- Architectural rationale
- Lessons learned

Notes are curated and explicit, not raw transcripts.

---

## Decisions as Anchors

Decisions are first-class persisted entities.

They:

- Capture trade-offs
- Explain why a path was chosen
- Prevent repeated debates
- Guide future tasks

Decisions are immutable records.

---

## Session Rehydration Strategy

When restarting work:

- Nexus summarizes relevant history
- Only essential context is injected into new sessions
- Full past conversations are never replayed

This keeps sessions focused and avoids bias.

---

## Data Integrity and Safety

Persistence is designed to be:

- Local-first
- Inspectable
- Predictable

Nexus does not rely on:

- Hidden memory
- Implicit context
- External storage services

The user can inspect and back up project state independently.

---

## Intentional Forgetting

Forgetting is a feature, not a bug.

By discarding:

- Session history
- Execution noise

Nexus ensures:

- Cleaner reasoning
- Better reproducibility
- Reduced context drift

Only information explicitly promoted to project state survives.

---

## Summary

In Nexus:

- Intent persists
- Execution does not
- Notes and decisions carry memory
- Sessions are always fresh

This separation enables long-running projects without accumulating hidden or unreliable context.
