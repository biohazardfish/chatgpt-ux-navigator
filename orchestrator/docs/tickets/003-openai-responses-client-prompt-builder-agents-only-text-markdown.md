## Ticket 003 — Server Responses Client + Prompt Builder (Agents Only, Text/Markdown)

### Goal

Implement the **`@repo/server` Responses API client** and **prompt builder** used to call _agents only_ (not the judge). This produces `callAgent()` compatible with Ticket 002.

Instead of calling OpenAI directly, this ticket calls `POST /responses/:clientId` on the local `@repo/server`, which forwards the prompt to a Chrome extension instance connected to a ChatGPT browser tab. The server returns an OpenAI-compatible SSE stream or JSON response.

This ticket is **locked to text/markdown only** and must not implement tool calling, function calling, structured outputs, or image inputs.

---

## Architecture Overview

```
callAgent()
    |
    v
POST /responses/<client_id>  (to @repo/server)
    |
    v
Server sends prompt via WebSocket to extension
    |
    v
Extension injects prompt into ChatGPT input, submits
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
callAgent() parses SSE stream, returns AgentCallOutput
```

---

## Deliverables

1. `callAgent(input: AgentCallInput): Promise<AgentCallOutput>` implementation backed by `POST /responses/:clientId` on the local server
2. Prompt builder that constructs the inbox bundle text according to `AGENTS.md`
3. SSE stream parser that extracts the final response text from the server's OpenAI-compatible events
4. Unit tests for prompt formatting and response extraction (mocked HTTP)

---

## Environment / Configuration

### Required config (from `AppConfig`)

- `config.server.url` — base URL of the local server (e.g. `http://localhost:8765`)
- `config.agents[agent_id].client_id` — the WebSocket clientId for each agent's browser tab

### No API keys required

Authentication is handled by the browser session in each ChatGPT tab. The orchestrator does not need any API keys.

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
export function createServerAgentCaller(config: AppConfig): {
    callAgent: (input: AgentCallInput) => Promise<AgentCallOutput>;
};
```

- The factory binds config and returns `callAgent`.
- Config is validated by Ticket 001; assume valid.

---

## HTTP Client Requirements (MUST)

- Use `fetch` available in Bun.
- Endpoint: `${config.server.url}/responses/${input.client_id}`
- Method: `POST`
- Headers:
    - `Content-Type: application/json`

- No `Authorization` header required (local server, no auth).

- Timeout: 120 seconds per request (implement with AbortController).
- Retries: **none** in v1 (fail fast).

On error responses:

- **400 Bad Request**: throw `Error("Server error: 400 - missing or invalid prompt for <agent_id> turn <n>")`
- **404 Not Found**: throw `Error("Server error: 404 - client '<client_id>' not connected for <agent_id> turn <n>")`
- **409 Conflict**: throw `Error("Server error: 409 - client '<client_id>' already has an inflight request for <agent_id> turn <n>")`
- Other non-2xx: throw `Error("Server error: <status> <body_snippet>")` (body_snippet truncated to 500 chars)

---

## Request Payload Spec (MUST)

The request body must be a JSON object:

```json
{
    "input": "<prompt_text>",
    "stream": true
}
```

Where `<prompt_text>` is the constructed prompt string (see Prompt Content below).

Notes:

- Always request `stream: true` to receive SSE events for real-time response tracking.
- The `input` field is a plain string, not an array of message objects. The server accepts this format directly.
- Do not include `model`, `temperature`, or other OpenAI-specific fields. The model is determined by the ChatGPT browser session.

---

## Prompt Content (MUST)

The prompt text sent as `input` must combine the agent's system persona with the inbox bundle into a single string.

### Format

```
<system_prompt>

---

<inbox_bundle>
```

Where:

- `<system_prompt>` is `config.agents[input.agent_id].system` (trimmed)
- The separator is exactly `\n\n---\n\n`
- `<inbox_bundle>` is built according to the rules below

### Developer preamble (included at top of inbox bundle)

The inbox bundle text MUST begin with:

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

After the developer preamble, append the inbox content.

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

## SSE Stream Parsing (MUST)

The server returns an SSE stream with `Content-Type: text/event-stream`. The events follow the OpenAI Responses API format.

### Event types to handle

| Event | Action |
|---|---|
| `response.created` | Ignore (informational) |
| `response.in_progress` | Ignore (informational) |
| `response.output_item.added` | Ignore (informational) |
| `response.content_part.added` | Ignore (informational) |
| `response.output_text.delta` | Accumulate `data.delta` into response text |
| `response.output_text.done` | Use `data.text` as the final text (preferred over accumulated deltas) |
| `response.content_part.done` | Ignore (redundant with output_text.done) |
| `response.output_item.done` | Ignore |
| `response.completed` | Mark response as complete; extract `data.response.output_text` as final result |
| `response.error` | Extract error message from `data` and throw |

### SSE frame parsing

Each SSE frame is:

```
event: <event_type>
data: <json_string>

```

- Parse each `data:` line as JSON.
- Handle the `data: [DONE]` sentinel as stream termination.

### Text extraction priority

1. If `response.completed` event received: use `data.response.output_text` as the final text.
2. Else if `response.output_text.done` event received: use `data.text`.
3. Else: use accumulated deltas from `response.output_text.delta` events.

### Post-processing

- `trimEnd()` only on the final extracted text.
- Validate: trimmed length >= 1, otherwise throw `Error("Server agent returned empty content: <agent_id> turn <n>")`.

Return:

```ts
{
    content: extractedText;
}
```

---

## JSON Mode Fallback

If the server responds with `Content-Type: application/json` instead of `text/event-stream` (e.g. when the server has `noStream` configured):

- Parse the response body as JSON.
- Extract text from `response.output_text`.
- Apply same post-processing and validation.

---

## Logging (MUST)

This ticket does not write run artifacts (Ticket 005), but it must support debug logging via an injected logger later.

For v1:

- No console logging from this module.
- Errors must include enough context (agent_id, client_id, turn).

---

## Files / Modules (MUST)

- `src/server/createServerAgentCaller.ts`
- `src/server/promptBuilder.ts`
- `src/server/sseParser.ts`
- `src/server/__tests__/promptBuilder.test.ts`
- `src/server/__tests__/sseParser.test.ts`

---

## Unit Tests (MUST)

### Prompt Builder

1. Inbox with 2 messages produces exact formatting including system prompt, separator, developer preamble, numbering, and final line.
2. Empty inbox produces the exact empty-inbox message with system prompt and developer preamble.
3. System prompt is trimmed in the output.

### SSE Parser

Provide mocked SSE stream fixtures:

1. Complete stream with `response.completed` event — extracts `output_text`
2. Stream with `output_text.done` but no `completed` — uses `data.text`
3. Stream with only deltas — accumulates correctly
4. Stream with `response.error` event — throws with error details
5. `[DONE]` sentinel terminates parsing
6. JSON mode response (non-streaming) — extracts text correctly

### Integration (mocked fetch)

1. Successful agent call with streaming response — returns content
2. 404 response — throws client-not-connected error
3. 409 response — throws inflight-conflict error
4. Timeout — throws after 120s

Tests must not call the network.

---

## Acceptance Criteria

1. `createServerAgentCaller(config).callAgent()` makes a correctly formed `POST /responses/:clientId` request with the prompt text.
2. Prompt formatting includes system prompt, developer preamble, and inbox bundle in exact format.
3. SSE stream is parsed correctly, accumulating deltas and using final text when available.
4. Error responses from the server (400, 404, 409) produce specific, actionable error messages.
5. No API keys, no OpenAI-specific fields, no tools or structured outputs.
6. Unit tests pass and validate prompt building, SSE parsing, and error handling.
