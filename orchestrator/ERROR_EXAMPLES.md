# Error Log Examples

This document shows examples of what error logs look like with the improved error handling.

## Example 1: Server Error Event

When ChatGPT returns a `response.error` event in the SSE stream:

**Console output (with --debug):**
```
[2026-02-09T14:04:05.190Z] [ERROR] [agent_caller/call_failed] 
{
  "agent_id": "writer_staff",
  "client_id": "client-4",
  "turn": 3,
  "elapsed_ms": 5432,
  "error_details": {
    "name": "Error"
  }
} 
ERROR: Server agent error for writer_staff turn 3: Rate limit exceeded
Details: {
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded",
  "code": "rate_limit",
  "retry_after": 60
}
```

**logs.jsonl entry:**
```json
{
  "timestamp": "2026-02-09T14:04:05.190Z",
  "level": "error",
  "category": "agent_caller",
  "event": "call_failed",
  "data": {
    "agent_id": "writer_staff",
    "client_id": "client-4",
    "turn": 3,
    "elapsed_ms": 5432,
    "error_details": {
      "name": "Error"
    }
  },
  "error": "Server agent error for writer_staff turn 3: Rate limit exceeded\nDetails: {\n  \"error\": \"rate_limit_exceeded\",\n  \"message\": \"Rate limit exceeded\",\n  \"code\": \"rate_limit\",\n  \"retry_after\": 60\n}"
}
```

## Example 2: HTTP 404 (Client Disconnected)

When the browser tab closes or extension disconnects:

**Console output:**
```
[2026-02-09T14:10:22.333Z] [ERROR] [agent_caller/http_error] 
{
  "agent_id": "advocate",
  "client_id": "client-2",
  "turn": 15,
  "status": 404,
  "error_snippet": "Client not found: client-2"
}

[2026-02-09T14:10:22.335Z] [ERROR] [agent_caller/call_failed] 
{
  "agent_id": "advocate",
  "client_id": "client-2",
  "turn": 15,
  "elapsed_ms": 234,
  "error_details": {
    "name": "Error"
  }
}
ERROR: Server error: 404 - client 'client-2' not connected for advocate turn 15
```

**logs.jsonl entries:**
```json
{"timestamp":"2026-02-09T14:10:22.333Z","level":"error","category":"agent_caller","event":"http_error","data":{"agent_id":"advocate","client_id":"client-2","turn":15,"status":404,"error_snippet":"Client not found: client-2"}}
{"timestamp":"2026-02-09T14:10:22.335Z","level":"error","category":"agent_caller","event":"call_failed","data":{"agent_id":"advocate","client_id":"client-2","turn":15,"elapsed_ms":234,"error_details":{"name":"Error"}},"error":"Server error: 404 - client 'client-2' not connected for advocate turn 15"}
```

## Example 3: Timeout (120 seconds)

When an agent call times out:

**Console output:**
```
[2026-02-09T14:15:45.678Z] [ERROR] [agent_caller/timeout] 
{
  "agent_id": "critic",
  "client_id": "client-3",
  "turn": 22,
  "timeout_ms": 120000,
  "elapsed_ms": 120003
}
ERROR: Request timed out after 120 seconds
```

**logs.jsonl entry:**
```json
{
  "timestamp": "2026-02-09T14:15:45.678Z",
  "level": "error",
  "category": "agent_caller",
  "event": "timeout",
  "data": {
    "agent_id": "critic",
    "client_id": "client-3",
    "turn": 22,
    "timeout_ms": 120000,
    "elapsed_ms": 120003
  },
  "error": "Request timed out after 120 seconds"
}
```

## Example 4: HTTP 409 (Inflight Request Conflict)

When a client already has a pending request:

**Console output:**
```
[2026-02-09T14:20:10.111Z] [ERROR] [agent_caller/http_error] 
{
  "agent_id": "mediator",
  "client_id": "client-1",
  "turn": 18,
  "status": 409,
  "error_snippet": "Client client-1 already has an inflight request"
}
```

## Example 5: Parse Error (JSON Parsing Failed)

When response parsing fails:

**Console output:**
```
[2026-02-09T14:25:33.222Z] [ERROR] [agent_caller/call_failed] 
{
  "agent_id": "analyst",
  "client_id": "client-5",
  "turn": 7,
  "elapsed_ms": 8234,
  "error_details": {
    "name": "Error"
  }
}
ERROR: Failed to parse JSON response for analyst turn 7: Unexpected token < in JSON at position 0
```

## How to Read These Logs

### 1. Use jq to pretty-print JSONL

```bash
cat logs.jsonl | jq .
```

### 2. Filter by error level

```bash
cat logs.jsonl | jq 'select(.level == "error")'
```

### 3. Extract just the error messages

```bash
cat logs.jsonl | jq 'select(.level == "error") | .error'
```

### 4. Group errors by type

```bash
cat logs.jsonl | jq 'select(.level == "error") | .event' | sort | uniq -c
```

### 5. Find errors for a specific agent

```bash
cat logs.jsonl | jq 'select(.level == "error" and .data.agent_id == "writer_staff")'
```

### 6. Extract error details

```bash
cat logs.jsonl | jq 'select(.level == "error") | {
  agent: .data.agent_id, 
  turn: .data.turn, 
  event: .event, 
  error: .error,
  details: .data.error_details
}'
```

## Benefits of the Improved Error Handling

1. **No more `[object Object]`**: All errors are properly serialized as strings
2. **Full error context**: The `error_details` field preserves error name, stack traces, and raw error data
3. **SSE error details**: When ChatGPT returns error events, the full JSON error object is logged
4. **Structured and searchable**: All error information is in the JSONL format for easy filtering
5. **Human-readable**: The main error message is always a readable string
6. **Debuggable**: Stack traces are included when available
