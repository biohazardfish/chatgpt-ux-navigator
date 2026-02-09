# Quick Start Guide

## 1. Prerequisites

- Local server running: `bun dev` (from project root)
- ChatGPT browser tabs open with extension installed
- Note client IDs from server console output (or call `GET /clients`)

## 2. Create a Config File

### Option A: Simple Conversation (No Judge)

Create `my-run.yml`:

```yaml
version: 1

server:
    url: http://localhost:8765
    agents_new_chat: true

run:
    id: my-first-run
    out_dir: runs

agents:
    agent1:
        client_id: YOUR_CLIENT_ID_HERE # Get from server console
        system: 'You are a helpful assistant named Agent 1.'

    agent2:
        client_id: YOUR_CLIENT_ID_HERE # Get from server console
        system: 'You are a helpful assistant named Agent 2.'

workflow:
    type: round_robin
    order: [agent1, agent2]
    start: agent1

delivery:
    type: next_speaker

seed:
    from: user
    content: "Hello! Let's have a conversation. Agent 1, introduce yourself."

judge:
    enabled: false
    eval_every_turn: true

termination:
    max_turns: 4
    judge_stop: false
```

### Option B: With Judge (Recommended)

Create `my-judged-run.yml`:

```yaml
version: 1

server:
    url: http://localhost:8765
    agents_new_chat: true

run:
    id: my-judged-run
    out_dir: runs

agents:
    planner:
        client_id: YOUR_CLIENT_ID_1 # Get from server console
        system: |
            You are a creative planner who proposes innovative solutions.
            Think outside the box and suggest bold ideas.
            Keep responses concise (2-3 paragraphs).

    critic:
        client_id: YOUR_CLIENT_ID_2 # Get from server console
        system: |
            You are a thoughtful critic who evaluates ideas critically.
            Point out potential flaws and suggest improvements.
            Be constructive but rigorous. Keep responses concise (2-3 paragraphs).

workflow:
    type: round_robin
    order: [planner, critic]
    start: planner

delivery:
    type: next_speaker

seed:
    from: user
    content: |
        Task: Design a system to reduce food waste in urban areas.
        Planner, propose your initial solution.

    judge:
        enabled: true
        client_id: YOUR_CLIENT_ID_3 # IMPORTANT: Need a 3rd browser tab for judge
    rubric: |
        Evaluate this planner-critic conversation on:
        1. Quality of the proposed solution (planner)
        2. Depth of critical analysis (critic)
        3. Overall progress toward a viable solution

        Score each agent from 0-100.

        Stop the conversation when:
        - A refined, viable solution has been reached
        - The conversation becomes repetitive
        - At least 4 turns have passed and good progress has been made

        Return your evaluation as JSON:
        {
          "should_stop": true/false,
          "scores": {"planner": X, "critic": Y},
          "reason": "Brief explanation"
        }
    # Judge evaluation is per-round; eval_every_turn is deprecated

termination:
    max_turns: 10
    judge_stop: true # Judge can stop early if solution is reached
```

**Note**: With judge enabled, you need **3 browser tabs**:

- Tab 1: Planner agent
- Tab 2: Critic agent
- Tab 3: Judge (evaluates but doesn't participate)

## 3. Run It

```bash
# Without judge
bun start my-run.yml

# With judge
bun start my-judged-run.yml
```

If any configured `client_id` is not currently connected, Nexus will fail fast before starting the run.

## 4. Check Output

Look in `runs/` for a timestamped folder with:

- `transcript.md` - Full conversation
- `messages/` - Individual turn files with frontmatter
- `run.json` - Metadata and stop reason
- `judge/` - Evaluation records (only if judge enabled)

### Example Output Structure

**Without Judge:**

```
runs/2026-02-08T14-32-10Z_my-first-run/
├── config.yml
├── run.json
├── transcript.md
└── messages/
    ├── 0001_agent1.md
    ├── 0002_agent2.md
    ├── 0003_agent1.md
    └── 0004_agent2.md
```

**With Judge:**

```
runs/2026-02-08T15-45-20Z_my-judged-run/
├── config.yml
├── run.json
├── transcript.md
├── messages/
│   ├── 0001_planner.md
│   ├── 0002_critic.md
│   ├── 0003_planner.md
│   └── 0004_critic.md
└── judge/
    ├── 0001.json  # Evaluation after round 1
    ├── 0002.json  # Evaluation after round 2
```

## Example Commands

```bash
# Show help
bun start --help

# Run example debate (2 agents + judge)
bun start examples/debate.yml

# Run planner-critic workflow (2 agents + judge)
bun start examples/planner-critic.yml

# Run simple conversation (2 agents, no judge)
bun start examples/simple.yml

# Type check code
bun typecheck

# Run tests
bun test
```

## Next Steps

- See [README.md](README.md) for full documentation
- Check [examples/](examples/) for more config templates
- Read [AGENTS.md](AGENTS.md) for architecture details
