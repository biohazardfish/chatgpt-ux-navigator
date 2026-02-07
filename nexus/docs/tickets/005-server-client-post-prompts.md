# Ticket 005 - Server Client: POST Prompts to Local Server

## Title

Server Client: POST Prompts to Local Server

## Goal

Implement a **minimal, reliable HTTP client** inside Nexus for sending prompts to the local server and receiving **buffered JSON responses** (no Nexus-side SSE parsing / streaming UI), forming the foundation for all session execution.

This ticket enables Nexus to:

- Send task prompts to the server via `POST /responses/:clientId/new` (default: temporary chat per run)
- Associate responses with a logical **session run**
- Capture the full JSON response body (buffered; no streaming control logic yet)
- Fail cleanly and visibly on server errors

This is the **first execution-capable ticket**.

---

## Context

The local server exposes the following API:

```bash
POST http://localhost:8765/responses/<clientId>/new
Content-Type: application/json

{
  "input": "prompt text"
}
```

- `<clientId>` identifies a logical response channel (e.g. `planner`, `reviewer-1`)
- **Default behavior (MVP):** use `/new` to start a temporary chat per run.
- **Carryover (opt-in):** reuse an existing chat by posting to `POST /responses/<clientId>` (no `/new`).
- Response format is **JSON** and must be handled as a **buffered JSON** response in Nexus (no Nexus-side SSE parsing / streaming UI in MVP).

Nexus treats this server as an **execution backend**, not a source of authority.

---

## Requirements

### Functional

1. Provide a reusable function to POST prompt text to the server.
2. Allow the caller to specify:
    - `clientId` (string)
    - `promptText` (string)
3. Return the buffered JSON response body.
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
    // Default (MVP): create a temporary chat per run.
    postPromptNew(params: {clientId: string; input: string; timeoutMs?: number}): Promise<unknown>;

    // Opt-in carryover: reuse an existing chat.
    postPrompt(params: {clientId: string; input: string; timeoutMs?: number}): Promise<unknown>;
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
    JSON.stringify({input});
    ```
- Headers:
    ```ts
    {
      'Content-Type': 'application/json'
    }
    ```

### URL construction

```ts
const urlNew = `${config.serverBaseUrl}/responses/${clientId}/new`;
const urlCarryover = `${config.serverBaseUrl}/responses/${clientId}`;
```

- Ensure no double slashes
- Do not URL-encode `clientId` silently; validate it instead

---

## Validation

Before sending the request:

- `clientId`
    - Non-empty
    - Matches `/^[a-zA-Z0-9._-]+$/`
- `input`
    - Non-empty string

Throw immediately on invalid input.

---

## Logging (minimal)

For MVP:

- `console.debug` on request start (`clientId` + input length)
- `console.debug` on success (`clientId` + response size)
- `console.error` on failure

No structured logging required yet.

---

## Testing

Add tests under `test/server/`:

### Unit tests

- Invalid `clientId` rejected
- Empty input rejected

### Integration-style test (mocked)

- Mock `fetch` to:
    - Return 200 + JSON → client returns parsed JSON
    - Return 500 → client throws with status
    - Simulate timeout → client throws

> Do **not** depend on a running real server for tests.

---

## Acceptance criteria (Definition of Done)

- [ ] `postPromptNew` sends POST requests to `/responses/:clientId/new`
- [ ] (Opt-in) `postPrompt` sends POST requests to `/responses/:clientId`
- [ ] Response body is returned as buffered JSON (no Nexus-side SSE parsing / streaming UI)
- [ ] Errors are thrown with actionable information
- [ ] Input validation prevents malformed requests
- [ ] Tests cover success and failure cases
- [ ] No orchestration or parsing logic included

---

## Deliverables

- `src/server/client.ts` implemented
- Tests under `test/server/`
- Minimal documentation/comments explaining usage
