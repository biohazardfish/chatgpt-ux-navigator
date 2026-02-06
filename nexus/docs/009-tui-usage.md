# Docs 009 - TUI Usage

This document describes how to interact with Nexus through its terminal user interface (TUI).

The TUI is designed for **control, visibility, and efficiency**, not conversation. In the MVP, it provides a minimal fullscreen (blessed-style) shell with keyboard navigation and a single “run one task” trigger.

**MVP scope note:** This doc follows the canonical MVP decisions in `nexus/docs/006-session-orchestration.md#mvp-decisions-resolved` (and its glossary). Ticket `nexus/docs/tickets/008-tui-shell-and-navigation.md` defines the UI scope. Anything beyond the shell/navigation/“run one task” flow is listed under **Future work**.

### MVP constraints (canonical)

The TUI inherits the MVP guardrails locked in doc 006:

- **Sequential only:** One task runs at a time. The session runner from ticket 013 executes roles sequentially; no parallel dashboards or multi-run batching exist yet.
- **Buffered capture:** The TUI consumes buffered JSON responses written by the Nexus server. Real-time streaming output stays in the ChatGPT web UI + browser extension; the TUI never renders streaming chunks in MVP.
- **No model API calls:** All model interaction happens via the browser extension driving the ChatGPT web UI. The TUI orchestrates that flow and never speaks to provider APIs directly.
- **Single control surface:** There is no parallel command surface or split-brain control. The TUI supplies a single keyboard-driven shell for launching “run one task.”

Whenever you need richer interaction (parallel, multi-task, or true streaming UI), treat it as **Future work** and cite `nexus/docs/006-session-orchestration.md#mvp-decisions-resolved`.

---

## TUI Overview

In the MVP, the Nexus TUI is a lightweight operator shell (not a full control surface).

It provides:
- A stable fullscreen layout (header, main pane, footer)
- Keyboard navigation between high-level **placeholder** views
- Basic status/notification framing (non-streaming)
- A minimal “run one task” execution trigger

The TUI favors clarity and predictability over visual complexity.

---

## Main Views

While the exact layout may evolve, the TUI typically presents:

- **Dashboard** (placeholder)
  - Title + placeholder text

- **Tasks** (placeholder)
  - Title + placeholder text

- **Sessions** (placeholder)
  - Title + placeholder text

- **Decisions** (placeholder)
  - Title + placeholder text
  - (Approval dialogs and decision checkpoints are **Future work**)

- **Logs** (placeholder)
  - Title + placeholder text

---

## Navigation

Navigation is keyboard-driven.

In the MVP, navigation is limited to global keys and switching between **placeholder** views (for example using number keys).

More granular interactions (selecting tasks, expanding details, inline actions, etc.) are **Future work**.

The TUI is designed to be usable without a mouse.

---

## Running one task (MVP)

The MVP includes a single “run one task” trigger.

The exact interaction details may vary, but the intent is:
- The operator initiates one task run
- The TUI reflects basic run state in the status area

Any richer workflows (multiple tasks, arbitrary commands, etc.) are **Future work**.

---

## Monitoring progress (MVP)

In the MVP, the TUI provides basic visibility only:
- Current active view
- Simple status messages
- Placeholder areas for notifications

Real-time streaming output and rich live logs inside the TUI are **Future work** and belong to the ChatGPT web UI + extension until the streaming UI ticket lands.

---

## Error and alert handling (MVP)

In the MVP, errors should be surfaced as clearly as possible within the minimal shell (for example via the footer/status line).

Acknowledgment dialogs and richer alert workflows are **Future work**.

---

## Non-Goals of the TUI (MVP)

The MVP TUI is not intended to:
- Be a chat interface
- Replace the ChatGPT UI
- Provide approval dialogs or manual override controls
- Provide real-time streaming output/UI (the browser extension handles the live stream experience for now)
- Provide a parallel control surface

Its purpose in MVP is to supply a minimal, keyboard-driven operator shell that future features can build on.

---

## Future work

The following capabilities are explicitly **out of scope for MVP** (see ticket 008 + canonical MVP decisions in doc 006), but may be added later:

- Approval dialogs and decision checkpoints that pause execution
- Rich commands/actions (pause/resume/cancel, etc.)
- Manual overrides of Nexus decisions
- Spawning/assigning additional roles from the TUI
- Real-time streaming output and interactive log viewers (see doc 006 Future work)
- Parallel execution control surfaces

---

## Summary

For MVP, the Nexus TUI:
- Renders a minimal fullscreen shell (header/content/footer)
- Supports keyboard navigation between placeholder views
- Provides a single “run one task” execution trigger

Advanced control, approvals, overrides, streaming UI, and parallel control are **Future work**.
