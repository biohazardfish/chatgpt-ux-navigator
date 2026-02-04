# Learnings & Wisdom

## From Ticket 002 (Config + Paths)

### Test Patterns
- **Isolation**: Use `beforeEach` and `afterEach` with `mkdtempSync` for filesystem tests.
- **Path Normalization**: Use `realpathSync` on macOS temp paths to avoid `/var` vs `/private/var` mismatch.
- **Fixture Cleanup**: Always ensure test artifacts are cleaned up.

### Security Patterns
- **Path Traversal**: Use `isPathInsideRoot` for ALL path operations involving user input (IDs, relative paths).
- **Fail Fast**: Throw errors immediately on security violations.

### Implementation Patterns
- **JSONC**: Use the robust regex for stripping comments to avoid breaking URLs.
- **Strict Types**: Use explicit types for Config and other structures.

## From Ticket 003 (Storage)

### Storage Patterns
- **Sequential IDs**: Implemented a scanner (`ids.ts`) to find the max ID in a directory and increment it. This handles both `T-XXX` and `XXX-slug` patterns.
- **Immutable Decisions**: Decisions are designed to be append-only files with sequential numbering to preserve history.
- **Status Updates**: For mutable files like `task.md`, regex replacement is safer than parsing/dumping if we want to preserve unknown content or formatting quirks.
- **Project Structure**: A consistent directory layout (`projects/<id>/...`) enforced by helper functions prevents structure drift.
