# Docs 002 - Core Concepts

This document defines the core concepts used throughout Nexus.  
These terms form the shared vocabulary between the user, Nexus, and the AI sessions it orchestrates.

Understanding these concepts is essential to using Nexus effectively.

---

## Project

A **Project** is the top-level unit of work in Nexus.

A project represents a single, long-running objective, such as:

- Designing a SaaS application
- Planning a system architecture
- Breaking down a product into implementation tickets

Each project has:

- One or more goals
- A current plan
- A collection of tasks
- Persistent notes and decisions

Project state is **persistent across Nexus restarts**.

---

## Goal

A **Goal** describes _what the project is trying to achieve_.

Goals are:

- High-level
- Outcome-oriented
- Relatively stable over time

Examples:

- “Design a scalable authentication system”
- “Produce a complete backlog for MVP launch”

Goals guide planning and decision-making but are not directly executable.

---

## Plan

A **Plan** is Nexus’s current strategy for achieving the project’s goals.

A plan:

- Breaks goals into phases or major steps
- Evolves over time as new information appears
- Can be revised, but only with user awareness and approval

Plans are **explicit and inspectable**, not implicit reasoning hidden inside AI sessions.

---

## Task

A **Task** is a large, human-sized unit of work delegated to AI sessions.

Tasks are:

- Non-trivial (not micro-steps)
- Goal-oriented
- Often iterative

Examples:

- “Design authentication architecture”
- “Generate Jira tickets for billing system”
- “Review implementation proposal and identify risks”

Each task:

- Has a purpose
- Is assigned one or more roles
- Produces a structured report

---

## Role

A **Role** defines _how_ an AI session should approach a task.

Roles shape:

- Perspective
- Level of skepticism
- Output expectations

Common roles include:

- **Planner** — decomposes problems and proposes strategies
- **Implementer** — produces concrete artifacts (code, specs, tickets)
- **Reviewer** — evaluates correctness, risks, and trade-offs
- **Researcher** — gathers external or background knowledge

Roles are explicit and intentional.  
Nexus relies on role separation to reduce blind spots.

---

## Session

A **Session** is a live ChatGPT conversation controlled by Nexus.

Sessions:

- Are created on demand
- Are assigned a role and task context
- Can run in parallel with other sessions
- Are ephemeral and do **not** persist across Nexus restarts

Sessions are treated as **stateless workers**, not long-term memory holders.

---

## Report

A **Report** is the structured output returned by a session after completing a task.

A report typically includes:

- A status (success, partial, blocked)
- A summary of results
- Produced artifacts or references
- Notes, assumptions, or concerns
- Suggested next steps

Reports are how Nexus reasons about progress and decides what to do next.

---

## Decision

A **Decision** is an explicit choice recorded by Nexus that affects project direction.

Decisions may involve:

- Architecture choices
- Trade-offs
- Conflict resolutions
- Scope changes

Major decisions require **user approval** and are stored as part of the project’s persistent state.

---

## Governance

**Governance** is Nexus’s responsibility to:

- Reconcile conflicting information
- Enforce project goals and constraints
- Decide when to proceed, retry, or escalate
- Determine when human input is required

Governance is what distinguishes Nexus from a collection of independent agents.

---

## User (Operator)

The **User** is the final authority.

The user:

- Sets goals
- Approves plans and major changes
- Resolves high-impact decisions when needed
- Can intervene at any time

Nexus is designed to amplify the user’s judgment, not replace it.

---

## Summary

At a high level:

- **Projects** contain goals and state
- **Plans** describe how goals are pursued
- **Tasks** are delegated units of work
- **Roles** define perspective and behavior
- **Sessions** execute tasks
- **Reports** feed results back to Nexus
- **Decisions** guide long-term direction

These concepts are referenced throughout the rest of the documentation.
