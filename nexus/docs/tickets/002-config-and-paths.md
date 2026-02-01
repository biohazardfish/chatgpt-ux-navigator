# Ticket 002 - Config + Path Resolution (state root, project roots, safety checks)

## Title

Config + Path Resolution (state root, project roots, safety checks)

## Goal

Implement a small, reliable configuration and path-resolution layer for Nexus so all subsequent features (state persistence, prompt composition, session runs) have a consistent, safe way to locate and create directories/files on disk.

This ticket formalizes:

- Config sources (env + optional config file)
- Canonical path resolution rules
- Directory initialization (create-if-missing)
- Path traversal guardrails for any file I/O Nexus performs

---

# Context

Nexus is a local Bun app that persists state in plain text/markdown files. It must not accidentally read/write outside its configured roots.

We already created a `loadConfig()` stub in ticket 001. This ticket turns that into a usable configuration module.

---

# Requirements

## Functional

1. Support configuration via:
    - Environment variables (primary)
    - Optional local config file (secondary; if present, overrides defaults but can be overridden by env)
2. Resolve and expose canonical absolute paths for:
    - `stateDir` (Nexus persistent state root)
    - `projectsDir` (where per-project folders live)
    - `runsDir` (where per-session-run raw transcripts live)
    - `logsDir` (optional; local logs)
3. On startup (or on config load), ensure required directories exist (create them if missing).
4. Provide a reusable path-safety helper that prevents path traversal for any reads/writes beneath:
    - `stateDir` (and its subdirs)

## Non-functional

- Keep dependencies minimal (prefer Bun + stdlib).
- Path behavior must be deterministic across OSes.
- Fail fast with clear errors on invalid configuration.

---

# Out of scope

- Project state schema (ticket 003)
- Any actual storage read/write routines beyond directory setup and safety helpers
- Server API integration

---

# Config specification

## Environment variables

- `NEXUS_SERVER_BASE_URL` (default: `http://localhost:8765`)
- `NEXUS_STATE_DIR` (default: `./nexus_state`)
- `NEXUS_CONFIG_FILE` (optional; default: `./nexus.config.json` if present)

Optional (future-facing, include now if easy):

- `NEXUS_LOG_LEVEL` (default: `info`)

## Config file (optional)

- Location:
    - If `NEXUS_CONFIG_FILE` is set, load from that path.
    - Else, if `./nexus.config.json` exists, load it.
    - Else, no config file is used.
- Format: JSON
- Allowed keys (all optional):
    - `serverBaseUrl`
    - `stateDir`
    - `logLevel`

## Precedence

1. Defaults
2. Config file values (if present)
3. Environment variables override everything

---

# Path rules

## Canonicalization

- `stateDir` may be relative; resolve against `process.cwd()`.
- Convert all exposed dirs to absolute, normalized paths.

## Derived paths

Inside `stateDir`, define:

- `projectsDir = <stateDir>/projects`
- `runsDir = <stateDir>/runs`
- `logsDir = <stateDir>/logs` (optional but recommended)

## Directory creation

- Ensure `stateDir`, `projectsDir`, `runsDir`, and `logsDir` exist.
- If creation fails, throw with a clear error message (include path and underlying error).

---

# Path traversal & safety guardrails

Implement helper(s) such as:

- `resolveInsideRoot(rootAbs: string, relative: string): string`
    - Joins `rootAbs` + `relative`
    - Normalizes result
    - Verifies the result is still inside `rootAbs`
    - Throws if outside (path traversal attempt)

Also provide:

- `isPathInsideRoot(rootAbs: string, candidateAbs: string): boolean`

**Notes**

- This is a direct analog of the server’s `isPathInsideRoot` guardrail; Nexus must apply the same discipline.

---

# Proposed file changes

## Update existing

- `src/config/config.ts`
    - Expand `Config` type to include computed absolute dirs:
        - `serverBaseUrl: string`
        - `stateDir: string` (absolute)
        - `projectsDir: string` (absolute)
        - `runsDir: string` (absolute)
        - `logsDir: string` (absolute)
        - `logLevel: 'debug'|'info'|'warn'|'error'` (optional but recommended)
    - Implement config file loading + precedence
    - Implement directory creation

## New files

- `src/fs/paths.ts`
    - `resolveInsideRoot`, `isPathInsideRoot`
    - small path utilities (normalize, ensure trailing separator handling)
- `src/fs/ensureDirs.ts`
    - `ensureDir(pathAbs: string): Promise<void>`
    - `ensureDirs(pathsAbs: string[]): Promise<void>`

## Update entrypoint

- `src/index.ts` or `src/app/bootstrap.ts`
    - Ensure `loadConfig()` is called during bootstrap
    - Print resolved `stateDir` at startup (useful operator feedback)

---

# Implementation steps

1. **Config file detection + load**
    - Determine config file path (env override or default `./nexus.config.json`)
    - If file exists, parse JSON with try/catch and validate keys
    - On parse errors, fail fast with a message

2. **Apply precedence**
    - Merge defaults → config file → env

3. **Resolve directories**
    - Convert `stateDir` to absolute
    - Compute derived dirs
    - Normalize all

4. **Ensure dirs exist**
    - Use `fs.mkdir(..., { recursive: true })` (via Bun/Node compatible API)
    - Verify errors are surfaced clearly

5. **Add safety helpers**
    - Implement `isPathInsideRoot` and `resolveInsideRoot`
    - Add tests for:
        - normal safe join
        - traversal attempts like `../outside`
        - edge cases: `..`, absolute relative input, etc.

---

# Testing

Add/extend tests in `test/`:

- `test/config.test.ts`
    - Loads defaults when nothing set
    - Loads config file when present (use temp dir fixture)
    - Env overrides config file
    - Ensures derived dirs are correct

- `test/paths.test.ts`
    - `resolveInsideRoot` returns expected absolute path
    - Throws on traversal attempts

**Temporary directory strategy**

- Use `fs.mkdtemp` under OS temp dir and clean up after tests.

---

# Acceptance criteria (Definition of Done)

- [ ] Config supports env + optional JSON file with precedence: defaults < file < env
- [ ] All paths exposed in config are absolute and normalized
- [ ] `stateDir/projects`, `stateDir/runs`, `stateDir/logs` are created if missing
- [ ] Path traversal guardrails exist and are covered by tests
- [ ] `bun test` passes
- [ ] Startup prints resolved `stateDir` (or equivalent operator-visible confirmation)

---

# Deliverables

- Updated config module with file + env support and derived paths
- Path safety helpers
- Directory ensure utilities
- Test coverage for config precedence and path traversal prevention

