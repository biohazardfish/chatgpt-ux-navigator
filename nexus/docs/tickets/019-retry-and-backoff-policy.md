# Ticket 019 - Retry and Backoff Policy (Resilient Session Execution)

## Title

Retry and Backoff Policy (Resilient Session Execution)

## Goal

Introduce a **controlled retry and backoff mechanism** for session execution so Nexus can gracefully handle **transient failures** (network hiccups, server overload, model flakiness) without:

- Hiding errors
- Creating infinite loops
- Violating governance guarantees

This ticket improves **robustness**, not autonomy.

---

## Context

From earlier tickets:

- Session execution exists (013)
- Parallel execution exists (018)
- Failures currently block tasks immediately
- Governance expects clean, interpretable outcomes

In practice, some failures are **non-semantic** and safe to retry.

---

## Design principles

1. **Retries are explicit and bounded**
2. **Only retry transport-level failures**
3. **Never retry semantic failures** (e.g., malformed reports)
4. **All retries are observable and recorded**
5. **Final failure is still surfaced**

---

## Failure classification

Introduce explicit failure classes:

```ts
type RunFailureType =
    | 'network-error'
    | 'timeout'
    | 'server-error' // HTTP 5xx
    | 'client-error' // HTTP 4xx (never retry)
    | 'cancelled'
    | 'unknown';
```

Only the following are **retryable**:

- `network-error`
- `timeout`
- `server-error`

Never retry:

- `client-error`
- `cancelled`
- Report parse failures (handled later by governance)

---

## Retry policy (MVP)

Default policy (configurable):

- **Max retries**: `2`
- **Initial delay**: `500ms`
- **Backoff strategy**: exponential
    - delay = `initialDelay * 2^attempt`
- **Max delay cap**: `5000ms`
- **Jitter**: optional small random (+/- 20%)

---

## Configuration

Extend config (ticket 002 / 018):

- `NEXUS_RUN_MAX_RETRIES` (default: `2`)
- `NEXUS_RUN_RETRY_BASE_DELAY_MS` (default: `500`)
- `NEXUS_RUN_RETRY_MAX_DELAY_MS` (default: `5000`)

Expose via `Config`.

---

## Retry lifecycle

For a single role run:

1. Attempt run
2. If success → stop
3. If retryable failure:
    - Record attempt failure in run metadata
    - Wait backoff delay
    - Retry (increment attempt counter)
4. If max retries exceeded:
    - Mark run as failed
    - Propagate error upward

---

## Run metadata changes

Extend `runs/<run-id>/meta.json`:

```json
{
    "attempts": [
        {
            "attempt": 1,
            "startedAt": "...",
            "endedAt": "...",
            "status": "error",
            "failureType": "timeout"
        },
        {
            "attempt": 2,
            "startedAt": "...",
            "endedAt": "...",
            "status": "success"
        }
    ],
    "finalStatus": "success"
}
```

Notes:

- Previous tickets wrote flat metadata; this ticket **extends**, not replaces it
- Backward-compatible reading is acceptable (version check optional)

---

## API design

Introduce a retry wrapper:

```ts
interface RetryPolicy {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
}

async function executeWithRetry<T>(
    fn: () => Promise<T>,
    policy: RetryPolicy,
    onAttemptFailure: (info: AttemptFailureInfo) => void
): Promise<T>;
```

Used by:

- Session run executor (ticket 006)
- Parallel runner (ticket 018)

---

## Integration points

### Update run executor

- Wrap server execution in `executeWithRetry`
- Capture per-attempt metadata
- Persist final outcome

### Update parallel runner

- Retry applies **per role run**, not per task
- A run that eventually succeeds counts as success

---

## Error handling rules

- If all retries fail:
    - Mark run `error`
    - Propagate error to orchestration
- If cancellation occurs:
    - Do not retry
    - Mark failure as `cancelled`

---

## Out of scope

- Adaptive retry policies
- Rate-limit detection
- Retry based on report semantics
- User-configurable retry policies via TUI

---

## Proposed file structure

### New files

```
src/core/retry/
  policy.ts
  executor.ts
  types.ts
```

### Updated files

```
src/server/runExecutor.ts
src/core/orchestration/parallelRunner.ts
src/config/config.ts
```

---

## Implementation steps

1. Add retry-related config fields and defaults
2. Define failure classification logic
3. Implement `executeWithRetry`
4. Extend run metadata format to include attempts
5. Integrate retry wrapper into run executor
6. Ensure backward compatibility for older run metadata
7. Update error propagation paths

---

## Testing

Add tests under `test/retry/`:

- Retries on simulated network failure then success
- Stops retrying after max retries
- Does not retry on client error
- Backoff timing roughly respected (mock timers)
- Metadata correctly records attempts

Mock server execution and timing.

---

## Acceptance criteria (Definition of Done)

- [ ] Retry logic applies only to retryable failures
- [ ] Backoff is exponential and capped
- [ ] Attempts are recorded in run metadata
- [ ] Cancellation bypasses retry
- [ ] Integration with parallel execution works
- [ ] No infinite retry loops possible
- [ ] `bun test` passes

---

## Deliverables

- Retry and backoff implementation
- Extended run metadata
- Configurable retry parameters
- Tests validating behavior
