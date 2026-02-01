# Docs 005 - Tasks and Roles

This document explains how work is structured and delegated in Nexus using **tasks** and **roles**.

Together, tasks and roles define *what* work is done and *how* AI sessions are expected to approach that work.

---

## Tasks

A **Task** is the primary unit of work in Nexus.

Tasks are intentionally **large and meaningful**, comparable to work a human might assign to another human.

### Characteristics of a Task

A task:
- Has a clear objective
- Contributes directly to a project goal
- Is non-trivial and often iterative
- Produces a structured report
- May spawn follow-up tasks

Tasks are not micro-steps.  
Nexus avoids delegating fine-grained actions that are better handled inside a single session.

---

### Task Lifecycle

A typical task progresses through the following stages:

1. **Created**  
   The task is defined based on the current plan.

2. **Assigned**  
   One or more roles are attached to the task.

3. **Executed**  
   Sessions are spawned to perform the task.

4. **Reported**  
   Sessions return structured reports.

5. **Evaluated**  
   Nexus evaluates the reports.

6. **Resolved**  
   The task is accepted, revised, or retried.

---

### Task Scope

Examples of appropriate task scope:
- “Design authentication and authorization architecture”
- “Generate backlog tickets for billing system”
- “Review proposed database schema for risks”

Examples of inappropriate task scope:
- “Write a single function”
- “Fix a typo”
- “Rename a variable”

Keeping tasks large helps preserve context and reduce coordination overhead.

---

## Roles

A **Role** defines the *perspective and behavior* an AI session should adopt when executing a task.

Roles are explicit and intentional.

---

### Purpose of Roles

Roles exist to:
- Separate concerns
- Reduce blind spots
- Encourage critical thinking
- Make conflicts visible

Rather than asking one session to “do everything,” Nexus assigns different roles to different sessions.

---

### Common Roles

Some commonly used roles include:

- **Planner**  
  Breaks down goals, proposes strategies, and outlines approaches.

- **Implementer**  
  Produces concrete artifacts such as code, specifications, or tickets.

- **Reviewer**  
  Evaluates work for correctness, risks, and trade-offs.

- **Researcher**  
  Gathers background information or explores alternatives.

- **Devil’s Advocate**  
  Actively challenges assumptions and decisions.

Roles can be reused across tasks and combined as needed.

---

### Role Expectations

Each role implies expectations around:
- Tone
- Depth
- Risk tolerance
- Output structure

For example:
- Implementers are expected to be constructive and concrete
- Reviewers are expected to be skeptical and thorough

Nexus may reject or downgrade reports that do not match the assigned role.

---

## Tasks with Multiple Roles

A single task may involve multiple roles.

Common patterns include:
- Planner → Implementer → Reviewer
- Multiple reviewers in parallel
- Implementer + Devil’s Advocate

Nexus compares reports across roles to:
- Detect conflicts
- Measure confidence
- Decide next steps

---

## Role Assignment Strategy

Role assignment is influenced by:
- Task criticality
- Uncertainty level
- Impact of failure

High-impact tasks are more likely to:
- Use multiple roles
- Require user approval before acceptance

Low-risk tasks may use a single role.

---

## User Involvement

The user may:
- Suggest roles
- Override role assignments
- Request additional perspectives

However, Nexus remains responsible for governance and final task resolution.

---

## Summary

In Nexus:

- Tasks define *what* needs to be done
- Roles define *how* it should be done
- Sessions execute tasks according to roles
- Reports feed results back into governance

This separation enables parallelism, reduces bias, and supports informed decision-making.
