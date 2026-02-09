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

## Prerequisites

1. **Bun** (v1.0+) - [Install Bun](https://bun.sh)
2. **Local Server Running** - The `@repo/server` must be running
3. **Chrome Extension Connected** - ChatGPT browser tabs connected via the extension

---

## Installation

From the monorepo root:

```bash
bun install
```

This installs dependencies for all workspaces, including the orchestrator.

---

## Setup

### 1. Start the Local Server

From the **monorepo root**:

```bash
bun dev
```

This starts the `@repo/server` on `http://localhost:8765` (or the port specified in your `.env`).

### 2. Connect ChatGPT Browser Tabs

1. Open ChatGPT in separate browser tabs (one per agent, plus one for the judge if enabled)
2. Load the Chrome extension (see main README for installation)
3. The extension will automatically connect to the local server via WebSocket
4. Note the **client IDs** displayed in the server console:
   ```
   WebSocket client connected: client-abc123
   WebSocket client connected: client-def456
   WebSocket client connected: client-ghi789
   ```

### 3. Create a Config File

Create a YAML config file defining your agents and workflow. See `examples/` for templates.

**Minimal example** (`my-run.yml`):

```yaml
version: 1

server:
  url: http://localhost:8765

run:
  id: my-run
  out_dir: runs

agents:
  alice:
    client_id: client-abc123  # Replace with your actual client ID
    system: "You are Alice, a helpful assistant."
  
  bob:
    client_id: client-def456  # Replace with your actual client ID
    system: "You are Bob, a thoughtful analyst."

workflow:
  type: round_robin
  order: [alice, bob]
  start: alice

delivery:
  type: next_speaker

seed:
  from: user
  content: "Let's discuss the future of AI. Alice, what are your thoughts?"

judge:
  enabled: false
  eval_every_turn: true

termination:
  max_turns: 4
  judge_stop: false
```

**Important**: Replace `client_id` values with the actual client IDs from your connected browser tabs.

---

## Running Nexus

From the **orchestrator directory**:

```bash
# Run with config file path
bun start examples/debate.yml

# Or use the full path
bun run src/cli.ts examples/debate.yml

# Show help
bun start --help
```

From the **monorepo root**:

```bash
cd orchestrator
bun start examples/debate.yml
```

---

## Output Artifacts

Each run creates a timestamped folder in the configured `out_dir`:

```
runs/2026-02-08T14-32-10Z_my-run/
├── config.yml              # Exact config used
├── run.json                # Metadata + stop reason
├── transcript.md           # Full conversation (stitched)
├── messages/
│   ├── 0001_alice.md       # Turn 1 message (with frontmatter)
│   ├── 0002_bob.md         # Turn 2 message
│   └── ...
└── judge/                  # Only if judge is enabled
    ├── 0001.json           # Turn 1 evaluation
    ├── 0002.json           # Turn 2 evaluation
    └── ...
```

### File Formats

**Message files** (`messages/0001_alice.md`):
```markdown
---
turn: 1
speaker: alice
client_id: client-abc123
created_at: 2026-02-08T14:32:15.123Z
received_turns: []
---

Alice's response content here...
```

**Judge files** (`judge/0001.json`):
```json
{
  "turn": 1,
  "created_at": "2026-02-08T14:32:16.456Z",
  "should_stop": false,
  "scores": {
    "alice": 85,
    "bob": 82
  },
  "reason": "Both agents provided strong arguments..."
}
```

**Run metadata** (`run.json`):
```json
{
  "run_id": "my-run",
  "started_at": "2026-02-08T14:32:10.000Z",
  "ended_at": "2026-02-08T14:35:20.000Z",
  "stop_reason": "max_turns",
  "total_turns": 4,
  "server": {
    "url": "http://localhost:8765"
  },
  "agents": [...],
  "workflow": {...},
  "termination": {...}
}
```

---

## Example Workflows

### Two-Agent Debate (with Judge)

See `examples/debate.yml` for a complete example of:
- Two agents (pro/con) debating a topic
- Judge evaluating each turn
- Judge stopping the run when a winner emerges

```bash
bun start examples/debate.yml
```

### Planner-Critic Loop (with Judge)

See `examples/planner-critic.yml` for:
- Planner proposes solutions, critic refines them
- Judge evaluates progress and solution quality
- Judge stops when a viable solution is reached
- Demonstrates iterative refinement workflow

```bash
bun start examples/planner-critic.yml
```

### Simple Conversation (no Judge)

See `examples/simple.yml` for:
- Two collaborative agents
- Fixed number of turns (no judge)
- Brainstorming session

```bash
bun start examples/simple.yml
```

---

## Troubleshooting

### "Client not connected" error

- **Cause**: The specified `client_id` is not connected to the server
- **Solution**: 
  1. Check the server console for active client IDs
  2. Ensure the ChatGPT tab with that client ID is still open
  3. Refresh the ChatGPT tab to reconnect
  4. Update your config with the correct `client_id`

### "Client already has an inflight request" (409)

- **Cause**: The browser tab is already processing a request
- **Solution**: Wait for the current request to complete, or start a new ChatGPT tab

### "Judge output invalid after retry"

- **Cause**: The judge failed to return valid JSON in the required format
- **Solution**: 
  1. Simplify the judge `rubric` prompt
  2. Ensure the judge client is using a capable model (e.g., GPT-4)
  3. Check `judge/*.json` files for error details

### Run folder already exists

- **Cause**: A run with the same timestamp + ID already exists
- **Solution**: Change the `run.id` in your config or delete the old run folder

---

## Configuration Reference

See the YAML schema and validation in `src/config/schema.ts` for the complete specification.

### Required Fields

- `version`: Must be `1`
- `server.url`: Local server URL (e.g., `http://localhost:8765`)
- `agents`: At least one agent with `client_id` and `system`
- `workflow.order`: List of agent IDs (must match keys in `agents`)
- `seed.content`: Initial prompt sent to the starting agent
- `termination.max_turns`: Maximum conversation length

### Optional Fields

- `run.id`: Defaults to config filename (without extension)
- `run.out_dir`: Defaults to `"runs"`
- `workflow.start`: Defaults to first agent in `order`
- `judge.enabled`: Defaults to `false`

---

## Development

### Running Tests

```bash
bun test
```

### Type Checking

```bash
bun typecheck
```

### Formatting

```bash
bun format
```

---

## Advanced Usage

### Multiple Runs

Run the same config multiple times to compare non-deterministic LLM outputs:

```bash
for i in {1..3}; do
  bun start examples/debate.yml
done
```

Each run gets a unique timestamp, so they won't conflict.

### Custom Output Directory

Change `run.out_dir` in your config:

```yaml
run:
  id: experiment-1
  out_dir: ./experiments
```

### Long-Running Conversations

Increase `termination.max_turns` for extended exchanges:

```yaml
termination:
  max_turns: 50  # 25 turns per agent in a 2-agent setup
```

---

## Architecture Notes

See `AGENTS.md` for detailed agent behavior contracts and internal rules.

Key architectural points:

1. **No Direct OpenAI Calls**: Nexus sends prompts to `@repo/server`, which forwards them to the Chrome extension, which injects them into ChatGPT browser tabs.

2. **Inbox-Based Delivery**: Each agent maintains a pending inbox queue. Messages are delivered only to the next speaker.

3. **Judge Isolation**: Judge uses `POST /responses/:clientId/new` to start fresh temporary chats for each evaluation, ensuring no context contamination.

4. **Deterministic Execution**: Workflow order is deterministic (round-robin). Only LLM outputs are non-deterministic.

---

## Status

✅ MVP complete and ready for use

See `AGENTS.md` for agent behavior conventions and internal rules.
