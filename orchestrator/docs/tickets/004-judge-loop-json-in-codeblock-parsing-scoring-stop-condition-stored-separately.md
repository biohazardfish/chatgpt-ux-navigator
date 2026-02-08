## Ticket 004 — Judge Loop (JSON-in-codeblock parsing, scoring + stop condition, stored separately)

### Goal

Implement the **judge caller** and **strict judge output parsing** used by the runner to:

- evaluate the transcript after each turn (v1: every turn),
- return `{ should_stop, scores, reason }`,
- never leak judge output into agent inputs,
- enable runner stop-on-judge logic.

This ticket covers:

- OpenAI Responses API call for **judge only**
- Prompt construction for judge
- JSON-in-fenced-code-block extraction + validation
- A `callJudge()` function compatible with Ticket 002

It does **not** implement disk storage (Ticket 005).

---

## Deliverables

1. `createOpenAIJudgeCaller(config: AppConfig): { callJudge: (input: JudgeInput) => Promise<JudgeDecision> }`
2. Prompt builder for judge
3. Parser: extract first JSON code block and validate required fields
4. One retry on parse/validation failure with a correction prompt
5. Unit tests for prompt format and parsing/validation logic (mocked HTTP)

---

## Environment / Configuration

### Required env vars

- `OPENAI_API_KEY` (string, required)

### Optional env vars (v1)

- `OPENAI_BASE_URL` (string, optional; default `https://api.openai.com/v1`)

Same HTTP rules as Ticket 003:

- Bun `fetch`
- 120s timeout
- No general retries; ONLY the single “fix JSON” retry described below.

---

## Interfaces (MUST)

Use these exact types from Ticket 002:

```ts
import type {JudgeInput, JudgeDecision} from '../runner/types';
import type {AppConfig} from '../config/types';
```

### Public factory (MUST)

```ts
export function createOpenAIJudgeCaller(config: AppConfig): {
    callJudge: (input: JudgeInput) => Promise<JudgeDecision>;
};
```

- Only callable when `config.judge.enabled === true`.
- If `config.judge.enabled === false`, factory must throw:
    - `Error("Judge is disabled in config")`

---

## HTTP Request Payload (MUST)

- Endpoint: `${baseUrl}/responses`
- Model: `config.judge.model`
- No tools, no response_format, no structured outputs.
- Only the required message sequence below.

Payload shape (representative):

```json
{
    "model": "<judge-model>",
    "input": [
        {"role": "system", "content": [{"type": "text", "text": "..."}]},
        {"role": "developer", "content": [{"type": "text", "text": "..."}]},
        {"role": "user", "content": [{"type": "text", "text": "..."}]}
    ]
}
```

No other fields allowed.

---

## Judge Prompt Content (MUST)

### System message (exact)

```
You are a judge for a multi-agent AI conversation.
```

### Developer message (exact)

````
You must output ONLY a JSON object inside a fenced code block (```json ... ```).
Do not include any other text outside the code block.
The JSON must include: should_stop (boolean), scores (object), reason (string).
````

### User message (exact format)

User message is a concatenation of:

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

## Judge Response Extraction (MUST)

Use same response text extraction rules as Ticket 003:

1. Prefer `output_text` if present and non-empty.
2. Else derive from `output[]` message content parts.
3. `trimEnd()` only.

Then parse judge decision using the rules below.

---

## JSON-in-Codeblock Parsing Rules (MUST)

### Extraction

- Find the **first fenced code block** in the response whose opening fence is:
    - ```json

      ```
    - or ```

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
    - `reason`: string (trimmed length ≥ 1)

- `scores` must include **all agent IDs** from `config.workflow.order` as keys.
- Each `scores[agent_id]` must be a finite number in range `0..10` inclusive.
- `scores` must not include extra keys not in agent IDs.

If any rule fails: validation failure.

### Returned value

Return the parsed/validated `JudgeDecision` exactly.

---

## Single Retry Logic (MUST)

If initial judge response results in parse failure or validation failure:

- Perform exactly **one** retry call to OpenAI with the same model and headers.
- The message sequence must be the same system + developer + user, but the **developer message** must be replaced with exactly:

````
Your previous output was invalid.
Output ONLY a valid JSON object inside a fenced ```json code block.
Do not include any other text.
Follow the required schema exactly.
````

If the retry also fails parsing/validation:

- throw `Error("Judge output invalid after retry")`

---

## Error Handling (MUST)

- Non-2xx OpenAI response: throw `Error("OpenAI error: <status> <body_snippet>")` (truncate body_snippet to 500 chars)
- Empty extracted text: throw `Error("OpenAI judge returned empty content")`
- Invalid judge output after retry: throw `Error("Judge output invalid after retry")`

No console logging.

---

## Files / Modules (MUST)

- `src/openai/createOpenAIJudgeCaller.ts`
- `src/openai/judgePromptBuilder.ts`
- `src/openai/judgeResponseParser.ts`
- `src/openai/__tests__/judgePromptBuilder.test.ts`
- `src/openai/__tests__/judgeResponseParser.test.ts`

---

## Unit Tests (MUST)

### Prompt Builder

1. Correct inclusion of rubric.
2. Agent list rendered in workflow order.
3. Transcript rendered with correct indexing and spacing.

### Parser/Validator

Fixtures:

1. Valid ` ```json { ... } ``` ` parses successfully
2. Valid ` ``` { ... } ``` ` parses successfully
3. Missing code block → fails then retry invoked (mocked)
4. Scores missing an agent key → validation failure
5. Extra score key → validation failure
6. Score out of range → validation failure
7. Retry path succeeds on second response
8. Retry path fails → throws `Judge output invalid after retry`

Tests must mock fetch; no network calls.

---

## Acceptance Criteria

1. `createOpenAIJudgeCaller(config).callJudge()` performs a valid `POST /responses` request with locked prompt templates.
2. Parser extracts first fenced code block, parses JSON, and validates strict schema including agent keys and score range.
3. Exactly one retry occurs on parse/validation failure with the specified correction developer message.
4. On success, returns `JudgeDecision` compatible with the runner.
5. No judge content is ever routed to agents (enforced by architecture: runner consumes only `JudgeDecision`).
