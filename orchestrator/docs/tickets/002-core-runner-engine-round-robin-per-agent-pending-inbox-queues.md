## Ticket 002 — Core Runner Engine (round-robin + per-agent pending inbox queues)

### Goal

Implement the **deterministic orchestration engine** that executes a run from a validated `AppConfig`, applying **round-robin speaker selection** and **next-speaker-only delivery** using **per-agent pending inbox queues**.

This ticket covers **control flow and state management only**. It must not implement HTTP calls to the server, prompt building, or judge logic beyond calling provided interfaces.

---

## Architecture Context

The runner does not interact with ChatGPT or the local server directly. It calls injected `callAgent` and `callJudge` functions which are implemented in Tickets 003 and 004 respectively. Those implementations use `POST /responses/:clientId` on the `@repo/server` to send prompts to browser extension clients, but the runner is unaware of this transport layer.

---

## Deliverables

1. `runConversation(config: AppConfig, deps: RunnerDeps): Promise<RunResult>`
2. Round-robin scheduler (fixed order, circular)
3. Pending inbox queue model satisfying delivery invariants
4. Deterministic run state transitions
5. Unit tests for core runner behavior using mocked agent/judge functions

---

## Inputs / Dependencies

### `AppConfig`

Provided by Ticket 001. Runner must assume it is already validated and normalized.

### Dependency Interfaces (MUST)

Runner must not call the server directly. It uses injected functions.

```ts
export type AgentMessage = {
    turn: number; // 1-based
    speaker: string; // agent id
    content: string; // markdown text
    created_at: string; // ISO timestamp
};

export type InboxItem = {
    turn: number; // originating turn number
    from: string; // agent id or "user"
    content: string; // markdown text
};

export type AgentCallInput = {
    agent_id: string;
    client_id: string; // the WebSocket clientId for this agent (from config)
    turn: number;
    inbox: InboxItem[]; // all pending messages for this agent (chronological)
};

export type AgentCallOutput = {
    content: string; // markdown
};

export type JudgeInput = {
    turn: number; // the turn just completed
    transcript: AgentMessage[]; // full transcript so far
};

export type JudgeDecision = {
    should_stop: boolean;
    scores: Record<string, number>;
    reason: string;
};

export type RunnerDeps = {
    callAgent: (input: AgentCallInput) => Promise<AgentCallOutput>;
    callJudge?: (input: JudgeInput) => Promise<JudgeDecision>; // only used if judge.enabled=true
    nowISO: () => string; // deterministic time injection for tests
};
```

---

## Runtime State Model (MUST)

Runner must maintain:

- `turn` (1-based integer)
- `speaker_idx` (index into `workflow.order`)
- `pending: Record<agent_id, InboxItem[]>` (inbox queues)
- `transcript: AgentMessage[]` (global ordered list)
- `stop_reason: "max_turns" | "judge_stop" | "error"`

### Pending Initialization (MUST)

At run start:

- Initialize `pending[agent] = []` for all agents in `workflow.order`
- Insert the seed prompt into the start agent's pending inbox:

    ```ts
    pending[start].push({turn: 0, from: 'user', content: config.seed.content});
    ```

    - seed uses `turn: 0`

---

## Turn Execution Algorithm (MUST)

For each turn until termination:

1. **Select speaker**
    - `speaker = order[speaker_idx]`

2. **Deliver inbox**
    - `inbox = pending[speaker]` (array reference/clone is implementation detail)
    - Clear queue:
        - `pending[speaker] = []`

3. **Call agent**
    - Resolve `client_id` from config: `config.agents[speaker].client_id`
    - Await `deps.callAgent({ agent_id: speaker, client_id, turn, inbox })`
    - Validate agent output:
        - `content` must be a string
        - trimmed length must be >= 1
        - If invalid, terminate with stop_reason `"error"` and throw (see error handling).

4. **Append to transcript**
    - Construct:

        ```ts
        const msg: AgentMessage = {
            turn,
            speaker,
            content,
            created_at: deps.nowISO(),
        };
        transcript.push(msg);
        ```

5. **Deliver to next speaker only**
    - Compute next speaker index:
        - `next_idx = (speaker_idx + 1) % order.length`
        - `next_speaker = order[next_idx]`

    - Append to pending inbox of next speaker:

        ```ts
        pending[next_speaker].push({turn, from: speaker, content});
        ```

6. **Judge evaluation (optional)**
    - If `config.judge.enabled === true`:
        - `deps.callJudge` must exist, otherwise throw error at start of run
        - Call after transcript append and delivery:
            - `decision = await callJudge({ turn, transcript })`

        - Store decision in result history (see RunResult), but DO NOT deliver to agents.
        - If `config.termination.judge_stop === true` and `decision.should_stop === true`:
            - terminate with stop_reason `"judge_stop"`

7. **Max turn termination**
    - If `turn >= config.termination.max_turns`:
        - terminate with stop_reason `"max_turns"`

8. **Advance**
    - `turn++`
    - `speaker_idx = next_idx`
    - loop

---

## Ordering & Determinism Requirements (MUST)

- Speaker order is strictly round-robin as configured.
- Pending inbox delivery order is chronological append order.
- Judge is called strictly once per completed turn when enabled.
- No concurrency: all steps are sequential and awaited.

---

## Error Handling (MUST)

### Invalid dependency configuration

- If `config.judge.enabled === true` but `deps.callJudge` is undefined:
    - throw an Error before first turn: `Missing dependency: callJudge`

### Agent output invalid

- If `callAgent` resolves to missing/empty content:
    - throw Error: `Agent output invalid: <agent_id> turn <n>`

### Dependency call failures

- If `callAgent` or `callJudge` throws/rejects:
    - propagate the error (do not swallow)
    - runner must still return a partial `RunResult` only if explicitly implemented; v1 requirement:
        - **propagate error** and do not claim successful completion.

### Server-specific errors

- The runner does not handle server errors (409 Conflict, 404 Not Found, etc.) directly. These are propagated by the `callAgent`/`callJudge` implementations (Tickets 003/004).

---

## Output Types (MUST)

```ts
export type JudgeRecord = {
    turn: number;
    decision: JudgeDecision;
    created_at: string; // deps.nowISO()
};

export type RunResult = {
    transcript: AgentMessage[];
    judge: JudgeRecord[]; // empty if judge disabled
    stop_reason: 'max_turns' | 'judge_stop';
    total_turns: number; // transcript.length
};
```

Notes:

- `stop_reason` does not include `"error"` in successful returns because errors are thrown.

---

## File/Module Requirements

- `src/runner/types.ts` — shared runtime types (may re-export from config types)
- `src/runner/runConversation.ts` — main orchestration loop
- `src/runner/__tests__/runConversation.test.ts` — unit tests

---

## Unit Tests (MUST)

Using mock deps:

1. **2-agent basic round robin**
    - order [A, B], start A, max_turns 4, judge disabled
    - verify speakers: A, B, A, B
    - verify inbox delivery:
        - A turn1 inbox contains seed only
        - B turn2 inbox contains A1
        - A turn3 inbox contains B2
        - B turn4 inbox contains A3
    - verify `client_id` is passed correctly to `callAgent` for each agent

2. **3-agent pending accumulation**
    - order [A, B, C], start A, max_turns 6, judge disabled
    - verify each agent receives exactly one message when speaking (because strict next-speaker delivery)
    - verify pending queues are empty for current speaker post-delivery

3. **Judge stop**
    - judge enabled, judge_stop true
    - mock judge returns should_stop true at turn 3
    - verify runner stops with `stop_reason="judge_stop"` and `total_turns===3`

4. **Max turns stop**
    - max_turns 5, judge enabled but never stops
    - verify stop_reason max_turns and transcript length 5

5. **Missing callJudge dependency**
    - config judge.enabled true, deps.callJudge undefined
    - runner throws before executing any turns

6. **Invalid agent output**
    - mock callAgent returns empty string on turn 2
    - runner throws with correct error message

---

## Acceptance Criteria

- Implements algorithm exactly as specified.
- Deterministic sequencing and inbox semantics match the contracts in `AGENTS.md`.
- Tests pass and cover required scenarios.
- Runner does not implement HTTP calls or prompt formatting; it only calls injected functions.
- `client_id` from config is correctly threaded through `AgentCallInput` for each agent.
