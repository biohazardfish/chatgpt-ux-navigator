# Ticket 025 - State Migrations (Versioned, Safe Evolution of Persistent State)

## Title

State Migrations (Versioned, Safe Evolution of Persistent State)

## Goal

Introduce a **state migration framework** so Nexus can safely evolve its persistent storage format over time while:

- Preserving existing projects
- Making schema changes explicit and auditable
- Preventing silent corruption or partial upgrades

This ticket prepares Nexus for **long-term use**, not just MVP.

---

## Context

From earlier tickets:

- Persistent state format is defined and versioned (`meta.json.version`) (ticket 003)
- State is stored as human-readable markdown + small JSON
- No migration mechanism exists yet

As Nexus evolves, storage formats will change; migrations must be intentional.

---

## Design principles

1. **Explicit versioning**
2. **Forward-only migrations**
3. **Idempotent and deterministic**
4. **Fail-fast on unknown versions**
5. **Human-inspectable**

---

## Versioning model

### Current version
- Storage schema version: `1`
- Stored in:
  ```
  projects/<project-id>/meta.json
  ```

### Future versions
- Each breaking storage change increments schema version by `+1`
- Migrations always run from `n → n+1`

---

## Migration lifecycle

On project load:

1. Read `meta.json.version`
2. Compare to `CURRENT_SCHEMA_VERSION`
3. If equal → proceed
4. If lower → run migrations sequentially
5. If higher → fail with clear error (unsupported future version)

---

## Migration interface

Define a migration contract:

```ts
interface Migration {
  fromVersion: number
  toVersion: number
  description: string

  migrate(projectPath: string): Promise<void>
}
```

---

## Migration runner API

```ts
async function migrateProjectIfNeeded(
  projectPath: string
): Promise<void>
```

Responsibilities:
- Load current version
- Determine required migrations
- Execute in order
- Update `meta.json.version`
- Update `meta.json.lastUpdatedAt`

---

## Safety guarantees

### Atomicity (MVP-level)
- Migrations operate per project
- If a migration fails:
  - Stop immediately
  - Leave project in a consistent, pre-migration state where possible
- No partial multi-step upgrades

### Backup (optional but recommended)
- Before migration:
  - Copy project directory to:
    ```
    projects/<project-id>.backup-v<oldVersion>
    ```
- Backup strategy can be basic (recursive copy)

---

## First migration (example stub)

Implement a **no-op migration** as a template:

```ts
const migration1to2: Migration = {
  fromVersion: 1,
  toVersion: 2,
  description: 'Normalize task status casing',

  async migrate(projectPath) {
    // Example logic:
    // - scan task.md files
    // - update "Completed" → "completed"
  }
}
```

> The actual transformation can be trivial or skipped; the goal is to prove the framework.

---

## Error handling

- Missing `meta.json` → error
- Unknown version → error
- Migration exception → abort and surface error

Errors must clearly indicate:
- Project ID
- From/to version
- Migration description

---

## Proposed file structure

### New files
```
src/storage/migrations/
  index.ts
  runner.ts
  types.ts
  migrations/
    v1-to-v2.ts
```

### Updated files
```
src/storage/project.ts      // invoke migration on load
src/config/constants.ts     // CURRENT_SCHEMA_VERSION
```

---

## Integration points

- Project loading must **always** go through migration check
- TUI should show a status message during migration:
  ```
  Migrating project state (v1 → v2)...
  ```

---

## Testing

Add tests under `test/migrations/`:

- Project at current version → no migration
- Project at older version → migration runs
- Migration failure aborts load
- Unsupported future version throws

Use temp project fixtures.

---

## Acceptance criteria (Definition of Done)

- [ ] Migration framework exists
- [ ] Schema version checked on project load
- [ ] Forward-only migrations supported
- [ ] Example migration implemented
- [ ] Clear errors on unsupported versions
- [ ] Optional backup created before migration
- [ ] `bun test` passes

---

## Deliverables

- Migration runner and interfaces
- Example migration
- Integration into project loading
- Tests validating migration behavior
