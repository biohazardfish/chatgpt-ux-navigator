# AGENTS.md

This document defines **agent behavior contracts**, **message delivery rules**, and **judge constraints** for Nexus.

All implementations **must follow these rules exactly** unless a new major version explicitly changes them.

---

## Architecture

Nexus does **not** call OpenAI directly. Instead, it sends prompts to the **local `@repo/server`** via `POST /responses/:clientId`, where each `clientId` maps to a Chrome extension instance connected to a ChatGPT browser tab via WebSocket. The server forwards the prompt to the extension, which injects it into ChatGPT, intercepts the SSE response stream, and relays it back through the server as an OpenAI-compatible SSE or JSON response.

```
Orchestrator  --POST /responses/:clientId-->  @repo/server  --WebSocket-->  Extension (ChatGPT tab)
                                                                                   |
                                                                           Injects prompt, submits
                                                                                   |
Orchestrator  <--SSE stream--  @repo/server  <--WebSocket--  Extension  <--ChatGPT SSE stream
```

For agents: `POST /responses/:clientId` sends into the current chat.
For judge: `POST /responses/:clientId/new` starts a new temporary chat for each evaluation.

---

## Terminology

- **Agent**: a ChatGPT browser session (identified by a `client_id`) with a system persona that produces messages via the `@repo/server` and Chrome extension.
- **Judge**: a dedicated ChatGPT browser session that evaluates the conversation but never participates in it. Uses `POST /responses/:clientId/new` to start fresh chats for each evaluation.
- **Turn**: one agent producing exactly one message.
- **Inbox**: the list of messages an agent receives when it is their turn to speak.
- **Transcript**: the ordered, global list of all agent messages.
- **Pending messages**: messages waiting in an agent's inbox.
- **Client**: a Chrome extension instance connected to the `@repo/server` via WebSocket, running in a ChatGPT browser tab.
- **Server**: the local `@repo/server` that bridges the orchestrator and browser extension clients via `POST /responses/:clientId`.

---

## Agent Lifecycle

1. An agent is defined by:
    - a unique ID
    - a `client_id` (the WebSocket clientId of the connected browser tab)
    - a system prompt (persona)
2. An agent produces **exactly one message per turn**.
3. An agent only speaks when selected by the workflow engine.
4. Agents are stateless across runs.
5. The model used is determined by the ChatGPT browser session, not the orchestrator config.

---

## Workflow Model (v1)

- Workflow type: **round robin**
- Agent order is fixed at run start.
- Exactly one agent speaks per turn.
- The next speaker is always the next agent in the configured order (circular).

No branching, skipping, or dynamic selection is allowed in v1.

---

## Message Delivery Rules (Critical)

### Delivery Policy

- **An agent's output is delivered only to the next speaker.**
- Messages are not broadcast.
- The speaker never receives its own message.

### Inbox Semantics

- Each agent maintains a **pending inbox queue**.
- When an agent's turn begins:
    - they receive **all pending messages** accumulated since they last spoke
    - messages are delivered in chronological order
- After delivery, the inbox is cleared.

### Example (3 agents: A -> B -> C)

| Turn | Speaker | Inbox Received | Message Delivered To |
| ---- | ------- | -------------- | -------------------- |
| 1    | A       | seed prompt    | B                    |
| 2    | B       | A1             | C                    |
| 3    | C       | B2             | A                    |
| 4    | A       | C3             | B                    |

This model must hold for any number of agents >= 2.

---

## Transcript Rules

- Every agent message is appended to the global transcript.
- The transcript is **write-only** during execution.
- Agents do not receive the full transcript by default.
- Agents only receive their inbox messages plus optional recent context (implementation detail).

---

## Agent Prompt Construction

Each agent call sends a single prompt string to the ChatGPT browser tab via `POST /responses/:clientId`. The prompt combines:

### System Persona

- The agent's persona (from config), included at the top of the prompt.

### Developer Preamble

- Framework constraints, e.g.:
    - You are participating in a multi-agent run.
    - Respond in markdown.
    - Do not mention the judge.
    - Address the messages you received.

### Inbox Bundle

- A structured list of inbox messages:
    - sender
    - turn number
    - content

If an agent's inbox is empty:

- a seed prompt must be injected for the starting agent.

---

## Judge Agent

### Role

- The judge evaluates the conversation after turns.
- The judge **never sends messages to agents**.
- Judge output is for the runtime only.
- The judge uses `POST /responses/:clientId/new` to start a **new temporary chat** for each evaluation, ensuring no context contamination.

### Authority

The judge can:

- score agents
- decide whether the run should stop

The judge cannot:

- influence agent prompts
- modify goals or personas
- select the next speaker
- inject feedback into the conversation

---

## Judge Output Contract (Strict)

The judge **must output a JSON object** inside a fenced code block.

Required fields:

```json
{
  "should_stop": true | false,
  "scores": {
    "<agent_id>": number
  },
  "reason": "human-readable explanation"
}
```

### Runtime Rules

- Only the first JSON code block is parsed.
- Output must be valid JSON.
- If parsing fails:
    - retry once with a correction prompt (sent as a new `/new` request)
    - if it fails again, terminate the run with an error

- Judge outputs are stored separately and never delivered to agents.

---

## Termination Rules

A run ends when **any** of the following occurs:

- Maximum number of turns is reached
- Judge returns `should_stop: true`
- A fatal runtime error occurs (server error, client disconnect, timeout, etc.)

The stop reason must be recorded in `run.json`.

---

## Output Invariants

For every completed turn:

- exactly one agent message file is written
- transcript is appended
- judge output (if enabled) is written

Agents must never see:

- judge scores
- judge reasons
- termination logic

---

## Determinism & Reproducibility

- Model outputs are non-deterministic by design (depends on the ChatGPT browser session).
- Workflow execution order **must** be deterministic.
- Given the same config, the same sequence of speakers must occur.

---

## Server Error Handling

The orchestrator must handle these server-specific error conditions:

- **404 Not Found**: client not connected (browser tab closed or extension disabled)
- **409 Conflict**: client already has an inflight request (previous turn not yet complete)
- **Timeout**: 120-second deadline for each agent/judge call

These are propagated as errors that terminate the run.

---

## Forward Compatibility Notes

The following are explicitly deferred to later versions:

- tool calling
- structured outputs
- conditional workflows
- parallel agents
- agent-private memory
- broadcast delivery
- direct OpenAI API support (bypassing browser)

v1 implementations must not include partial or experimental support for these.

---

## Design Principle

**Agents generate content.
Code controls behavior.
Judges evaluate, not steer.**

Breaking this separation is considered a bug.
