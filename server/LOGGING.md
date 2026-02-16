# Server Logging Guide

This document defines how debug logging works in `@repo/server`.

## Goals

- Keep debug output useful without flooding the console.
- Preserve enough detail to investigate SSE stream issues.
- Persist diagnostics to JSONL for post-mortem debugging.

## Flags

- `DEBUG`: master switch for debug behavior.
- `DEBUG_LOG_DIR`: JSONL output directory (default `./logs`).

When `DEBUG=false`, debug logs are disabled.

## Output Strategy

Debug logging is split into two internal channels:

1. `summary` logs (`debugSummary`) for high-signal lifecycle events.
2. `raw` logs (`debugRaw`) for sampled or forced payload-level diagnostics.

### Console output

- Console prints only non-debug levels (`info`, `warn`, `error`) from the debug logger.
- Routine debug entries go to JSONL, not console.

### JSONL output

- Always receives summary events while debug is enabled.
- Receives raw events only when sampled or forced.
- Writes one file per client id using `server-debug-<client_id>.jsonl`.
- Rotates each client file when it reaches `100_000` lines.

## JSONL Schema

Each line is one object:

```json
{
    "timestamp": "2026-02-14T12:00:00.000Z",
    "level": "debug",
    "category": "sse.summary",
    "event": "text_update",
    "meta": {}
}
```

## SSE Logging Policy

Categories used for SSE diagnostics:

- `sse.summary`
- `sse.raw`

### Summary events

`sse.summary` records compact metadata such as:

- `clientId`
- `responseId`
- `op`
- `type`
- `conversationId`
- `hasImagePointer`
- `textLen`
- `mode`
- `imageFileIds` (when image pointers are present)

Image-specific summary markers:

- `image_frame`: emitted when SSE includes image asset pointer updates, and when an image-request stream reaches `message_stream_complete`.

Rollups are emitted at completion with:

- `totalFrames`
- `textFrames`
- `patchFrames`
- `noopFrames`
- `sampledRawFrames`
- `durationMs`

### Raw events

`sse.raw` is sampled by default (`1 in 20` frames).

For image debugging, `sse.raw` emits forced `image_frame` records so image pointer transitions are always captured.

Raw context is buffered per inflight request (last 50 entries) and forced to JSONL on error paths (timeout, extension error, websocket closed, image save failure).

## Sanitization Rules

Before writing logs:

- Large strings are truncated (`500` chars max).
- Object keys are capped (`40` max).
- Arrays are capped (`20` items).
- Keys matching `base64` are redacted to length metadata.

This keeps logs safe and manageable while preserving debugging value.

## Recommended Debug Workflow

1. Set `DEBUG=true`.
2. Reproduce the issue once.
3. Inspect the generated client files inside `DEBUG_LOG_DIR` (for example `server-debug-<client_id>.jsonl`) for:
    - request/inflight summary lifecycle
    - SSE summary transitions
    - completion rollup
    - forced raw error context (if failures occurred)
