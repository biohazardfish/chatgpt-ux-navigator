# Docs 004 - Project Lifecycle

This document describes how a project progresses in Nexus, from initial creation to completion and later resumption.

The lifecycle emphasizes **explicit state**, **user approval**, and **controlled iteration**.

---

## 1. Project Creation

A project begins when the user creates a new project in Nexus.

At creation time:

- The project is given a name or identifier
- Initial goals are defined by the user
- Optional initial notes or constraints may be recorded

No AI sessions are started automatically at this stage.

The project state is immediately persisted.

---

## 2. Initial Planning

Once goals are defined, Nexus proposes an initial plan.

This may involve:

- One or more planning tasks
- Parallel planner sessions
- Exploration of alternative approaches

The result is a **proposed plan**, not an executed one.

The user must:

- Review the plan
- Approve it
- Or request revisions

No execution begins without plan approval.

---

## 3. Task Execution

After the plan is approved, Nexus begins task execution.

During this phase:

- Tasks are created according to the plan
- Each task is assigned one or more roles
- Sessions are spawned as needed
- Tasks may run in parallel

Nexus continuously:

- Monitors session progress
- Collects structured reports
- Updates project notes

---

## 4. Evaluation and Governance

As reports are received, Nexus evaluates them.

This includes:

- Checking alignment with goals
- Detecting contradictions
- Assessing confidence and completeness
- Comparing multiple perspectives when available

Possible outcomes:

- Task accepted
- Task partially accepted with follow-up tasks
- Task rejected and retried
- Conflict detected

Minor issues may be resolved automatically.  
Major issues trigger user involvement.

---

## 5. Decision Checkpoints

Certain events require explicit user approval:

- Plan changes
- Scope expansion or reduction
- Architectural decisions
- Project completion

At these checkpoints:

- Nexus pauses execution
- Presents context and options
- Recommends a path forward

Execution resumes only after user confirmation.

---

## 6. Iteration and Replanning

Projects are expected to evolve.

Nexus may:

- Revise the plan
- Introduce new tasks
- Retire obsolete tasks
- Adjust priorities

All significant replanning is:

- Explicit
- Recorded
- Visible to the user

This allows the project to adapt without losing intent.

---

## 7. Project Pause and Restart

A project can be paused at any time.

On pause or Nexus shutdown:

- Project state is saved
- Active sessions are terminated

On restart:

- Nexus reloads the project state
- No ChatGPT sessions are resumed automatically
- New sessions may be created with fresh context

This ensures clean execution boundaries.

---

## 8. Project Completion

A project is considered complete when:

- Goals are satisfied or explicitly closed
- Outstanding tasks are resolved or dismissed
- Final decisions are recorded

Nexus presents a completion summary to the user.

The project remains available for review or extension in the future.

---

## Summary

In short, a Nexus project:

1. Is created with explicit goals
2. Proceeds through approved planning
3. Executes tasks in controlled parallelism
4. Uses governance to evaluate results
5. Involves the user at major decision points
6. Persists state independently of sessions
7. Can be paused, resumed, or extended safely

This lifecycle is designed to support long-running, complex work without losing control or context.
