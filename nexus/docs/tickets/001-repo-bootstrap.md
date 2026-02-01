# Ticket 001 - Repo Bootstrap for Nexus (Bun-based TUI + local state)

## Title

Repo Bootstrap for Nexus (Bun-based TUI + local state)

## Goal

Create the initial **Nexus** repository structure and development scaffolding so developers can immediately start implementing subsequent tickets with consistent conventions.

This ticket establishes:

- A Bun/TypeScript project (no transpilation/build step required for dev)
- A minimal runnable entrypoint
- Basic repo layout for TUI, orchestration logic, storage, and server integration
- Formatting/lint/test baseline (lightweight, Bun-native)

---

# Context

Nexus is a **local orchestration control plane** (TUI app) that:

- Stores project state in local files (plain text + markdown)
- Sends prompts to the local server via `POST http://localhost:8765/responses/:id` with JSON `{ input: string }`
- Receives text output and persists it for governance

This ticket does **not** implement features beyond the minimal shell to run.

---

# Requirements

## Functional

1. Running `bun run dev` starts the Nexus process and prints a basic banner + “ready” message.
2. Repo includes a clean initial folder structure for later tickets.
3. A minimal configuration loader exists (hardcoded defaults acceptable for now) but **no real config behavior is required** beyond reading an env var or config file stub.
4. Add a minimal test harness so `bun test` runs at least one passing test.

## Non-functional

- Keep dependencies minimal.
- Prefer Bun-native facilities.
- Keep all state and prompts local (no external services).
- Code style should be consistent and readable.

---

# Out of scope

- Any real TUI UI implementation (views, keybindings)
- Any real storage schema implementation
- Any server integration (HTTP client)
- Any governance logic

Those come in later tickets.

---

# Proposed repository layout

```
nexus/
  package.json
  bunfig.toml                 (optional)
  tsconfig.json               (keep simple)
  README.md

  src/
    index.ts                  # process entrypoint
    app/
      bootstrap.ts            # app wiring (placeholder)
    config/
      config.ts               # config types + loadConfig() stub
    tui/
      README.md               # placeholder for TUI design notes
    core/
      README.md               # placeholder for domain model notes
    storage/
      README.md               # placeholder for state format notes
    server/
      README.md               # placeholder for server client notes

  test/
    smoke.test.ts             # one passing test

  .gitignore
```

**Notes**

- We intentionally separate **core** (domain concepts), **storage**, **server**, **tui** early to reduce churn later.
- Placeholder READMEs are acceptable if they clarify intent for upcoming tickets.

---

# Implementation steps

1. **Initialize Bun project**
    - Create `package.json` with scripts:
        - `dev`: run `src/index.ts`
        - `start`: run `src/index.ts`
        - `test`: run `bun test`
        - optional `fmt`/`lint` scripts if you add tooling (keep light)

2. **Add TypeScript config**
    - `tsconfig.json` appropriate for Bun runtime TS execution.
    - Target modern JS (`ES2022` or later), module system compatible with Bun.

3. **Create entrypoint**
    - `src/index.ts` should:
        - import `bootstrap()` from `src/app/bootstrap.ts`
        - print a banner like `Nexus — starting...`
        - call bootstrap and print `Nexus — ready`
        - handle uncaught errors with a clean log and non-zero exit

4. **Create bootstrap stub**
    - `src/app/bootstrap.ts` exports `async function bootstrap(): Promise<void>`
    - For now, it can just load config and return.

5. **Create config stub**
    - `src/config/config.ts`:
        - define `Config` type (minimum: `serverBaseUrl`, `stateDir`)
        - `loadConfig()` that reads from env with defaults:
            - `NEXUS_SERVER_BASE_URL` default `http://localhost:8765`
            - `NEXUS_STATE_DIR` default `./nexus_state` (relative to process cwd)

        - No directory creation required yet (can be done later), but ok if included.

6. **Add one passing test**
    - `test/smoke.test.ts`:
        - asserts `loadConfig()` returns defaults when env is unset (or set env in test)

    - Ensure `bun test` passes.

7. **Housekeeping**
    - `.gitignore` for `node_modules/`, `.DS_Store`, `nexus_state/`, etc.
    - Minimal `README.md`:
        - how to run dev
        - how to run tests
        - brief description of Nexus

---

# Acceptance criteria (Definition of Done)

- [ ] `bun install` completes successfully
- [ ] `bun run dev` starts Nexus and prints “starting” + “ready”
- [ ] `bun test` runs and passes at least 1 test
- [ ] Repo matches (or reasonably adheres to) the proposed layout above
- [ ] No implementation of later-ticket features (TUI/state/server) beyond stubs

---

# Engineering notes

- Prefer `console.error` for fatal startup errors; exit with `process.exit(1)` or Bun equivalent.
- Keep modules small; avoid premature abstractions.
- Don’t add heavy lint/build toolchains unless they’re clearly justified; Bun-native defaults are fine for MVP.

---

# Deliverables

- All files created as described above
- Minimal documentation in `README.md`
