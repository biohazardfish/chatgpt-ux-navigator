## Ticket 001 — Config & Validation (YAML → typed config)

### Goal

Implement **deterministic parsing and strict validation** of the project configuration file (`.yml/.yaml`) into a **typed TypeScript config object** used by the runner. Invalid configs must fail fast with clear error messages.

This ticket defines the **entire v1 config spec**. Do not add fields not listed here.

---

## Architecture Context

Nexus does **not** call OpenAI directly. Instead, it sends prompts to the **local `@repo/server`** via `POST /responses/:clientId`, where each `clientId` maps to a Chrome extension instance connected to a ChatGPT browser tab via WebSocket. The server forwards the prompt to the extension, which injects it into ChatGPT, intercepts the SSE response stream, and relays it back through the server as an OpenAI-compatible SSE or JSON response.

Each agent in the config maps to a **connected browser client** identified by `client_id`. The model selection happens in the ChatGPT browser UI, not in the orchestrator config.

---

## Deliverables

1. `loadConfig(configPath: string): Promise<AppConfig>`
2. Strict schema validation with human-readable errors
3. Defaulting behavior exactly as specified
4. Unit tests covering valid + invalid configs

---

## Supported File Formats

- YAML only (`.yml` or `.yaml`)
- UTF-8
- No JSON support in v1

---

## CLI Contract (input)

- CLI will provide a single path to a YAML file.
- The loader must resolve the path relative to current working directory.
- The loader must read from disk; no stdin support in v1.

---

## Config Spec (v1)

### Top-level schema

```ts
export type AppConfig = {
    version: 1;

    server: {
        url: string; // required, e.g. "http://localhost:8765"
    };

    run?: {
        id?: string; // optional, default derived (see defaults)
        out_dir?: string; // optional, default "runs"
    };

    agents: Record<string, AgentConfig>;

    workflow: {
        type: 'round_robin';
        order: string[]; // agent IDs
        start?: string; // optional; default order[0]
    };

    delivery: {
        type: 'next_speaker';
    };

    seed: {
        from: 'user'; // fixed literal in v1
        content: string; // required, non-empty
    };

    judge: {
        enabled: boolean;
        client_id: string; // required if enabled=true; the clientId of the browser tab used for judge evaluation
        rubric: string; // required if enabled=true, non-empty
    };

    termination: {
        max_turns: number; // required, integer, 1..1000
        judge_stop: boolean; // required
    };
};

export type AgentConfig = {
    client_id: string; // required, the WebSocket clientId of the connected browser tab running this agent
    system: string; // required, non-empty; the agent persona injected as prompt preamble
};
```

---

## Validation Rules (MUST)

### `version`

- Required.
- Must equal integer `1`.

### `server`

- Required.
- `url`: required, string, trimmed length >= 1.
- Must be a valid URL (parseable by `new URL()`).

### `agents`

- Required.
- Must be an object with **2..20** keys.
- Each key is an `agent_id`:
    - Must match regex: `^[A-Za-z][A-Za-z0-9_-]{0,31}$`
    - Must be unique (YAML keys already enforce uniqueness; still validate)

- Each `AgentConfig`:
    - `client_id`: required, string, trimmed length >= 1
    - `system`: required, string, trimmed length >= 1

### `workflow`

- Required.
- `type` must equal `"round_robin"`.
- `order` required:
    - array length must equal number of agents
    - must contain each agent id exactly once
    - no duplicates

- `start` optional:
    - if present must be one of the agent IDs in `order`

### `delivery`

- Required.
- `type` must equal `"next_speaker"`.

### `seed`

- Required.
- `from` must equal `"user"`.
- `content` required:
    - string, trimmed length >= 1

### `judge`

- Required.
- `enabled` required boolean.
- If `enabled: true`:
    - `client_id` required: string, trimmed length >= 1
    - `rubric` required: string, trimmed length >= 1

- If `enabled: false`:
    - `client_id` and `rubric` may be present or absent, but **if present** must still be strings (no additional validation).
    - Runtime will ignore them.

### `termination`

- Required.
- `max_turns` required:
    - integer
    - range 1..1000 inclusive

- `judge_stop` required boolean.
- If `judge.enabled` is `false` then `termination.judge_stop` must be `false`. (Reject otherwise.)

### Client ID Uniqueness (cross-section)

- All `client_id` values across agents and judge (when enabled) SHOULD be unique.
    - Two agents sharing the same `client_id` would cause request conflicts (`409 Conflict` from the server when an inflight is already active).
    - Validation MUST warn but MAY allow duplicate client IDs (the runner will handle serialization).

### Unknown Fields

- Unknown fields at any level MUST cause validation failure.
    - Example: adding `foo: 123` anywhere is invalid.

---

## Defaulting Rules (MUST)

### `run`

- If `run` missing: treat as `{}`.
- `run.out_dir` default: `"runs"`
- `run.id` default: derived from config filename (without extension)
    - Example: `configs/debate.yml` -> `debate`
    - If filename cannot be derived: default `"run"`

### `workflow.start`

- If missing: default to `workflow.order[0]`

No other defaults exist.

---

## Normalization Rules (MUST)

- All string fields validated by "trimmed length >= 1" must be **stored trimmed** in the final `AppConfig`.
- `workflow.order` entries must be stored exactly as provided (no case folding), but validated against agent IDs.

---

## Error Handling Requirements

### Output format

Validation failures must throw an Error with:

- A concise summary line: `Invalid config: <reason>`
- Followed by one error per line, each including a **path**.
    - Example:
        - `agents.A.client_id: required`
        - `workflow.order[2]: unknown agent id "X"`
        - `termination.max_turns: must be integer 1..1000`
        - `server.url: must be a valid URL`

### Required: deterministic ordering

When multiple errors exist:

- Sort errors lexicographically by path in the thrown message.

---

## Implementation Requirements

### Libraries

- Use Bun + TypeScript.
- YAML parsing must use a stable YAML library (e.g. `yaml` npm package).
- Validation must be implemented with a schema validator (e.g. Zod) or equivalent.
- Pick one approach and implement fully; no partial/manual validation scattered across files.

### Function Signature

```ts
export async function loadConfig(configPath: string): Promise<AppConfig>;
```

### Behavior

- Must read file from disk.
- Must parse YAML.
- Must validate strictly according to this ticket.
- Must apply defaults/normalization.
- Must return typed `AppConfig`.

---

## Files / Modules

- `src/config/types.ts` — exports `AppConfig`, `AgentConfig`
- `src/config/loadConfig.ts` — exports `loadConfig`
- `src/config/schema.ts` — schema + validation logic
- `src/config/__tests__/loadConfig.test.ts` — tests

(Exact paths may change, but separation of concerns must remain.)

---

## Acceptance Criteria

1. `loadConfig()` accepts a valid config and returns a normalized `AppConfig` matching the spec.
2. Invalid configs reject with a deterministic, path-based multi-error message.
3. Unknown fields anywhere fail validation.
4. Defaults are applied exactly as specified and only for the specified fields.
5. Tests cover at minimum:
    - Minimal valid config
    - Invalid: version != 1
    - Invalid: <2 agents, >20 agents
    - Invalid: agent id regex violations
    - Invalid: workflow.order missing agent / duplicate agent / extra agent
    - Invalid: start not in order
    - Invalid: judge_stop true while judge.enabled false
    - Invalid: unknown field at top-level and nested
    - Invalid: server.url missing or not a valid URL
    - Invalid: agent missing client_id
    - Warning: duplicate client_id across agents

---

## Example Valid Config (for tests)

```yaml
version: 1
server:
    url: 'http://localhost:8765'
agents:
    A:
        client_id: agent-alpha
        system: 'You are A.'
    B:
        client_id: agent-bravo
        system: 'You are B.'
workflow:
    type: round_robin
    order: [A, B]
delivery:
    type: next_speaker
seed:
    from: user
    content: 'Discuss ways to improve onboarding.'
judge:
    enabled: true
    client_id: judge-tab
    rubric: 'Score both agents 0-10. Stop when converged.'
termination:
    max_turns: 10
    judge_stop: true
```

---
