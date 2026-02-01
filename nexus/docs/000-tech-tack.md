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

- **opentui**
    - Used for all TUI rendering and input handling
    - Keyboard-first interaction model
    - No GUI / web UI fallback

All TUI tickets assume opentui primitives and lifecycle.

---

## Model Interaction Layer

- **Vercel AI SDK**
    - Used to interface with language models
    - Provides a unified abstraction across providers
    - Standardizes:
        - request/response handling
        - streaming
        - function / tool calls (when supported)

Nexus **does not** talk to models directly.
All model interaction is mediated through the Vercel AI SDK.

---

## Model Providers

- Provider-agnostic by design
- Provider choice is a runtime configuration concern
- Nexus orchestration logic must not depend on provider-specific behavior

---

## Non-Goals

- No browser-based UI
- No cloud dependency for Nexus itself
- No provider-specific branching in orchestration logic

---

## Change Policy

Any change to the tech stack requires:

- An explicit **Decision record**
- A migration or refactor plan if existing tickets are affected
