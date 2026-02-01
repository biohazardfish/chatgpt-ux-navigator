# Ticket 005 - Server Client: POST Prompts to Local Server

## Title

Server Client: POST Prompts to Local Server

## Goal

Implement a **minimal, reliable HTTP client** inside Nexus for sending prompts to the local server and receiving **plain-text responses**, forming the foundation for all session execution.

This ticket enables Nexus to:
- Send task prompts to the server via `POST /responses/:id`
- Associate responses with a logical **session run**
- Capture full text output (no streaming control logic yet)
- Fail cleanly and visibly on server errors

This is the **first execution-capable ticket**.

---

## Context

The local server exposes the following API:

```bash
POST http://localhost:8765/responses/<id>
Content-Type: application/json

{
  "input": "prompt text"
}
```

- `<id>` identifies a logical response channel (e.g. `planner`, `reviewer-1`)
- Response format is **plain text**, similar to OpenAI, but:
  - No system prompts
  - No tool calls
  - No structured JSON
- Streaming *may* exist, but MVP assumes we can buffer the full response

Nexus treats this server as an **execution backend**, not a source of authority.

---

## Requirements

### Functional
1. Provide a reusable function to POST prompt text to the server.
2. Allow the caller to specify:
   - `responseId` (string)
   - `promptText` (string)
3. Return the full response text as a string.
4. Surface HTTP and network errors clearly.
5. Respect `serverBaseUrl` from config (ticket 002).

### Non-functional
- No retries yet (added later).
- No concurrency control yet.
- No streaming UI integration yet.
- No prompt composition logic yet (caller provides full text).

---

## Out of scope
- Session orchestration
- Role-based prompt formatting
- Response parsing into reports
- Streaming or partial updates

---

## API design (internal)

Introduce a small client module.

```ts
interface ServerClient {
  postPrompt(params: {
    responseId: string
    input: string
    timeoutMs?: number
  }): Promise<string>
}
```

Recommended default timeout: **60s** (configurable later).

---

## Error handling rules

The client **must**:

- Throw on non-2xx HTTP responses
- Include:
  - HTTP status
  - response body (if available)
  - request URL
- Throw on network errors or timeouts
- Never swallow errors silently

Errors should be suitable for:
- Display in TUI
- Logging to local logs (later)

---

## Proposed file structure

### New files
```
src/server/client.ts
```

### Optional (if useful)
```
src/server/errors.ts
```

---

## Implementation details

### HTTP implementation
- Use Bun’s native `fetch`
- JSON body:
  ```ts
  JSON.stringify({ input })
  ```
- Headers:
  ```ts
  {
    'Content-Type': 'application/json'
  }
  ```

### URL construction
```ts
const url = `${config.serverBaseUrl}/responses/${responseId}`
```

- Ensure no double slashes
- Do not URL-encode `responseId` silently; validate it instead

---

## Validation

Before sending the request:

- `responseId`
  - Non-empty
  - Matches `/^[a-zA-Z0-9._-]+$/`
- `input`
  - Non-empty string

Throw immediately on invalid input.

---

## Logging (minimal)

For MVP:
- `console.debug` on request start (id + length)
- `console.debug` on success (id + response length)
- `console.error` on failure

No structured logging required yet.

---

## Testing

Add tests under `test/server/`:

### Unit tests
- Invalid `responseId` rejected
- Empty input rejected

### Integration-style test (mocked)
- Mock `fetch` to:
  - Return 200 + text → client returns text
  - Return 500 → client throws with status
  - Simulate timeout → client throws

> Do **not** depend on a running real server for tests.

---

## Acceptance criteria (Definition of Done)

- [ ] `postPrompt` sends POST requests to `/responses/:id`
- [ ] Response body is returned as plain text
- [ ] Errors are thrown with actionable information
- [ ] Input validation prevents malformed requests
- [ ] Tests cover success and failure cases
- [ ] No orchestration or parsing logic included

---

## Deliverables

- `src/server/client.ts` implemented
- Tests under `test/server/`
- Minimal documentation/comments explaining usage
