# Orchestrator Debug Logging

This document describes the debug logging features added to help diagnose `agent_failure` and other issues during long-running conversations.

## Quick Start

### Enable Debug Mode

Run the orchestrator with the `--debug` flag to enable verbose logging:

```bash
bun run src/cli.ts examples/debate.yml --debug
```

### Log Output Locations

When a run executes, logs are written to two places:

1. **Console** (if `--debug` is enabled): Debug logs print to stderr in real-time
2. **logs.jsonl**: Structured JSONL file in the run directory at `runs/<run_folder>/logs.jsonl`

## Log File Format

The `logs.jsonl` file contains one JSON object per line. Each log entry has the following structure:

```json
{
  "timestamp": "2026-02-09T10:30:45.123Z",
  "level": "debug|info|warn|error",
  "category": "runner|agent_caller|judge_caller|logger",
  "event": "turn_start|agent_call|http_response|etc",
  "data": { 
    /* event-specific structured data */
    /* may include error_details object for errors */
  },
  "error": "optional error message string"
}
```

### Error Handling

When errors occur, the log entry includes:
- **error**: The main error message as a string
- **data.error_details**: An object with additional error context (name, stack, raw error data)

This ensures error objects are properly serialized and inspectable in the logs.

### Log Levels

- **debug**: Verbose diagnostic information (only in debug mode)
- **info**: Important operational events (always logged)
- **warn**: Warnings that don't stop execution (always logged + printed)
- **error**: Errors and failures (always logged + printed)

### Log Categories

- **runner**: Core orchestration logic in `runConversation`
- **agent_caller**: HTTP calls to agents via the server
- **judge_caller**: HTTP calls to the judge via the server
- **logger**: Run initialization and file operations

## Key Events to Monitor

### For `agent_failure` Debugging

When debugging `agent_failure` stop reasons, look for these event sequences:

1. **agent_call_failed** (runner category)
   - Indicates which agent failed and on which turn
   - Includes `agent_id`, `client_id`, `turn`, `round`
   - Contains the error message

2. **abort_after_round_scheduled** (runner category)
   - Shows when the orchestrator decides to abort after the current round
   - Includes `turn`, `round`, `reason`

3. **run_stopped_by_agent_failure** (runner category)
   - Final event before the run terminates
   - Includes `round` and `total_turns`

### HTTP Request/Response Tracking

Each agent or judge call generates detailed HTTP logs:

**Request sequence:**
- `call_start` → `prompt_built` → `http_request` → `http_response` → `call_success`

**On error:**
- `http_error` or `timeout` or `call_failed`

### Important Data Fields

- **agent_id**: Which agent is speaking
- **client_id**: WebSocket client ID for the browser tab
- **turn**: Turn number (1-based)
- **round**: Round number (1-based, one round = all agents speak once)
- **response_time_ms**: How long the HTTP request took
- **status**: HTTP status code
- **content_length**: Size of the response
- **inbox_size**: Number of messages in the agent's inbox

## Example: Diagnosing an `agent_failure`

### Scenario

Your run stops with `agent_failure` after 20 turns. Here's how to debug:

### Step 1: Find the logs.jsonl file

```bash
cd runs
ls -ltr  # Find the most recent run folder
cd <run_folder>
cat logs.jsonl | jq .  # Pretty-print the logs
```

### Step 2: Filter for errors

```bash
cat logs.jsonl | jq 'select(.level == "error")'
```

Example output:

```json
{
  "timestamp": "2026-02-09T10:35:22.456Z",
  "level": "error",
  "category": "agent_caller",
  "event": "timeout",
  "data": {
    "agent_id": "critic",
    "client_id": "abc123",
    "turn": 18,
    "timeout_ms": 120000,
    "elapsed_ms": 120003
  },
  "error": "Request timed out after 120 seconds"
}
```

**Diagnosis**: Agent `critic` timed out on turn 18 after 120 seconds.

### Step 3: Inspect Full Error Details

For errors with additional context, check the `error_details` field in the data:

```bash
cat logs.jsonl | jq 'select(.level == "error") | {event, agent: .data.agent_id, error, details: .data.error_details}'
```

This shows the error name, stack trace (if available), and any raw error data that was serialized.

Look for repeated failures from the same agent or client:

```bash
cat logs.jsonl | jq 'select(.level == "error") | .data.agent_id' | sort | uniq -c
```

### Step 5: Trace the full request

Find all events for a specific turn:

```bash
cat logs.jsonl | jq 'select(.data.turn == 18)'
```

This shows the complete timeline: when the call started, the prompt size, HTTP request/response details, and where it failed.

## Common Failure Patterns

### 1. Timeout (120 seconds)

**Event:** `agent_caller/timeout` or `judge_caller/timeout`

**Cause:** The ChatGPT tab is not responding (frozen, network issues, or genuinely slow response)

**What to check:**
- Is the browser tab still open?
- Is the extension still connected? (check server logs)
- Is ChatGPT actually responding in the UI?

### 2. Client Not Connected (404)

**Event:** `agent_caller/http_error` with `status: 404`

**Cause:** The WebSocket client disconnected from the server

**What to check:**
- Did the browser tab close?
- Did the extension crash or get disabled?
- Check server logs for disconnect events

### 3. Inflight Request Conflict (409)

**Event:** `agent_caller/http_error` with `status: 409`

**Cause:** The client already has a pending request (previous turn didn't finish)

**What to check:**
- Is the agent stuck on a previous response?
- Did a previous turn hang and never complete?

### 4. Empty Response

**Event:** `agent_caller/call_success` with `content_length: 0` or empty response error

**Cause:** ChatGPT returned an empty response

**What to check:**
- Check the prompt that was sent (`prompt_length` in the logs)
- Look at the agent's system prompt and inbox in the message files
- Check for `response.error` events in the SSE stream (logged with full error details)
- ChatGPT might have hit a content filter or error state

### 5. Server Error Events

**Event:** `response.error` in SSE stream

**Cause:** The ChatGPT API returned an error event in the stream

**What to check:**
- The error message will include full error details from the server
- Common causes: rate limits, content policy violations, network issues
- Check the browser console in the ChatGPT tab for additional context

## Advanced Analysis

### Using jq for Complex Queries

**Find all turns with response time > 30 seconds:**

```bash
cat logs.jsonl | jq 'select(.data.response_time_ms > 30000)'
```

**Group errors by category:**

```bash
cat logs.jsonl | jq 'select(.level == "error") | .category' | sort | uniq -c
```

**Extract timeline for a specific agent:**

```bash
cat logs.jsonl | jq 'select(.data.agent_id == "advocate")'
```

**Check judge evaluation frequency:**

```bash
cat logs.jsonl | jq 'select(.category == "judge_caller" and .event == "call_success")'
```

## Performance Monitoring

The logs include timing information for all HTTP requests:

```bash
# Find slowest agent calls
cat logs.jsonl | jq 'select(.event == "call_success") | {agent: .data.agent_id, turn: .data.turn, time_ms: .data.response_time_ms}' | jq -s 'sort_by(.time_ms) | reverse | .[:10]'
```

This helps identify if certain agents are consistently slow, which might lead to timeouts.

## Log Rotation

The `logs.jsonl` file grows with each event. For very long runs (hundreds of turns), the file can become large.

**Estimated size:**
- ~500-1000 bytes per turn (depending on verbosity)
- 1000 turns ≈ 500KB - 1MB

No automatic rotation is implemented. If needed, you can manually analyze/compress old logs.

## Troubleshooting the Logger Itself

If logs are not being written:

1. Check that the run directory was created successfully
2. Verify file permissions on the `out_dir`
3. Look for console errors about failed log writes (these print to stderr)

The logger is designed to be **fail-safe**: if a log write fails, it prints an error but doesn't crash the run.

## Integration with Existing Artifacts

The `logs.jsonl` file complements the existing run artifacts:

```
runs/<run_folder>/
  ├── config.yml       # Exact config used
  ├── run.json         # Metadata + stop reason
  ├── transcript.md    # Full conversation
  ├── logs.jsonl       # Structured debug logs (NEW)
  ├── messages/        # Individual turn files
  └── judge/           # Evaluation records
```

Use `logs.jsonl` to understand **what happened internally**, and the other files to review **what was said**.

## Summary

Debug logging provides deep visibility into:
- HTTP request/response timing and errors
- Agent call sequences and failures
- Judge evaluation results
- Round and turn progression
- Inbox delivery and message queuing

Enable with `--debug` for console output, or always check `logs.jsonl` in the run directory for post-mortem analysis.
