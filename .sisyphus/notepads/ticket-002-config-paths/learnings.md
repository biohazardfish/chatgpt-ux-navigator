# Learnings - Ticket 002 Config + Path Resolution

## Initial Context Gathered

**Current State (as of 2026-02-03):**
- Directory structure (src/app, src/config, src/fs, test/) already created ✅
- Root index.ts contains "Hello via Bun!" - needs to be moved to src/
- No source files exist yet in src/ directories
- No test files exist yet

**Reference Implementations Found:**
- `server/src/fs/security.ts` - Contains `isPathInsideRoot` implementation
- `server/test/fs.test.ts` - Test patterns using Bun test framework
- Uses `import { describe, it, expect, beforeEach, afterEach } from 'bun:test'`
- Uses Node.js fs/promises for file operations
- Test root pattern: `const TEST_ROOT = join(import.meta.dir, 'temp_test_fs')`

## Key Patterns to Follow

### Security Implementation Pattern
```typescript
// From server/src/fs/security.ts
import {resolve, relative, isAbsolute} from 'node:path';

export function isPathInsideRoot(absPath: string, absRoot: string): boolean {
    const resolvedRoot = resolve(absRoot);
    const resolvedPath = resolve(absPath);
    const rel = relative(resolvedRoot, resolvedPath);
    return !rel.startsWith('..') && !isAbsolute(rel);
}
```

### Test Pattern
```typescript
// From server/test/fs.test.ts
import {describe, it, expect, beforeEach, afterEach} from 'bun:test';
import {join} from 'node:path';
import {mkdir, rm} from 'node:fs/promises';

const TEST_ROOT = join(import.meta.dir, 'temp_test_fs');

describe('Test Suite', () => {
    beforeEach(async () => {
        await rm(TEST_ROOT, {recursive: true, force: true});
        await mkdir(TEST_ROOT, {recursive: true});
    });
    
    afterEach(async () => {
        await rm(TEST_ROOT, {recursive: true, force: true});
    });
    
    it('test case', () => {
        expect(something).toBe(expected);
    });
});
```

## Task Status

- [x] Task 1: Directory structure created (was already done)
- [x] Task 2: Implement path security helpers (`nexus/src/fs/paths.ts`) ✅
- [x] Task 3: Implement directory utilities (`nexus/src/fs/ensureDirs.ts`) ✅
- [ ] Task 4: Implement config module
- [ ] Task 5: Implement bootstrap
- [ ] Task 6: Update entrypoint
- [ ] Task 7-13: Tests, docs, verification

## Implementation Details

### src/fs/paths.ts
- Implemented `isPathInsideRoot` using `resolve`, `relative`, and `isAbsolute` from `node:path`.
- Implemented `resolveInsideRoot` which combines `resolve` and `isPathInsideRoot` check, throwing an error on traversal attempts.
- Added JSDoc with examples for security and usage clarity.
- Verified compilation using `bun run --no-execute`.

### src/fs/ensureDirs.ts
- Implemented `ensureDir` using `node:fs/promises`'s `mkdir` with `{ recursive: true }`.
- Implemented `ensureDirs` for bulk directory creation, with "fail-fast" behavior.
- Added comprehensive JSDoc with usage examples and error handling details.
- Verified syntax using `bun run --no-execute`.

### src/config/config.ts
- Implemented `Config` type and `loadConfig` function following a 6-step process.
- Configuration precedence implemented: defaults < config file < environment variables.
- Implemented JSONC comment stripping (line and block comments) before parsing.
- Discovered that simple line comment stripping using `//.*$` breaks on URLs (e.g., `http://`).
- Resolved paths to absolute and derived `projectsDir`, `runsDir`, and `logsDir` under `stateDir`.
- Integrated with `ensureDirs` to automatically create required directories on load.
- Verified implementation with `lsp_diagnostics` and a manual test script using Bun.

### src/app/bootstrap.ts
- Implemented `bootstrap` function that acts as the application's startup logic.
- Focused on minimal implementation: loading configuration and logging the state directory.
- Used `loadConfig` from `src/config/config.ts` to ensure all directories are initialized before logging.
- Verified successful import and execution using a temporary verification script.
- Followed "clean code" principles by removing unnecessary docstrings for self-explanatory logic.
- [x] Task 5: Implement bootstrap ✅
Moved root index.ts to src/index.ts and updated it to call bootstrap() with error handling.
Updated nexus/package.json and nexus/README.md to reflect the new entrypoint location.
