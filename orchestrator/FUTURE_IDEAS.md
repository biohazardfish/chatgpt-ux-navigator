# FUTURE_IDEAS.md

This document captures **ideas explicitly deferred beyond v1** of AgentTalk.

Nothing in this file is part of the current spec.  
Items here must not influence implementation unless promoted into tickets and updated in `README.md` and `AGENTS.md`.

---

## Workflow & Orchestration

- Conditional workflows (`if / else` based on state or judge output)
- State-machine or DAG-based workflows
- Multiple workflow types selectable per run
- Parallel agents / simultaneous turns
- Dynamic speaker selection
- Workflow macros / reusable templates
- Workflow visualization (graph view)

---

## Message Delivery Models

- Broadcast delivery
- Deliver-to-subset (explicit recipients)
- Topic-based routing
- Agent-private channels
- Observer / spectator agents
- Message prioritization
- Message TTL / expiration

---

## Agent Capabilities

- Tool calling (search, code execution, APIs)
- Structured outputs (JSON schema enforcement)
- Function calling
- Multi-modal inputs (images, files)
- Agent memory across runs
- Agent self-reflection or self-scoring
- Agent capability negotiation

---

## Judge Enhancements

- Multiple judges
- Weighted judge voting
- Judge-selected next speaker
- Judge-injected feedback
- Judge-defined termination policies
- Confidence / convergence detection
- Judge-as-controller mode

---

## Output & Evaluation

- Final “designated output agent”
- Automatic summarization at end of run
- Diff-based progress detection
- Scoring trends and graphs
- Export to HTML / PDF
- Run comparison tooling
- Golden-run evaluation

---

## Cost & Performance

- Token and cost tracking
- Budget-based termination
- Adaptive context windowing
- Transcript summarization strategies
- Model mixing strategies (cheap → expensive)
- Caching agent outputs

---

## Developer Experience

- Visual run explorer UI
- Web dashboard
- Live streaming of turns
- Step-by-step debugging mode
- Replay with altered parameters
- CLI plugins
- SDK / library mode

---

## Configuration & DSL

- Visual workflow editor
- Typed DSL with code generation
- Inline expressions
- JSONLogic / expression language
- Includes / imports in config
- Environment variable interpolation

---

## Safety & Control

- Loop detection heuristics
- Toxicity / policy checks
- Output moderation
- Hard content filters
- Guardrail agents

---

## Deployment

- Hosted service mode
- Remote execution workers
- Shared run artifacts
- Collaboration features
- Cloud storage backends
