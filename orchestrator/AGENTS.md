# AGENTS.md

This document defines **agent behavior contracts**, **message delivery rules**, and **judge constraints** for Nexus.

All implementations **must follow these rules exactly** unless a new major version explicitly changes them.

---

## Terminology

- **Agent**: an AI model instance with a system persona that produces messages.
- **Judge**: a special AI agent that evaluates the conversation but never participates in it.
- **Turn**: one agent producing exactly one message.
- **Inbox**: the list of messages an agent receives when it is their turn to speak.
- **Transcript**: the ordered, global list of all agent messages.
- **Pending messages**: messages waiting in an agent’s inbox.

---

## Agent Lifecycle

1. An agent is defined by:
    - a unique ID
    - a model identifier
    - a system prompt (persona)
2. An agent produces **exactly one message per turn**.
3. An agent only speaks when selected by the workflow engine.
4. Agents are stateless across runs.

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

- **An agent’s output is delivered only to the next speaker.**
- Messages are not broadcast.
- The speaker never receives its own message.

### Inbox Semantics

- Each agent maintains a **pending inbox queue**.
- When an agent’s turn begins:
    - they receive **all pending messages** accumulated since they last spoke
    - messages are delivered in chronological order
- After delivery, the inbox is cleared.

### Example (3 agents: A → B → C)

| Turn | Speaker | Inbox Received | Message Delivered To |
| ---- | ------- | -------------- | -------------------- |
| 1    | A       | seed prompt    | B                    |
| 2    | B       | A1             | C                    |
| 3    | C       | B2             | A                    |
| 4    | A       | C3             | B                    |

This model must hold for any number of agents ≥ 2.

---

## Transcript Rules

- Every agent message is appended to the global transcript.
- The transcript is **write-only** during execution.
- Agents do not receive the full transcript by default.
- Agents only receive their inbox messages plus optional recent context (implementation detail).

---

## Agent Prompt Construction

Each agent call to OpenAI must include:

### System Message

- The agent’s persona (from config).

### Developer Message

- Framework constraints, e.g.:
    - You are participating in a multi-agent run.
    - Respond in markdown.
    - Do not mention the judge.
    - Address the messages you received.

### User Message

- A structured list of inbox messages:
    - sender
    - turn number
    - content

If an agent’s inbox is empty:

- a seed prompt must be injected for the starting agent.

---

## Judge Agent

### Role

- The judge evaluates the conversation after turns.
- The judge **never sends messages to agents**.
- Judge output is for the runtime only.

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
    - retry once with a correction prompt
    - if it fails again, terminate the run with an error

- Judge outputs are stored separately and never delivered to agents.

---

## Termination Rules

A run ends when **any** of the following occurs:

- Maximum number of turns is reached
- Judge returns `should_stop: true`
- A fatal runtime error occurs

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

- Model outputs are non-deterministic by design.
- Workflow execution order **must** be deterministic.
- Given the same config, the same sequence of speakers must occur.

---

## Forward Compatibility Notes

The following are explicitly deferred to later versions:

- tool calling
- structured outputs
- conditional workflows
- parallel agents
- agent-private memory
- broadcast delivery

v1 implementations must not include partial or experimental support for these.

---

## Design Principle

**Agents generate content.
Code controls behavior.
Judges evaluate, not steer.**

Breaking this separation is considered a bug.
