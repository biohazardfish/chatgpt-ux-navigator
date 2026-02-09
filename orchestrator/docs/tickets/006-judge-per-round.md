## Ticket 006 — Judge Evaluation Per Round (Stateless)

**Status**: Proposed  
**Target Version**: v1.x (behavioral change, not a new major version)

---

### Goal

Change the judge evaluation model from **per agent turn** to **per round**, while keeping the judge **stateless**.

A judge evaluation occurs **once after all agents have completed a round**, instead of after each individual agent turn. `should_stop` decisions are made **only at round boundaries**.

This removes ordering bias, improves fairness, and aligns evaluation semantics with the round‑robin workflow model.

---

---

## Architecture Context

The orchestrator executes agents in a **round‑robin workflow** and invokes a dedicated **judge agent** via `POST /responses/:clientId/new`. The judge never participates in the conversation and evaluates only completed work. This ticket adjusts **when** the judge is invoked; it does not change message delivery, transcript rules, or the judge output contract defined in `AGENTS.md`.

---

## Motivation

The current v1 behavior evaluates agents after every turn, which introduces several issues:

- Early agents are judged without seeing later agents’ responses
- Agent order influences scores (ordering bias)
- `should_stop` may terminate runs mid‑round
- “Round robin” semantics are undermined by turn‑level judging

Moving to **judge‑per‑round** resolves these issues while preserving:

- Stateless judge design
- Existing judge output contract
- Existing agent lifecycle and delivery rules

---

---

## Goals

- Judge runs **exactly once per round**
- Judge remains **stateless**
- `should_stop` is evaluated **only between rounds**
- All agents in a round are evaluated together
- Agent ordering must not affect scores

---

---

## Non‑Goals

- Introducing stateful judges
- Allowing judges to influence agent prompts
- Changing agent personas or delivery rules
- Parallel agent execution
- Changing the judge JSON output schema

---

---

## Definitions

**Round**  
A round is complete when:

- Each active agent has produced exactly one message  
  OR
- An agent failure occurs (timeout, disconnect, fatal error)

**Turn**  
A single agent producing one message.

---

---

## Proposed Behavior

### Judge Invocation

- The judge is invoked **once per completed round**
- The judge is **never invoked mid‑round**
- The judge uses `POST /responses/:clientId/new` (fresh chat) every time

### Judge Input

The judge receives:

- Full transcript up to the end of the round
- Rubric from config
- List of agent IDs
- An explicit round boundary marker, e.g.:

```
=== END OF ROUND 3 ===
```

### Judge Output (unchanged)

```json
{
  "should_stop": true | false,
  "scores": {
    "<agent_id>": number
  },
  "reason": "string"
}
```

Scores represent **performance in the current round only**.

---

---

## Early Stop Policy (Confirmed)

- `should_stop` is evaluated **only after a round completes**
- If `should_stop === true`:
    - The current round is final
    - No further rounds are executed

Mid‑round stopping is not allowed.

---

---

## Agent Failure Handling (Confirmed)

If an agent fails during a round:

1. Mark the agent as failed
2. Skip remaining agent turns in the round
3. Invoke the judge **once** at the end of the round
4. After judge evaluation:
    - Terminate the run

The judge still attempts to score the round using available information.

---

---

## Scoring Semantics

- Scores are **per‑round snapshots**
- Scores are not cumulative by definition
- Any aggregation (sum, average, final ranking) is handled by the runner, not the judge
- Judge must not assume knowledge of prior rounds

---

---

## Required Implementation Changes (High‑Level)

### Runner Control Flow

Current (simplified):

```
run agent turn
→ run judge
```

New:

```
run full round
→ run judge once
→ evaluate should_stop
```

### Code Areas Impacted

- Runner loop logic
- Judge invocation timing
- Run termination logic
- Logging / artifacts (judge output numbering now corresponds to rounds)

---

---

## Artifacts & Output Changes

- `judge/0001.json` now represents **round 1 evaluation**
- Documentation must reflect “evaluation after round”, not “after turn”
- `run.json` stop reasons remain unchanged

---

---

## Documentation Updates Required

- `orchestrator/AGENTS.md`
    - Replace “judge evaluates after turns” with “after rounds”
- `orchestrator/QUICKSTART.md`
    - Update judge output examples and comments
- Deprecate or redefine any config option implying per‑turn evaluation (e.g. `eval_every_turn`)

---

---

## Risks & Mitigations

**Risk**: Delayed stopping (one extra round)  
**Mitigation**: Acceptable tradeoff for fairness and clarity

**Risk**: Agent failure edge cases  
**Mitigation**: Explicit failure policy defined above

---

---

## Acceptance Criteria

- Judge is called exactly once per round
- Judge is never called mid‑round
- `should_stop` only applies between rounds
- Agent order does not affect scoring
- Existing judge JSON schema remains valid
- Existing runs remain reproducible with updated semantics

---

## Testing Plan (Required)

This change alters **when** the judge is invoked. Tests must assert timing, not just outputs.

### Unit Tests (Runner Control Flow)

- Judge invocation count equals number of **completed rounds**
- Judge is **never invoked inside the turn loop**
- `should_stop` is evaluated **only after** a round completes
- Judge artifact numbering (`judge/0001.json`, `0002.json`, …) maps to **round index**, not turn index

### Integration Tests (Happy Path)

**3 agents, 2 rounds, no early stop**

- Total agent messages: 6
- Total judge invocations: 2
- Each judge input includes:
    - Full transcript up to that round
    - Explicit round marker (`=== END OF ROUND X ===`)
- Scores contain exactly one entry per agent

**Early stop after round 1**

- Judge round 1 returns `should_stop: true`
- No turns executed for round 2
- Exactly one judge output written
- Run stop reason recorded as judge stop

### Integration Tests (Failure Scenarios)

**Agent failure mid‑round**

- Failure occurs after one or more agents have spoken
- Remaining agent turns in the round are skipped
- Judge invoked exactly once for that round
- Run terminates after judge output
- Judge scores round using available messages only

**Agent failure on first turn of round**

- Round completes immediately
- Judge still invoked once
- Output schema remains valid (scores may be partial)

### Regression / Negative Tests

- Assert judge is not called mid‑turn under any condition
- Judge JSON schema remains unchanged and parseable
- Reordering agent configuration does not change:
    - Judge invocation count
    - Score key set (agent IDs)

### Artifact Validation

- One judge file per completed round
- `run.json` stop reason semantics unchanged
- Judge outputs correspond to rounds, not turns

---

## Implementation Checklist (Build Guide)

This checklist is normative. All items must be satisfied.

### Control Flow

- Remove judge invocation from the per‑turn execution path
- Introduce an explicit **post‑round** evaluation phase
- Runner loop structure must be:

```
for each round:
  for each agent in order:
    run turn (unless failure)
  invoke judge once
  evaluate should_stop
```

### Round Tracking

- Maintain a 1‑based `roundIndex`
- Increment only after a round completes or aborts due to failure
- Do not conflate round counters with turn counters

### Judge Invocation

- Always use `POST /responses/:clientId/new`
- Judge prompt must include:
    - Full transcript to date
    - Rubric
    - Agent ID list
    - Explicit round boundary marker
- Judge outputs must never be delivered to agents

### Early Stop Handling

- `should_stop` evaluated only after judge execution
- If `true`, terminate run without starting another round
- Max‑turn limits must not trigger mid‑round judging

### Agent Failure Handling

- On agent failure:
    - Mark agent as failed
    - Skip remaining agent turns in the round
    - Invoke judge exactly once
    - Terminate run after judge output

### Artifacts & Logging

- Judge artifacts are indexed by round
- Exactly one judge artifact per completed round
- Logs and documentation must reference rounds, not turns

### Documentation Updates

- Update `orchestrator/AGENTS.md` to reflect judge‑per‑round semantics
- Update `orchestrator/QUICKSTART.md` examples and commentary
- Deprecate any configuration implying per‑turn evaluation
