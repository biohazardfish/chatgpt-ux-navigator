## Ticket 005 — Run Logging & Output Artifacts (run folder, transcript.md, per-turn md, judge json, run.json)

### Goal

Implement **local run artifact writing** for each execution:

- create a run output folder,
- persist the **exact config used**,
- write a **stitched transcript** (`transcript.md`),
- write **one markdown file per turn** (`messages/NNNN_agent.md`),
- write **one judge JSON file per turn** (`judge/NNNN.json`) when enabled,
- write final **run metadata** (`run.json`) including stop reason.

This ticket defines the **only** on-disk format for v1. Do not add additional files or alternate formats.

---

## Architecture Context

The orchestrator sends prompts to the `@repo/server` via `POST /responses/:clientId`, which forwards them to Chrome extension instances connected to ChatGPT browser tabs. Each agent is identified by a `client_id` (not a model name). The model selection happens in the browser, so logging records `client_id` instead of `model` for each agent.

---

## Deliverables

1. `RunLogger` module that manages run folder creation and file writes
2. Integration points (function signatures) for runner orchestration
3. Deterministic file naming and append behavior
4. Unit tests (write to temp directory; no snapshots required)

---

## File/Folder Layout (MUST)

Given:

- `config.run.out_dir` (default `"runs"`)
- `config.run.id` (default derived by Ticket 001)

Create a folder:

```
<out_dir>/<run_folder_name>/
  config.yml
  run.json
  transcript.md
  messages/
    0001_<speaker>.md
    0002_<speaker>.md
    ...
  judge/
    0001.json
    0002.json
    ...
```

### `run_folder_name` (MUST)

Format:

```
<ISO8601_UTC_BASIC>_<run_id>
```

Where:

- `<ISO8601_UTC_BASIC>` is UTC time at run start formatted exactly:
    - `YYYY-MM-DDTHH-mm-ssZ`
    - Example: `2026-02-08T14-32-10Z`

- `<run_id>` is `config.run.id` as provided/derived

Example:
`runs/2026-02-08T14-32-10Z_my-run/`

---

## Required Module API (MUST)

Create:

```ts
import type {AppConfig} from '../config/types';
import type {AgentMessage, JudgeDecision} from '../runner/types';

export type RunLogger = {
    runDir: string; // absolute or normalized path to run folder

    writeTurn: (msg: AgentMessage, received_turns: number[]) => Promise<void>;

    writeJudge: (turn: number, decision: JudgeDecision, created_at: string) => Promise<void>;

    finalize: (result: {
        stop_reason: 'max_turns' | 'judge_stop';
        total_turns: number;
        started_at: string;
        ended_at: string;
    }) => Promise<void>;
};

export async function createRunLogger(params: {
    configPath: string; // original config file path provided to CLI
    configText: string; // exact YAML text read from disk
    config: AppConfig; // normalized config
    started_at: string; // deps.nowISO() at run start
}): Promise<RunLogger>;
```

Notes:

- `configText` must be written verbatim to `config.yml`.
- `received_turns` is an ordered list of originating turn numbers delivered to the speaker inbox for that turn (seed is 0). Runner provides this.

---

## Write Rules (MUST)

### Folder creation

- Ensure `<out_dir>` exists (create if missing).
- Create run folder and required subfolders:
    - `messages/`
    - `judge/` (always create, even if judge disabled)

If run folder already exists, fail immediately:

- throw `Error("Run folder already exists: <path>")`

### `config.yml`

- Write once at run start with exact `configText` content.

### `messages/NNNN_<speaker>.md`

For each agent message turn `N`:

- File name:
    - `NNNN` is zero-padded to width 4 (turn 1 => `0001`)
    - speaker is the agent id exactly
    - Example: `0007_A.md`

- File content (exact format):

```md
---
turn: <turn>
speaker: <speaker>
client_id: <client_id>
created_at: <created_at>
received_turns: [<t1>, <t2>, ...]
---

<content>
```

Rules:

- `<client_id>` is the `client_id` configured for that speaker in `config.agents[speaker].client_id`
- `received_turns` must be a JSON array on one line.
- After the closing `---` line, include exactly one blank line, then `<content>` verbatim.
- Ensure file ends with a trailing newline.

### `transcript.md`

- `transcript.md` is append-only.
- For each turn, append exactly:

```md
## Turn <NNNN> — <speaker>

<content>
```

Rules:

- `<NNNN>` is zero-padded width 4
- There is exactly one blank line after the heading and exactly one blank line after the content (i.e., transcript entries separated by a blank line).
- Ensure file ends with a trailing newline.

### `judge/NNNN.json`

When judge is enabled:

- write one file per evaluated turn number N.
- File name uses the same 4-digit padding.
- File content must be valid JSON with keys:

```json
{
  "turn": <number>,
  "created_at": "<iso>",
  "should_stop": <boolean>,
  "scores": { "<agent_id>": <number> },
  "reason": "<string>"
}
```

Rules:

- Exactly these keys and no others.
- `scores` keys must be in workflow order in the JSON output.
    - Implementation must serialize in that order (construct object accordingly).

- Ensure file ends with trailing newline.

When judge is disabled:

- do not write any `judge/*.json` files (folder still exists).

### `run.json` (written in finalize)

Write once at end of run:

```json
{
  "run_id": "<config.run.id>",
  "started_at": "<iso>",
  "ended_at": "<iso>",
  "stop_reason": "max_turns" | "judge_stop",
  "total_turns": <number>,
  "server": {
    "url": "<config.server.url>"
  },
  "agents": [
    { "id": "<agent_id>", "client_id": "<client_id>" }
  ],
  "workflow": {
    "type": "round_robin",
    "order": ["A", "B", "C"],
    "start": "<agent_id>"
  },
  "delivery": { "type": "next_speaker" },
  "judge": {
    "enabled": <boolean>,
    "client_id": "<client_id-or-empty>"
  },
  "termination": {
    "max_turns": <number>,
    "judge_stop": <boolean>
  }
}
```

Rules:

- `agents` array must be in workflow order.
- If judge is disabled, set `"client_id": ""` (empty string).
- Ensure trailing newline.

---

## Integration Requirements (MUST)

Runner integration will call:

- `createRunLogger(...)` once at run start
- `writeTurn(...)` immediately after each agent message appended to transcript
- `writeJudge(...)` immediately after each judge decision (if enabled)
- `finalize(...)` once after run ends successfully

No writes occur if the runner throws due to dependency or server errors beyond what was already written for completed turns.

---

## Concurrency / Atomicity (MUST)

- Writes are sequential (await each write).
- Each per-turn file write must be atomic:
    - write to a temp file in the same directory and rename to final name.

Implement temp naming:

- `<final>.tmp`

Ensure rename overwrites are not allowed; if target exists, throw.

---

## Path Handling (MUST)

- Use Node-compatible path utilities available in Bun.
- All created paths must be platform-safe (no hardcoded `/` joins).
- `runDir` returned by logger must be the resolved path to the run folder.

---

## Files / Modules (MUST)

- `src/logging/createRunLogger.ts`
- `src/logging/RunLogger.ts` (types/helpers if needed)
- `src/logging/__tests__/runLogger.test.ts`

---

## Unit Tests (MUST)

Use a temporary directory per test.

1. **Creates folder structure**
    - out_dir + run folder + messages + judge folders exist
    - config.yml written exactly

2. **Writes one turn**
    - verify `messages/0001_A.md` exact format including frontmatter fields (`client_id` instead of `model`)
    - verify `transcript.md` appended format

3. **Writes judge file**
    - enabled judge: `judge/0001.json` exists and matches schema and key ordering

4. **Finalize writes run.json**
    - verify required keys including `server.url` and agent `client_id` fields
    - judge disabled writes client_id as empty string

5. **Run folder collision**
    - pre-create run folder path and ensure `createRunLogger` throws

6. **Atomic write behavior**
    - ensure no `.tmp` files remain after successful writes

---

## Acceptance Criteria

1. Produces the exact on-disk layout and file formats specified.
2. Filenames, padding, and headings match spec exactly.
3. Writes are atomic and sequential.
4. `run.json` is written only once during finalize and matches schema and ordering constraints.
5. Per-turn markdown frontmatter includes `client_id` (not `model`).
6. `run.json` includes `server.url` and agent `client_id` fields.
7. Unit tests pass and validate content and structure.
