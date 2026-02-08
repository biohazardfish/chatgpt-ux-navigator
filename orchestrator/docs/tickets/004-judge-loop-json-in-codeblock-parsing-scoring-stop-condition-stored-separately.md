## Ticket 004 — Judge Loop (JSON-in-codeblock parsing, scoring + stop condition, stored separately)

### Goal

Implement the **judge caller** and **strict judge output parsing** used by the runner to:

- evaluate the transcript after each turn (v1: every turn),
- return `{ should_stop, scores, reason }`,
- never leak judge output into agent inputs,
- enable runner stop-on-judge logic.

This ticket covers:

- `POST /responses/:clientId/new` call to the local `@repo/server` for **judge only**
- Prompt construction for judge
- JSON-in-fenced-code-block extraction + validation
- A `callJudge()` function compatible with Ticket 002

It does **not** implement disk storage (Ticket 005).

---

## Architecture Context

The judge uses `POST /responses/:clientId/new` (note the `/new` suffix) on the local server. This tells the extension to **open a new temporary chat** before injecting the judge prompt, ensuring each evaluation starts with a clean context and previous evaluations do not contaminate the judge's reasoning.

```
callJudge()
    |
    v
POST /responses/<judge_client_id>/new  (to @repo/server)
    |
    v
Server sends {type: "prompt.new"} via WebSocket to judge extension tab
    |
    v
Extension creates new temporary chat, injects judge prompt, submits
    |
    v
ChatGPT generates response (SSE stream)
    |
    v
Extension intercepts stream, forwards to server via WebSocket
    |
    v
Server emits OpenAI-compatible SSE events back to HTTP caller
    |
    v
callJudge() parses response, extracts JSON from code block, returns JudgeDecision
```

---

## Deliverables

1. `createServerJudgeCaller(config: AppConfig): { callJudge: (input: JudgeInput) => Promise<JudgeDecision> }`
2. Prompt builder for judge
3. Parser: extract first JSON code block and validate required fields
4. One retry on parse/validation failure with a correction prompt
5. Unit tests for prompt format and parsing/validation logic (mocked HTTP)

---

## Environment / Configuration

### Required config (from `AppConfig`)

- `config.server.url` — base URL of the local server (e.g. `http://localhost:8765`)
- `config.judge.client_id` — the WebSocket clientId of the browser tab used for judge evaluation
- `config.judge.rubric` — the evaluation rubric text

### No API keys required

Authentication is handled by the browser session in the judge's ChatGPT tab.

---

## Interfaces (MUST)

Use these exact types from Ticket 002:

```ts
import type {JudgeInput, JudgeDecision} from '../runner/types';
import type {AppConfig} from '../config/types';
```

### Public factory (MUST)

```ts
export function createServerJudgeCaller(config: AppConfig): {
    callJudge: (input: JudgeInput) => Promise<JudgeDecision>;
};
```

- Only callable when `config.judge.enabled === true`.
- If `config.judge.enabled === false`, factory must throw:
    - `Error("Judge is disabled in config")`

---

## HTTP Request (MUST)

- Endpoint: `${config.server.url}/responses/${config.judge.client_id}/new`
- Method: `POST`
- Headers:
    - `Content-Type: application/json`
- No `Authorization` header required.

Request body:

```json
{
    "input": "<judge_prompt_text>",
    "stream": true
}
```

- Timeout: 120 seconds (AbortController).
- No general retries; ONLY the single "fix JSON" retry described below.

On error responses:

- **404 Not Found**: throw `Error("Server error: 404 - judge client '<client_id>' not connected")`
- **409 Conflict**: throw `Error("Server error: 409 - judge client '<client_id>' already has an inflight request")`
- Other non-2xx: throw `Error("Server error: <status> <body_snippet>")` (truncate body_snippet to 500 chars)

---

## Judge Prompt Content (MUST)

The prompt sent as `input` is a single string combining all sections.

### System preamble (exact)

````
You are a judge for a multi-agent AI conversation.

You must output ONLY a JSON object inside a fenced code block (```json ... ```).
Do not include any other text outside the code block.
The JSON must include: should_stop (boolean), scores (object), reason (string).
````

### Evaluation content (appended after preamble)

Concatenate the following sections separated by blank lines:

1. Rubric header:

```

RUBRIC:
<config.judge.rubric>
```

2. Agent list header (agent IDs in workflow order, comma-separated):

```

AGENTS:
<id1>, <id2>, <id3>
```

3. Transcript header + transcript content:

```

TRANSCRIPT (most recent last):
[1] <speaker>: <content>

[2] <speaker>: <content>

...
```

Rules for transcript rendering:

- Use `input.transcript` in order.
- Index is 1-based within the transcript, not turn number.
- `<speaker>` is `AgentMessage.speaker`
- `<content>` is included verbatim
- Separate entries with a single blank line.
- If transcript is empty (should not happen in normal operation), render:
    - `TRANSCRIPT (most recent last):` followed by `<<EMPTY>>`

---

## SSE Stream Parsing (MUST)

Use the same SSE parsing logic as Ticket 003 (shared `sseParser` module):

- Parse SSE events from the server's `text/event-stream` response.
- Extract final text from `response.completed`, `response.output_text.done`, or accumulated deltas.
- Handle JSON mode fallback if server returns `application/json`.
- Handle `response.error` events by throwing.

Then apply judge-specific parsing below.

---

## JSON-in-Codeblock Parsing Rules (MUST)

### Extraction

- Find the **first fenced code block** in the response whose opening fence is:
    - ` ```json `
    - or ` ``` `

- Extract the text inside that code block.
- If no fenced code block exists: parse failure.

### JSON parsing

- Parse extracted string with `JSON.parse`.
- If parse error: parse failure.

### Validation (strict)

Parsed object must:

- be a JSON object (not array/null)
- contain:
    - `should_stop`: boolean
    - `scores`: object (Record<string, number>)
    - `reason`: string (trimmed length >= 1)

- `scores` must include **all agent IDs** from `config.workflow.order` as keys.
- Each `scores[agent_id]` must be a finite number in range `0..10` inclusive.
- `scores` must not include extra keys not in agent IDs.

If any rule fails: validation failure.

### Returned value

Return the parsed/validated `JudgeDecision` exactly.

---

## Single Retry Logic (MUST)

If initial judge response results in parse failure or validation failure:

- Perform exactly **one** retry call to the server with the same endpoint (`POST /responses/:clientId/new`).
- The retry prompt must be the same system preamble + evaluation content, but with an additional **correction section** appended at the end:

````

YOUR PREVIOUS OUTPUT WAS INVALID.
Output ONLY a valid JSON object inside a fenced ```json code block.
Do not include any other text.
Follow the required schema exactly:
- should_stop: boolean
- scores: object with keys for each agent (0-10 range)
- reason: string
````

If the retry also fails parsing/validation:

- throw `Error("Judge output invalid after retry")`

---

## Error Handling (MUST)

- Non-2xx server response: throw with specific error messages (see HTTP Request section)
- Empty extracted text: throw `Error("Server judge returned empty content")`
- Invalid judge output after retry: throw `Error("Judge output invalid after retry")`

No console logging.

---

## Files / Modules (MUST)

- `src/server/createServerJudgeCaller.ts`
- `src/server/judgePromptBuilder.ts`
- `src/server/judgeResponseParser.ts`
- `src/server/__tests__/judgePromptBuilder.test.ts`
- `src/server/__tests__/judgeResponseParser.test.ts`

Note: The SSE parser (`src/server/sseParser.ts`) is shared with Ticket 003.

---

## Unit Tests (MUST)

### Prompt Builder

1. Correct inclusion of rubric.
2. Agent list rendered in workflow order.
3. Transcript rendered with correct indexing and spacing.
4. System preamble includes judge identity and JSON output instructions.

### Parser/Validator

Fixtures:

1. Valid ` ```json { ... } ``` ` parses successfully
2. Valid ` ``` { ... } ``` ` parses successfully
3. Missing code block -> fails then retry invoked (mocked)
4. Scores missing an agent key -> validation failure
5. Extra score key -> validation failure
6. Score out of range -> validation failure
7. Retry path succeeds on second response
8. Retry path fails -> throws `Judge output invalid after retry`

### Integration (mocked fetch)

1. Successful judge call with streaming response — extracts JSON and returns JudgeDecision
2. 404 response — throws client-not-connected error
3. 409 response — throws inflight-conflict error

Tests must mock fetch; no network calls.

---

## Acceptance Criteria

1. `createServerJudgeCaller(config).callJudge()` performs a valid `POST /responses/:clientId/new` request with locked prompt templates.
2. The `/new` endpoint is used (not `/responses/:clientId`) to ensure each judge evaluation starts in a fresh chat context.
3. Parser extracts first fenced code block, parses JSON, and validates strict schema including agent keys and score range.
4. Exactly one retry occurs on parse/validation failure with the specified correction prompt, using a new `/new` request.
5. On success, returns `JudgeDecision` compatible with the runner.
6. No judge content is ever routed to agents (enforced by architecture: runner consumes only `JudgeDecision`).
7. No API keys or OpenAI-specific fields are used.
