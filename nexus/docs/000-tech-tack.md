# Docs 000 — Tech Stack & Platform Constraints

This document defines the **authoritative technology choices** for Nexus.
All implementation tickets must conform to these constraints unless explicitly revised by decision.

---

## Runtime

- **Bun**
    - Language: TypeScript
    - Execution: Bun-native (no transpilation step required)
    - Testing: `bun test`

Node.js compatibility is not a goal.

---

## Terminal UI

- **blessed**
    - Used for all TUI rendering and input handling
    - Keyboard-first interaction model
    - No separate GUI / web UI for Nexus

All TUI tickets assume blessed primitives and lifecycle.

---

## Model Interaction Layer

- Nexus does **not** call model/provider APIs.
- Sessions are **ChatGPT Web UI threads**, orchestrated via the browser extension + local server.
- MVP uses **buffered JSON mode only** (no Nexus-side SSE parsing, and no streaming UI requirements in Nexus).

---

## Non-Goals

- No standalone browser-based UI (beyond the existing ChatGPT Web UI + extension)
- No cloud dependency for Nexus itself
- No model/provider integrations in Nexus (no provider-specific logic)

---

## Change Policy

Any change to the tech stack requires:

- An explicit **Decision record**
- A migration or refactor plan if existing tickets are affected
