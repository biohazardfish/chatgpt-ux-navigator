# Docs 009 - TUI Usage

This document describes how to interact with Nexus through its terminal user interface (TUI).

The TUI is designed for **control, visibility, and efficiency**, not conversation. It allows the user to monitor progress, approve decisions, and intervene when necessary.

---

## TUI Overview

The Nexus TUI is the primary interface for the user.

It provides:
- A live view of project state
- Visibility into active tasks and sessions
- Clear prompts for approvals and decisions
- Commands for intervention and control

The TUI favors clarity and predictability over visual complexity.

---

## Main Views

While the exact layout may evolve, the TUI typically presents:

- **Project Summary**
  - Current goals
  - Active plan
  - Overall status

- **Task List**
  - Pending tasks
  - Running tasks
  - Completed tasks

- **Session Status**
  - Active sessions
  - Assigned roles
  - Execution state

- **Notifications**
  - Approval requests
  - Conflicts
  - Errors

---

## Navigation

Navigation is keyboard-driven.

Common navigation actions include:
- Switching between views
- Selecting tasks or sessions
- Expanding details
- Returning to the main summary

The TUI is designed to be usable without a mouse.

---

## Approvals and Decisions

When Nexus reaches an approval checkpoint:
- Execution pauses
- The TUI highlights the decision request
- Relevant context is displayed

The user can:
- Approve the proposal
- Request changes
- Defer the decision
- Abort the action

All approvals are explicit and intentional.

---

## Commands and Actions

The TUI supports direct commands to control execution.

Typical actions include:
- Pause or resume the project
- Cancel a task
- Spawn additional roles
- Add notes or constraints
- Force re-evaluation

Commands are scoped to prevent accidental destructive actions.

---

## Monitoring Progress

The TUI provides continuous feedback:
- Task status updates
- Session lifecycle changes
- Report summaries
- Governance decisions

This allows the user to stay informed without micromanaging.

---

## Error and Alert Handling

Errors and alerts are surfaced clearly in the TUI.

Examples include:
- Session failures
- Conflicting reports
- Blocked tasks

Alerts require acknowledgment to ensure visibility.

---

## Manual Overrides

The user may override Nexus decisions through the TUI.

Overrides:
- Take effect immediately
- Are recorded in project state
- Influence future governance behavior

Overrides do not require justification, but Nexus may ask for context.

---

## Non-Goals of the TUI

The TUI is not intended to:
- Be a chat interface
- Replace the ChatGPT UI
- Provide rich visualization

Its purpose is operational control.

---

## Summary

The Nexus TUI:
- Keeps the user informed
- Makes approvals explicit
- Enables fast intervention
- Preserves operator authority

It is the control surface for all Nexus-driven work.
