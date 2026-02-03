# Ticket 002 - Config + Path Resolution Implementation

## TL;DR

> **Quick Summary**: Implement configuration system with env/file precedence, path security helpers, and directory initialization for Nexus. Create missing src/ structure from Ticket 001.
> 
> **Deliverables**:
> - Config module with JSON/JSONC support and env override
> - Path security helpers (isPathInsideRoot, resolveInsideRoot)
> - Directory initialization utilities
> - Complete test coverage for config and path security
> - Bootstrap sequence and updated entrypoint
> 
> **Estimated Effort**: Short
> **Parallel Execution**: NO - sequential (dependencies exist)
> **Critical Path**: Directory structure → Path helpers → Config module → Bootstrap → Tests

---

## Context

### Original Request
Implement Ticket 002 - Config + Path Resolution for Nexus, which establishes the foundational configuration and path safety layer for all subsequent features.

### Interview Summary
**Key Discussions**:
- **Monorepo setup**: Already complete, building on existing nexus package
- **Directory structure**: Need to create src/ subdirectories (Ticket 001 incomplete)
- **Config format**: JSON and JSONC only (no TypeScript config files)
- **Test infrastructure**: Use Bun native APIs for temp directories
- **Startup logging**: Simple console.log format

**Config Behavior Decisions**:
1. **File discovery**: CWD only + NEXUS_CONFIG_FILE env override
2. **Env vars**: Auto-derive derived paths (only NEXUS_STATE_DIR needed)
3. **Directory creation**: On startup (eager)
4. **Path locking**: Derived paths locked under stateDir
5. **Output format**: Minimal (`State directory: /path`)
6. **Error handling**: Fail fast with stderr + exit 1

### Research Findings
**From Server Codebase**:
- `isPathInsideRoot` implementation in `server/src/fs/security.ts` provides battle-tested reference
- Uses `path.resolve()` + `path.relative()` + checks for `..` prefix and absolute paths
- Comprehensive test suite covers: path inside/outside, traversal via `..`, prefix false positives
- Security helper used in `resolveIncludes.ts` to validate `@path` inclusions

**Current Nexus State**:
- Only root `index.ts` with "Hello via Bun!"
- No `src/` directory structure
- Documentation complete but code empty

---

## Work Objectives

### Core Objective
Create a reliable configuration and path-resolution layer for Nexus with environment and file-based config, strict path security, and automatic directory initialization.

### Concrete Deliverables
- `src/fs/paths.ts` - Path security helpers
- `src/fs/ensureDirs.ts` - Directory creation utilities
- `src/config/config.ts` - Config loading with precedence
- `src/app/bootstrap.ts` - Startup sequence
- `src/index.ts` - Updated entrypoint with banner
- `test/paths.test.ts` - Path security tests
- `test/config.test.ts` - Config precedence tests
- `LESSONS_LEARNED.md` - Implementation decisions and problems

### Definition of Done
- [ ] `bun test` passes all tests
- [ ] `bun run dev` starts and prints "State directory: /path"
- [ ] All paths are absolute and normalized
- [ ] Directories created on startup if missing
- [ ] Path traversal attempts throw errors
- [ ] Config precedence works: defaults < file < env
- [ ] LESSONS_LEARNED.md documents key decisions

### Must Have
- Path security (isPathInsideRoot, resolveInsideRoot)
- Config file loading from CWD with env override
- Environment variable precedence over config file
- Automatic directory creation (stateDir/projects/runs/logs)
- Fail-fast error handling with clear messages
- Simple startup logging

### Must NOT Have (Guardrails)
- ❌ YAML, TOML, or TypeScript config formats
- ❌ Config file search upward (ESLint-style)
- ❌ Logging frameworks (Winston, Pino, etc.)
- ❌ JSON schema validation beyond basic parsing
- ❌ Config file hot-reload or watching
- ❌ Directory migration or versioning
- ❌ Independent overrides for derived paths
- ❌ Permission checks beyond path validation
- ❌ Build steps or transpilation
- ❌ Mock filesystem abstractions in tests
- ❌ Retry logic or error recovery

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks MUST be verifiable WITHOUT any human action.
> This applies to EVERY task - no exceptions.

### Test Decision
- **Infrastructure exists**: YES (Bun test framework)
- **Automated tests**: Tests-after (implementation then tests)
- **Framework**: bun test (built-in)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

> Whether tests exist or not, EVERY task MUST include Agent-Executed QA Scenarios.
> These describe how the executing agent DIRECTLY verifies the deliverable.

**Verification Tools**:
- **Config/Bootstrap**: Bash (bun run commands)
- **Path Security**: Bash (bun test)
- **Directory Creation**: Bash (ls, test -d)

**Example Scenario Format**:
```
Scenario: Config loads from env var
  Tool: Bash
  Preconditions: Nexus src/ directory exists
  Steps:
    1. cd nexus && NEXUS_STATE_DIR=/tmp/test-nexus bun run src/index.ts 2>&1
    2. Assert: stdout contains "State directory: /tmp/test-nexus"
    3. Assert: exit code is 0
  Expected Result: Startup succeeds with env var path
  Evidence: Terminal output captured
```

---

## TODOs

### 1. Create Directory Structure

**What to do**:
- Create `src/app`, `src/config`, `src/fs` directories
- Create `test/` directory
- Leave placeholder READMEs in `src/core`, `src/storage`, `src/server`, `src/tui` (future tickets)

**Must NOT do**:
- Don't create elaborate directory hierarchies
- Don't add subdirectories beyond what's specified
- Don't create build or dist folders

**Recommended Agent Profile**:
- **Category**: `quick`
- **Reason**: Simple directory creation, no complex logic

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential (must be first)
- **Blocks**: All subsequent tasks (need directory structure)
- **Blocked By**: None (first task)

**References**:
- Ticket 001 spec: `nexus/docs/tickets/001-repo-bootstrap.md:60-89` - Proposed directory layout

**Acceptance Criteria**:

Agent-Executed QA Scenarios:
```
Scenario: Directory structure exists
  Tool: Bash
  Preconditions: In nexus/ directory
  Steps:
    1. cd /Users/quangtran/Sync/node-projects/chatgpt-ux-navigator/nexus
    2. test -d src/app && test -d src/config && test -d src/fs && test -d test
    3. Assert: exit code is 0 (all directories exist)
    4. ls -la src/ | grep -E "(app|config|fs|core|storage|server|tui)"
    5. Assert: output shows all directories
  Expected Result: All required directories exist
  Evidence: ls output captured
```

**Commit**: NO (groups with task 6)

---

### 2. Implement Path Security Helpers (src/fs/paths.ts) ✅

**What to do**:
- Implement `isPathInsideRoot(absPath: string, absRoot: string): boolean`
  - Use `path.resolve()` on both paths
  - Use `path.relative(root, path)` to get relationship
  - Check result doesn't start with `..` and isn't absolute
- Implement `resolveInsideRoot(rootAbs: string, relativePath: string): string`
  - Join paths with `path.resolve()`
  - Validate result with `isPathInsideRoot()`
  - Throw descriptive error if outside root
- Add JSDoc comments explaining usage and security implications
- Follow server's `server/src/fs/security.ts:1-26` implementation pattern exactly

**Must NOT do**:
- Don't add chroot-style sandboxing
- Don't implement filesystem permission checks
- Don't add path normalization beyond what server does
- Don't create complex path manipulation utilities

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- **Reason**: Direct copy of proven implementation from server

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 4 (config needs path validation)
- **Blocked By**: Task 1 (needs src/fs/ directory)

**References**:
- **Pattern Reference**: `server/src/fs/security.ts:1-26` - Complete isPathInsideRoot implementation
- **Usage Reference**: `server/src/prompts/resolveIncludes.ts:45-52` - How security helper is used
- **Test Reference**: `server/test/fs.test.ts:describe("isPathInsideRoot")` - Edge cases to handle

**Acceptance Criteria**:

Agent-Executed QA Scenarios:
```
Scenario: isPathInsideRoot detects safe paths
  Tool: Bash (bun test)
  Preconditions: src/fs/paths.ts exists
  Steps:
    1. cd nexus
    2. Create test/paths.test.ts with test cases (see task 7)
    3. bun test test/paths.test.ts 2>&1
    4. Assert: exit code is 0
    5. Assert: output contains "pass" or similar success indicator
  Expected Result: All path security tests pass
  Evidence: Test output captured

Scenario: resolveInsideRoot throws on traversal
  Tool: Bash (bun test)
  Preconditions: Test file exists
  Steps:
    1. cd nexus && bun test test/paths.test.ts --grep "traversal" 2>&1
    2. Assert: Test for "../outside" throws error
    3. Assert: Error message contains "Path traversal attempt detected"
  Expected Result: Traversal attempts are blocked
  Evidence: Test output with error message
```

**Commit**: NO (groups with task 4)

---

### 3. Implement Directory Utilities (src/fs/ensureDirs.ts) ✅

**What to do**:
- Implement `async ensureDir(pathAbs: string): Promise<void>`
  - Use `fs.mkdir(pathAbs, { recursive: true })`
  - Wrap in try/catch with clear error message including path
- Implement `async ensureDirs(pathsAbs: string[]): Promise<void>`
  - Call `ensureDir()` for each path
  - Fail fast on first error (don't continue if one fails)
- Add JSDoc comments with usage examples

**Must NOT do**:
- Don't implement directory cleanup/garbage collection
- Don't add directory watching or monitoring
- Don't create migration logic
- Don't add custom directory creation logic beyond fs.mkdir

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- **Reason**: Straightforward wrapper around fs.mkdir

**Parallelization**:
- **Can Run In Parallel**: YES (with task 2)
- **Parallel Group**: Wave 1 (parallel with path security)
- **Blocks**: Task 4 (config uses ensureDirs)
- **Blocked By**: Task 1 (needs src/fs/ directory)

**References**:
- Node.js fs.mkdir docs for `{ recursive: true }` option
- Error handling pattern from server codebase

**Acceptance Criteria**:

Agent-Executed QA Scenarios:
```
Scenario: ensureDir creates nested directories
  Tool: Bash
  Preconditions: src/fs/ensureDirs.ts exists
  Steps:
    1. cd nexus
    2. Create test script: echo 'import {ensureDir} from "./src/fs/ensureDirs.ts"; await ensureDir("/tmp/nexus-test/deep/nested");' > /tmp/test-ensure.ts
    3. rm -rf /tmp/nexus-test
    4. bun run /tmp/test-ensure.ts
    5. test -d /tmp/nexus-test/deep/nested
    6. Assert: exit code is 0 (directory created)
    7. rm -rf /tmp/nexus-test
  Expected Result: Nested directories created successfully
  Evidence: Directory existence verified

Scenario: ensureDir handles errors gracefully
  Tool: Bash
  Preconditions: ensureDir implementation exists
  Steps:
    1. Create test for invalid path (e.g., "/invalid\0path")
    2. Run test expecting error
    3. Assert: Error message includes the problematic path
  Expected Result: Clear error message on failure
  Evidence: Error output captured
```

**Commit**: NO (groups with task 4)

---

### 4. Implement Config Module (src/config/config.ts) ✅

**What to do**:
- Define `Config` type:
  ```typescript
  export type Config = {
    serverBaseUrl: string;
    stateDir: string;        // absolute
    projectsDir: string;     // absolute
    runsDir: string;         // absolute
    logsDir: string;         // absolute
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  ```
- Implement `async loadConfig(): Promise<Config>`
  - **Step 1: Defaults**
    ```typescript
    const defaults = {
      serverBaseUrl: 'http://localhost:8765',
      stateDir: './nexus_state',
      logLevel: 'info' as const
    };
    ```
  - **Step 2: Config file loading**
    - Check `NEXUS_CONFIG_FILE` env var, else use `./nexus.config.json`
    - If file exists, read with `Bun.file(path).text()`
    - Strip JSONC comments (`//` and `/* */`) before parsing
    - Parse JSON with try/catch, throw clear error on invalid JSON
    - Merge with defaults (config file overrides defaults)
  - **Step 3: Environment variables**
    - Check `NEXUS_SERVER_BASE_URL`, `NEXUS_STATE_DIR`, `NEXUS_LOG_LEVEL`
    - Override config file values if env vars set
  - **Step 4: Path resolution**
    - Convert `stateDir` to absolute using `path.resolve(process.cwd(), stateDir)`
    - Derive `projectsDir = path.join(stateDir, 'projects')`
    - Derive `runsDir = path.join(stateDir, 'runs')`
    - Derive `logsDir = path.join(stateDir, 'logs')`
    - Normalize all paths
  - **Step 5: Directory creation**
    - Call `await ensureDirs([stateDir, projectsDir, runsDir, logsDir])`
  - **Step 6: Return final config**
- Fail fast on any error (JSON parse, directory creation) with clear message to stderr

**Must NOT do**:
- Don't implement JSON schema validation
- Don't support YAML, TOML, or TypeScript configs
- Don't search for config files upward in directory tree
- Don't implement config file watching/hot-reload
- Don't allow independent configuration of derived paths
- Don't create migration or versioning logic

**Recommended Agent Profile**:
- **Category**: `unspecified-low`
- **Skills**: []
- **Reason**: Straightforward config loading with clear requirements, but needs careful precedence handling

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 5 (bootstrap calls loadConfig)
- **Blocked By**: Tasks 2, 3 (needs path helpers and ensureDirs)

**References**:
- **Pattern Reference**: Ticket 002 spec `nexus/docs/tickets/002-config-and-paths.md:60-90` - Config specification
- **JSONC Stripping**: Strip `//.*$` (line comments) and `/\*[\s\S]*?\*/` (block comments) before JSON.parse
- **Env Var Reference**: Ticket 001 spec `nexus/docs/tickets/001-repo-bootstrap.md:124-128` - Original config stub

**Acceptance Criteria**:

Agent-Executed QA Scenarios:
```
Scenario: Config loads defaults when nothing set
  Tool: Bash
  Preconditions: Config module implemented
  Steps:
    1. cd nexus
    2. rm -f nexus.config.json .nexusrc.json
    3. unset NEXUS_STATE_DIR NEXUS_SERVER_BASE_URL NEXUS_CONFIG_FILE
    4. Create test: echo 'import {loadConfig} from "./src/config/config.ts"; const c = await loadConfig(); console.log(c.serverBaseUrl, c.stateDir);' > /tmp/test-config.ts
    5. bun run /tmp/test-config.ts 2>&1
    6. Assert: output contains "http://localhost:8765"
    7. Assert: output contains "nexus_state" (resolved to absolute)
  Expected Result: Defaults used when no config/env
  Evidence: Output captured

Scenario: Env var overrides config file
  Tool: Bash
  Preconditions: Config module implemented
  Steps:
    1. cd nexus
    2. echo '{"stateDir": "./from-config"}' > nexus.config.json
    3. NEXUS_STATE_DIR=/tmp/from-env bun run /tmp/test-config.ts 2>&1
    4. Assert: output contains "/tmp/from-env"
    5. Assert: output does NOT contain "from-config"
    6. rm nexus.config.json
  Expected Result: Env var takes precedence over config file
  Evidence: Output comparison

Scenario: Invalid JSON fails with clear error
  Tool: Bash
  Preconditions: Config module implemented
  Steps:
    1. cd nexus
    2. echo '{invalid json}' > nexus.config.json
    3. bun run /tmp/test-config.ts 2>&1
    4. Assert: exit code is non-zero
    5. Assert: stderr contains "JSON" or "parse"
    6. rm nexus.config.json
  Expected Result: Clear error message on invalid JSON
  Evidence: Error output captured

Scenario: JSONC comments are stripped
  Tool: Bash
  Preconditions: Config module implemented
  Steps:
    1. cd nexus
    2. echo '{"stateDir": "./data", /* comment */ "serverBaseUrl": "http://localhost:9000" // line comment\n}' > nexus.config.json
    3. bun run /tmp/test-config.ts 2>&1
    4. Assert: exit code is 0
    5. Assert: output contains "http://localhost:9000"
    6. rm nexus.config.json
  Expected Result: JSONC comments don't break parsing
  Evidence: Successful parse output

Scenario: Directories created on config load
  Tool: Bash
  Preconditions: Config module implemented
  Steps:
    1. cd nexus
    2. rm -rf /tmp/nexus-test-dirs
    3. NEXUS_STATE_DIR=/tmp/nexus-test-dirs bun run /tmp/test-config.ts
    4. test -d /tmp/nexus-test-dirs/projects
    5. test -d /tmp/nexus-test-dirs/runs
    6. test -d /tmp/nexus-test-dirs/logs
    7. Assert: all exit codes are 0
    8. rm -rf /tmp/nexus-test-dirs
  Expected Result: All derived directories created
  Evidence: Directory existence verified
```

**Commit**: YES
- Message: `feat(nexus): implement config system with path security`
- Files: `src/config/config.ts`, `src/fs/paths.ts`, `src/fs/ensureDirs.ts`
- Pre-commit: `cd nexus && bun test` (will fail if no tests yet, that's okay)

---

### 5. Implement Bootstrap Sequence (src/app/bootstrap.ts) ✅

**What to do**:
- Implement `async bootstrap(): Promise<void>`
  - Call `const config = await loadConfig()`
  - Log to stdout: `State directory: ${config.stateDir}`
  - Store config for future use (return it or set global)
  - No additional logic beyond config loading and logging

**Must NOT do**:
- Don't initialize TUI (future ticket)
- Don't connect to server (future ticket)
- Don't load storage or state (future ticket)
- Don't add elaborate logging infrastructure

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- **Reason**: Simple function calling loadConfig and printing output

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 6 (index.ts calls bootstrap)
- **Blocked By**: Task 4 (needs loadConfig)

**References**:
- Ticket 001 spec `nexus/docs/tickets/001-repo-bootstrap.md:118-120` - Bootstrap stub requirements
- Simple logging requirement from user decision (minimal format)

**Acceptance Criteria**:

Agent-Executed QA Scenarios:
```
Scenario: Bootstrap logs state directory
  Tool: Bash
  Preconditions: bootstrap.ts implemented
  Steps:
    1. cd nexus
    2. Create test: echo 'import {bootstrap} from "./src/app/bootstrap.ts"; await bootstrap();' > /tmp/test-bootstrap.ts
    3. bun run /tmp/test-bootstrap.ts 2>&1
    4. Assert: stdout contains "State directory:"
    5. Assert: stdout contains an absolute path
  Expected Result: State directory logged on bootstrap
  Evidence: Output captured
```

**Commit**: NO (groups with task 6)

---

### 6. Update Entrypoint (src/index.ts) ✅

**What to do**:
- Move content from root `index.ts` to `src/index.ts`
- Replace "Hello via Bun!" with:
  ```typescript
  import {bootstrap} from './app/bootstrap.ts';

  async function main() {
    try {
      console.log('Nexus — starting...');
      await bootstrap();
      console.log('Nexus — ready');
    } catch (error) {
      console.error('Fatal error during startup:', error);
      process.exit(1);
    }
  }

  main();
  ```
- Delete root `index.ts` (keep only `src/index.ts`)
- Add proper error handling with process.exit(1) on failure

**Must NOT do**:
- Don't add signal handlers (SIGINT, etc.) yet
- Don't implement CLI argument parsing
- Don't add process monitoring or restart logic

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- **Reason**: Simple entrypoint with error handling

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Tasks 11, 12 (need working entrypoint to test)
- **Blocked By**: Task 5 (needs bootstrap function)

**References**:
- Ticket 001 spec `nexus/docs/tickets/001-repo-bootstrap.md:112-117` - Entrypoint requirements

**Acceptance Criteria**:

Agent-Executed QA Scenarios:
```
Scenario: Startup prints banner and ready message
  Tool: Bash
  Preconditions: src/index.ts implemented
  Steps:
    1. cd nexus
    2. bun run src/index.ts 2>&1
    3. Assert: output contains "Nexus — starting..."
    4. Assert: output contains "State directory:"
    5. Assert: output contains "Nexus — ready"
    6. Assert: exit code is 0
  Expected Result: Startup sequence completes successfully
  Evidence: Terminal output captured

Scenario: Startup fails gracefully on error
  Tool: Bash
  Preconditions: src/index.ts with error handling
  Steps:
    1. cd nexus
    2. echo '{bad json}' > nexus.config.json
    3. bun run src/index.ts 2>&1
    4. Assert: exit code is 1
    5. Assert: stderr contains "Fatal error" or similar
    6. rm nexus.config.json
  Expected Result: Error exits with code 1 and message
  Evidence: Error output and exit code captured
```

**Commit**: YES
- Message: `feat(nexus): add bootstrap sequence and entrypoint`
- Files: `src/app/bootstrap.ts`, `src/index.ts`, delete root `index.ts`
- Pre-commit: `cd nexus && bun run src/index.ts`

---

### 7. Write Path Security Tests (test/paths.test.ts)

**What to do**:
- Create comprehensive test suite for path security helpers
- Test cases (follow server's `server/test/fs.test.ts` pattern):
  - `isPathInsideRoot` returns true for path inside root
  - `isPathInsideRoot` returns true for root itself
  - `isPathInsideRoot` returns false for path outside root
  - `isPathInsideRoot` returns false for parent directory
  - `isPathInsideRoot` returns false for traversal via `..`
  - `isPathInsideRoot` catches string prefix false positives (e.g., `/app/database` vs `/app/data`)
  - `resolveInsideRoot` returns correct absolute path for safe relative paths
  - `resolveInsideRoot` throws on traversal attempts (e.g., `../outside`)
  - `resolveInsideRoot` error message includes both paths
- Use Bun's `describe`, `it`, `expect` test APIs

**Must NOT do**:
- Don't create mock filesystem abstractions
- Don't test beyond server's test coverage scope
- Don't add fuzzing or property-based testing
- Don't create elaborate test fixtures

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- **Reason**: Direct port of existing test patterns from server

**Parallelization**:
- **Can Run In Parallel**: YES (with task 8)
- **Parallel Group**: Wave 2 (test writing phase)
- **Blocks**: Task 11 (bun test verification)
- **Blocked By**: Task 2 (needs paths.ts implemented)

**References**:
- **Test Pattern Reference**: `server/test/fs.test.ts:describe("isPathInsideRoot")` - Complete test suite to mirror
- **Bun Test API**: Use `import { describe, it, expect } from 'bun:test'`

**Acceptance Criteria**:

Agent-Executed QA Scenarios:
```
Scenario: All path security tests pass
  Tool: Bash (bun test)
  Preconditions: test/paths.test.ts exists
  Steps:
    1. cd nexus
    2. bun test test/paths.test.ts 2>&1
    3. Assert: exit code is 0
    4. Assert: output shows all tests passed
    5. Assert: at least 8 test cases ran
  Expected Result: Complete path security test coverage
  Evidence: Test output with pass count
```

**Commit**: NO (groups with task 8)

---

### 8. Write Config Tests (test/config.test.ts)

**What to do**:
- Create test suite for config loading and precedence
- Test cases:
  - Loads defaults when no config file or env vars
  - Loads config file when present (use temp directory)
  - Env var overrides config file
  - Invalid JSON throws error
  - JSONC comments are stripped correctly
  - Derived dirs are computed correctly
  - Directories are created on load
  - Config file from NEXUS_CONFIG_FILE env var
  - Relative stateDir converted to absolute
  - All paths are normalized
- Use Bun's temp directory API for test fixtures

**Must NOT do**:
- Don't test every possible env var combination (combinatorial explosion)
- Don't mock the filesystem beyond temp directories
- Don't test OS-specific edge cases (different drives on Windows)

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- **Reason**: Standard config testing patterns

**Parallelization**:
- **Can Run In Parallel**: YES (with task 7)
- **Parallel Group**: Wave 2 (test writing phase)
- **Blocks**: Task 11 (bun test verification)
- **Blocked By**: Task 4 (needs config.ts implemented)

**References**:
- **Temp Directory Pattern**: Use `const tmpDir = Bun.makeTempDir()` for test fixtures, clean up after
- **Config Spec**: Ticket 002 `nexus/docs/tickets/002-config-and-paths.md:60-90` - Full config behavior

**Acceptance Criteria**:

Agent-Executed QA Scenarios:
```
Scenario: All config tests pass
  Tool: Bash (bun test)
  Preconditions: test/config.test.ts exists
  Steps:
    1. cd nexus
    2. bun test test/config.test.ts 2>&1
    3. Assert: exit code is 0
    4. Assert: output shows all tests passed
    5. Assert: at least 10 test cases ran
  Expected Result: Complete config test coverage
  Evidence: Test output with pass count

Scenario: Config tests clean up temp files
  Tool: Bash
  Preconditions: Config tests exist
  Steps:
    1. cd nexus
    2. BEFORE=$(ls /tmp | wc -l)
    3. bun test test/config.test.ts
    4. AFTER=$(ls /tmp | wc -l)
    5. Assert: BEFORE equals AFTER (no temp files leaked)
  Expected Result: Tests don't leave artifacts
  Evidence: Temp directory count comparison
```

**Commit**: YES
- Message: `test(nexus): add config and path security tests`
- Files: `test/paths.test.ts`, `test/config.test.ts`
- Pre-commit: `cd nexus && bun test`

---

### 9. Update package.json Scripts

**What to do**:
- Update `package.json` scripts:
  ```json
  "scripts": {
    "dev": "bun run src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bun test"
  }
  ```
- Verify scripts work correctly

**Must NOT do**:
- Don't add watch mode or hot reload (keep simple)
- Don't add lint or format scripts unless requested
- Don't create npm scripts for building/transpiling

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- **Reason**: Simple JSON edit

**Parallelization**:
- **Can Run In Parallel**: YES (independent of other tasks)
- **Parallel Group**: Wave 2 (can run with tests)
- **Blocks**: Tasks 11, 12 (verification uses these scripts)
- **Blocked By**: Task 6 (needs src/index.ts to exist)

**References**:
- Ticket 001 spec `nexus/docs/tickets/001-repo-bootstrap.md:101-105` - Script requirements

**Acceptance Criteria**:

Agent-Executed QA Scenarios:
```
Scenario: Dev script runs successfully
  Tool: Bash
  Preconditions: package.json scripts updated
  Steps:
    1. cd nexus
    2. bun run dev 2>&1
    3. Assert: exit code is 0
    4. Assert: output contains "Nexus — ready"
  Expected Result: Dev script starts Nexus
  Evidence: Output captured

Scenario: Test script runs successfully
  Tool: Bash
  Preconditions: package.json scripts updated, tests exist
  Steps:
    1. cd nexus
    2. bun run test 2>&1
    3. Assert: exit code is 0
    4. Assert: output shows test results
  Expected Result: Test script executes tests
  Evidence: Test output captured
```

**Commit**: YES
- Message: `chore(nexus): update package.json scripts`
- Files: `package.json`
- Pre-commit: `cd nexus && bun run test`

---

### 10. Create LESSONS_LEARNED.md

**What to do**:
- Create `LESSONS_LEARNED.md` at nexus root
- Document key decisions made:
  - Config file discovery (CWD only + env override)
  - Auto-derived paths (locked under stateDir)
  - Eager directory creation
  - Fail-fast error handling
  - JSONC comment stripping approach
  - Why we followed server's isPathInsideRoot pattern
- Document any problems encountered:
  - Edge cases discovered
  - Test challenges
  - Bun-specific gotchas
  - Path resolution quirks
- Format as markdown with sections for decisions, problems, solutions

**Must NOT do**:
- Don't create elaborate documentation (keep concise)
- Don't duplicate information from code comments
- Don't create diagrams or flowcharts

**Recommended Agent Profile**:
- **Category**: `writing`
- **Skills**: []
- **Reason**: Documentation task

**Parallelization**:
- **Can Run In Parallel**: YES (independent)
- **Parallel Group**: Wave 3 (documentation phase)
- **Blocks**: None
- **Blocked By**: Tasks 1-9 (needs implementation complete to document)

**References**:
- User requirement from initial request: "note down any problems encountered in a new file, LESSONS_LEARNED.md"

**Acceptance Criteria**:

Agent-Executed QA Scenarios:
```
Scenario: LESSONS_LEARNED.md exists and has content
  Tool: Bash
  Preconditions: Implementation complete
  Steps:
    1. cd nexus
    2. test -f LESSONS_LEARNED.md
    3. Assert: exit code is 0 (file exists)
    4. wc -l LESSONS_LEARNED.md
    5. Assert: line count > 20 (substantial content)
    6. grep -i "decision\|problem\|solution" LESSONS_LEARNED.md
    7. Assert: matches found (contains relevant sections)
  Expected Result: Lessons learned documented
  Evidence: File exists with content
```

**Commit**: YES
- Message: `docs(nexus): add lessons learned from ticket 002`
- Files: `LESSONS_LEARNED.md`
- Pre-commit: None

---

### 11. Verify All Tests Pass

**What to do**:
- Run `cd nexus && bun test`
- Verify all tests pass (paths.test.ts, config.test.ts)
- Check test coverage is comprehensive
- Fix any failing tests

**Must NOT do**:
- Don't skip failing tests
- Don't reduce test coverage to make tests pass
- Don't add arbitrary delays or timeouts to fix flaky tests

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- **Reason**: Verification task

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential (verification phase)
- **Blocks**: Task 13 (commit only after tests pass)
- **Blocked By**: Tasks 7, 8, 9 (needs tests and scripts)

**References**:
- Ticket 002 acceptance criteria: "`bun test` passes"

**Acceptance Criteria**:

Agent-Executed QA Scenarios:
```
Scenario: All tests pass
  Tool: Bash (bun test)
  Preconditions: All code and tests implemented
  Steps:
    1. cd nexus
    2. bun test 2>&1
    3. Assert: exit code is 0
    4. Assert: output contains "pass" or equivalent success message
    5. Assert: no "fail" or "error" in output
  Expected Result: Complete test suite passes
  Evidence: Test output captured
```

**Commit**: NO (verification only)

---

### 12. Verify Startup Message

**What to do**:
- Run `cd nexus && bun run dev`
- Verify output contains:
  - "Nexus — starting..."
  - "State directory: /absolute/path"
  - "Nexus — ready"
- Verify exit code is 0
- Test with env var override: `NEXUS_STATE_DIR=/tmp/test bun run dev`

**Must NOT do**:
- Don't add additional logging beyond requirements
- Don't change output format without updating plan

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- **Reason**: Verification task

**Parallelization**:
- **Can Run In Parallel**: YES (with task 11)
- **Parallel Group**: Wave 3 (verification phase)
- **Blocks**: Task 13 (commit only after verification)
- **Blocked By**: Tasks 6, 9 (needs entrypoint and scripts)

**References**:
- Ticket 002 acceptance criteria: "Startup prints resolved stateDir"
- User decision: "Simple" logging format

**Acceptance Criteria**:

Agent-Executed QA Scenarios:
```
Scenario: Startup prints correct messages
  Tool: Bash
  Preconditions: All code implemented
  Steps:
    1. cd nexus
    2. bun run dev 2>&1
    3. Assert: output contains "Nexus — starting..."
    4. Assert: output contains "State directory:"
    5. Assert: output contains "Nexus — ready"
    6. Assert: exit code is 0
  Expected Result: Startup sequence works as specified
  Evidence: Terminal output captured

Scenario: Env var override works
  Tool: Bash
  Preconditions: All code implemented
  Steps:
    1. cd nexus
    2. NEXUS_STATE_DIR=/tmp/nexus-test bun run dev 2>&1
    3. Assert: output contains "State directory: /tmp/nexus-test"
    4. Assert: exit code is 0
    5. rm -rf /tmp/nexus-test
  Expected Result: Env var changes state directory
  Evidence: Output with env-specific path
```

**Commit**: NO (verification only)

---

### 13. Final Commit

**What to do**:
- Review all changes
- Ensure no uncommitted files
- Create final commit if needed
- Verify git history is clean

**Must NOT do**:
- Don't commit incomplete work
- Don't commit commented-out code
- Don't commit temporary test files

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: [`git-master`]
- **Reason**: Git operations

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential (final step)
- **Blocks**: None (last task)
- **Blocked By**: Tasks 11, 12 (all verification complete)

**References**:
- GIT_WORKFLOW.md for commit conventions
- User requirement: "Make sure to follow GIT_WORKFLOW.md"

**Acceptance Criteria**:

Agent-Executed QA Scenarios:
```
Scenario: No uncommitted changes
  Tool: Bash (git)
  Preconditions: All work complete
  Steps:
    1. cd nexus
    2. git status --porcelain
    3. Assert: output is empty (no uncommitted changes)
  Expected Result: All changes committed
  Evidence: Git status output

Scenario: Commit messages follow convention
  Tool: Bash (git)
  Preconditions: Commits created
  Steps:
    1. cd nexus
    2. git log --oneline -n 5
    3. Assert: messages match pattern "type(scope): description"
    4. Assert: types are feat/test/chore/docs
  Expected Result: Conventional commit format used
  Evidence: Git log output
```

**Commit**: N/A (this task IS the commit verification)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 4 | `feat(nexus): implement config system with path security` | `src/config/config.ts`, `src/fs/paths.ts`, `src/fs/ensureDirs.ts` | `cd nexus && bun run src/index.ts` |
| 6 | `feat(nexus): add bootstrap sequence and entrypoint` | `src/app/bootstrap.ts`, `src/index.ts`, delete root `index.ts` | `cd nexus && bun run src/index.ts` |
| 8 | `test(nexus): add config and path security tests` | `test/paths.test.ts`, `test/config.test.ts` | `cd nexus && bun test` |
| 9 | `chore(nexus): update package.json scripts` | `package.json` | `cd nexus && bun run test` |
| 10 | `docs(nexus): add lessons learned from ticket 002` | `LESSONS_LEARNED.md` | None |

---

## Success Criteria

### Verification Commands
```bash
# Test suite passes
cd nexus && bun test
# Expected: All tests pass (0 failures)

# Startup works
cd nexus && bun run dev
# Expected: "Nexus — starting...", "State directory: /path", "Nexus — ready"

# Env override works
cd nexus && NEXUS_STATE_DIR=/tmp/test bun run dev
# Expected: "State directory: /tmp/test"

# Config file works
cd nexus && echo '{"stateDir": "./custom"}' > nexus.config.json && bun run dev
# Expected: "State directory: /absolute/path/custom"

# Directories created
cd nexus && ls -la /tmp/test/
# Expected: projects/, runs/, logs/ directories exist
```

### Final Checklist
- [ ] All "Must Have" present (config, path security, dir init, tests)
- [ ] All "Must NOT Have" absent (no YAML, no logging libs, no build tools)
- [ ] All tests pass (`bun test` exits 0)
- [ ] Startup works (`bun run dev` shows state directory)
- [ ] Env vars override config file
- [ ] LESSONS_LEARNED.md documents decisions
- [ ] Git workflow followed (conventional commits)
