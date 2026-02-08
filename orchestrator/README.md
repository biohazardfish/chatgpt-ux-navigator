# Nexus

Nexus is a **local CLI tool** for running **multi-agent AI conversations** using a fixed, user-defined workflow.  
Multiple AI agents with distinct personas take turns speaking, exchanging messages according to strict delivery rules, while a separate **judge agent** evaluates progress and decides when the run should stop.

This project is designed for **AI power users** who want to automate controlled multi-agent workflows (e.g. planner–critic loops, debates, simulations) and **inspect the full conversation afterward**.

---

## Core Concept

- Multiple AI agents, each with:
    - a model
    - a system persona
- A **round-robin workflow** determines who speaks next
- Agents **only receive messages from the previous speakers**, not the full transcript
- A **judge agent**:
    - scores agents
    - decides when the conversation should stop
    - never communicates with agents directly
- The entire run is recorded locally as **markdown + JSON artifacts**

There is **no human-in-the-loop** during execution.

---

## What This Is (and Is Not)

### ✅ This is

- A deterministic **orchestration engine**
- A CLI-first developer tool
- Designed for automation (not chat UX)
- Fully local output (files on disk)
- Compatible with heterogeneous OpenAI models
- Text / Markdown only (no tools, no structured outputs yet)

### ❌ This is not

- A chatbot UI
- An autonomous agent framework with tools
- A visual workflow editor (future possibility)
- A long-term memory system (v1)

---

## MVP Scope (Locked)

### Workflow

- **Round-robin only**
- Fixed agent order
- No branching or conditional logic in v1

### Message Delivery

- Each agent’s output is delivered **only to the next speaker**
- Agents maintain a **pending inbox**
- When an agent speaks, it receives **all pending messages since it last spoke**
- Agents **never see judge scores or judge feedback**

### Judge Authority

- Can:
    - score agents
    - decide whether to stop the run
- Cannot:
    - modify agent goals
    - inject messages
    - choose the next speaker

### Output

- Full transcript written to disk
- One markdown file per turn
- Judge outputs stored separately
- Runs are replayable (review or rerun)

---

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **CLI:** Bun CLI (no framework required for v1)
- **Config format:** YAML
- **LLM API:** OpenAI `POST /responses`
- **Output formats:**
    - Markdown (`.md`)
    - JSON (`.json`)

No database. No server. No UI.

---

## High-Level Architecture

```

config.yml
↓
Config Parser & Validator
↓
Runner Engine
├─ Agent Loop (round robin)
│    ├─ inbox handling
│    ├─ OpenAI Responses call
│    └─ transcript append
├─ Judge Evaluation
│    └─ stop / score decision
└─ Termination Check
↓
Run Artifacts Written to Disk

```

---

## Run Artifacts (On Disk)

Each run creates a folder like:

```

runs/2026-02-08T14-32-10Z_my-run/
config.yml              # exact config used
run.json                # metadata + stop reason
transcript.md           # stitched conversation
messages/
0001_agentA.md
0002_agentB.md
...
judge/
0001.json
0002.json

```

These artifacts are the **primary product output**.

---

## Example Use Cases

- Planner ↔ Critic loops
- Multi-agent debates
- Idea exploration with distinct personas
- Automated reasoning pipelines
- AI behavior simulation (future extension)

---

## Non-Goals (for v1)

- Tool calling
- Structured outputs
- Visual editors
- Parallel agents
- Memory beyond current run
- Cloud hosting

These may be added later, but **must not complicate the MVP**.

---

## Status

🚧 MVP in development  
See `AGENTS.md` for agent behavior conventions and internal rules.
