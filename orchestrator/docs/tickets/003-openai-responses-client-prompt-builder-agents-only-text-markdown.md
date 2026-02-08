## Ticket 003 — OpenAI Responses Client + Prompt Builder (Agents Only, Text/Markdown)

### Goal

Implement the **OpenAI Responses API client** and **prompt builder** used to call _agents only_ (not the judge). This produces `callAgent()` compatible with Ticket 002.

This ticket is **locked to text/markdown only** and must not implement tool calling, function calling, structured outputs, or image inputs.

---

## Deliverables

1. `callAgent(input: AgentCallInput): Promise<AgentCallOutput>` implementation backed by OpenAI `POST /responses`
2. Prompt builder that constructs messages according to `AGENTS.md`
3. Strict output extraction from Responses API into plain markdown string
4. Unit tests for prompt formatting and output extraction (mocked HTTP)

---

## Environment / Configuration

### Required env vars

- `OPENAI_API_KEY` (string, required)

### Optional env vars (v1)

- `OPENAI_BASE_URL` (string, optional; default `https://api.openai.com/v1`)

If required env var missing, exported factory must throw at initialization time with a clear error.

---

## Interfaces (MUST)

### Imports from runner types (Ticket 002)

Use these exact types:

```ts
import type {AgentCallInput, AgentCallOutput, InboxItem} from '../runner/types';
import type {AppConfig} from '../config/types';
```

### Public factory (MUST)

```ts
export function createOpenAIAgentCaller(config: AppConfig): {
    callAgent: (input: AgentCallInput) => Promise<AgentCallOutput>;
};
```

- The factory binds config and returns `callAgent`.
- Config is validated by Ticket 001; assume valid.

---

## HTTP Client Requirements (MUST)

- Use `fetch` available in Bun.
- Endpoint: `${baseUrl}/responses`
- Method: `POST`
- Headers:
    - `Authorization: Bearer ${OPENAI_API_KEY}`
    - `Content-Type: application/json`

- Timeout: 120 seconds per request (implement with AbortController).
- Retries: **none** in v1 (fail fast).

On non-2xx response:

- throw `Error("OpenAI error: <status> <body_snippet>")`
- body_snippet must be truncated to 500 chars.

---

## Request Payload Spec (MUST)

### Model selection

- Use `config.agents[input.agent_id].model`

### Input message format

Use Responses API `input` as an array of message objects. **Do not** use tools or response_format.

Required message sequence:

1. `system` — agent system persona from config (trimmed)
2. `developer` — framework constraints (exact content defined below)
3. `user` — inbox bundle (exact content defined below)

Payload shape (representative):

```json
{
    "model": "<agent-model>",
    "input": [
        {"role": "system", "content": [{"type": "text", "text": "..."}]},
        {"role": "developer", "content": [{"type": "text", "text": "..."}]},
        {"role": "user", "content": [{"type": "text", "text": "..."}]}
    ]
}
```

Notes:

- Use the Responses API “content as array of parts” style, with `type:"text"`.
- No other fields are allowed in v1 (do not set temperature, top_p, etc.).

---

## Prompt Content (MUST)

### Developer message (exact template)

The developer message text MUST be:

```
You are an AI agent participating in a multi-agent conversation run.
Follow these rules:
- Respond in Markdown.
- Do not mention any judge, scoring, or termination logic.
- Only use the messages you received to decide your response.
- Be concise but complete.
```

(Use exactly these lines and punctuation.)

### User message: Inbox Bundle (exact format)

Build the user message text as follows.

If `input.inbox.length > 0`:

```
You are about to speak. Here are the messages you received since you last spoke (oldest to newest):

[1] From: <from> (turn <turn>)
<content>

[2] From: <from> (turn <turn>)
<content>

...
Now write your response.
```

Rules:

- Numbered brackets `[1]`, `[2]`, ...
- `<from>` is `InboxItem.from` exactly (`"user"` or agent id)
- `<turn>` is `InboxItem.turn` (seed is 0)
- `<content>` is included verbatim (do not trim internal whitespace)
- Separate items with a single blank line.
- End with exactly: `Now write your response.` on its own line.

If `input.inbox.length === 0`:

```
You are about to speak. You have received no messages.
Write a response that is appropriate as the next turn in this conversation.
```

---

## Response Parsing (MUST)

The Responses API returns a JSON object. Extract the assistant text as:

1. Prefer `output_text` if present and is a non-empty string.
2. Otherwise, extract from `output` array:
    - find the first `message` item
    - concatenate all `content` parts where `type === "output_text"` or `type === "text"` into a single string, in order

3. Trim only trailing whitespace at the end of the final string (`trimEnd()`).
4. Validate:
    - resulting content trimmed length ≥ 1
    - otherwise throw `Error("OpenAI agent returned empty content: <agent_id> turn <n>")`

Return:

```ts
{
    content: extractedText;
}
```

---

## Logging (MUST)

This ticket does not write run artifacts (Ticket 005), but it must support debug logging via an injected logger later.

For v1:

- No console logging from this module.
- Errors must include enough context (agent_id, turn).

---

## Files / Modules (MUST)

- `src/openai/createOpenAIAgentCaller.ts`
- `src/openai/promptBuilder.ts`
- `src/openai/responseParser.ts`
- `src/openai/__tests__/promptBuilder.test.ts`
- `src/openai/__tests__/responseParser.test.ts`

---

## Unit Tests (MUST)

### Prompt Builder

1. Inbox with 2 messages produces exact formatting including numbering and final line.
2. Empty inbox produces the exact empty-inbox message.

### Response Parser

Provide mocked API response JSON fixtures:

1. Case with `output_text` present
2. Case without `output_text` but with `output[].content[]` parts
3. Case with empty output → throws

Tests must not call the network.

---

## Acceptance Criteria

1. `createOpenAIAgentCaller(config).callAgent()` makes a correctly formed `POST /responses` request with the required message sequence and content.
2. Prompt formatting matches the exact templates.
3. Response parsing returns a non-empty markdown string or throws with specified errors.
4. No tools, structured outputs, or extra request fields are used.
5. Unit tests pass and validate prompt and parsing behavior.
