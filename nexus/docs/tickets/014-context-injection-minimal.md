# Ticket 014 - Context Injection (Minimal, Deterministic Prompt Context)

## Title

Context Injection (Minimal, Deterministic Prompt Context)

## Goal

Refine and formalize **how Nexus selects and injects project context into prompts**, ensuring:

- Prompts contain **only relevant, curated context**
- Context injection is **deterministic and inspectable**
- Prompt size remains controlled
- No accidental bias or context bloat is introduced

This ticket upgrades the naive context usage from ticket 013 into a **well-defined mechanism**.

---

## Context

From earlier tickets:

- Session runner composes prompts (ticket 013)
- Domain model defines project, plan, notes, tasks (ticket 004)
- Persistent state is human-curated (ticket 003)

This ticket ensures prompts reflect **explicit state**, not implicit memory.

---

## Scope

### Included

- A deterministic context selection algorithm
- Minimal context schema for prompts
- Centralized context builder
- Context truncation rules

### Excluded

- Dynamic context learning
- Session-to-session memory
- Heuristics based on prior runs
- User-configurable context policies

---

## Context categories (MVP)

Only the following categories may be injected:

1. **Task Objective** (required)
2. **Project Goals** (required)
3. **Plan Excerpt** (required)
4. **Constraints** (optional)
5. **Relevant Notes** (optional)

Nothing else is allowed.

---

## Context schema

Define a normalized structure:

```ts
interface PromptContext {
    taskObjective: string;
    goals: string[];
    planExcerpt: string[];
    constraints: string[];
    notes: string[];
}
```

This object is **pure data**, no formatting.

---

## Context selection rules

### Task objective

- Always include verbatim from task definition

---

### Goals

- Include all project goals
- Preserve order from `project.md`

---

### Plan excerpt

- Include:
    - Plan status
    - Phase list (titles only)
- Do **not** include historical or superseded plans

---

### Constraints

- Extract from:
    - `project.md` constraints section
- If none exist, omit section entirely

---

### Notes

- Include only:
    - `Assumptions`
    - `Clarifications`
- Exclude:
    - Lessons learned
    - Raw transcripts
- Truncate to max **N lines** (e.g. 10) to avoid bloat

---

## Truncation & safety

- Enforce max line count per section
- Enforce max total context lines (e.g. 50)
- If truncated:
    - Append `[...] (truncated)` marker
- Never silently drop required sections

---

## Prompt rendering

Context is rendered into text **in a single place**.

Example:

```
PROJECT CONTEXT

GOALS:
- ...

PLAN (Approved):
- Phase 1
- Phase 2

CONSTRAINTS:
- ...

NOTES:
- ...
```

The exact rendering format should be:

- Stable
- Diff-friendly
- Easy for humans to read

---

## API design

### Context builder

```ts
function buildPromptContext(project: Project, task: Task): PromptContext;
```

### Renderer

```ts
function renderPromptContext(context: PromptContext): string;
```

Session runner calls:

```ts
const context = buildPromptContext(project, task);
const contextText = renderPromptContext(context);
```

---

## Proposed file structure

### New files

```
src/core/context/
  builder.ts
  renderer.ts
  limits.ts
```

---

## Integration points

- Replace ad-hoc context injection in `sessionRunner.ts`
- No changes to server client or storage

---

## Error handling

- If required data is missing (e.g. no goals):
    - Throw explicit error
- If truncation occurs:
    - Do not error
    - Make truncation visible in prompt text

---

## Testing

Add tests under `test/context/`:

- Context includes required sections
- Optional sections omitted when empty
- Truncation logic enforced
- Rendering format stable

Mock `Project` and `Task` objects.

---

## Acceptance criteria (Definition of Done)

- [ ] Context builder produces deterministic output
- [ ] Only allowed context categories are included
- [ ] Truncation rules enforced and visible
- [ ] Session runner uses centralized context builder
- [ ] No accidental context bloat
- [ ] `bun test` passes

---

## Deliverables

- Context builder and renderer
- Truncation limits
- Tests covering selection and rendering

---

## Implementation Decisions

### 1. Parsing approach — parse inside sessionRunner using existing parsers

The session runner (`sessionRunner.ts`) previously received raw markdown strings from the storage-level `loadProject()`. To obtain the parsed `Project` domain object (with structured `goals`, `constraints`, `plan`, `notes`), two approaches were considered:

1. **Import and use existing parsers** (`parseProjectDoc`, `parsePlan`, `parseNotes`) directly inside `sessionRunner.ts`.
2. **Use `loadProjectById()`** from `app/projectLoader.ts`, which already does full parsing.

**Decision:** Option 1 — parse in `sessionRunner.ts`.

**Rationale:** Option 2 would create a dependency from `core/` to `app/`, which is a layering violation. The `core/` layer must remain self-contained. Importing the parsers (which are already in `core/parsing/`) keeps the dependency direction clean.

### 2. Truncation limits — Notes: 10, Total: 100

The ticket specified example values of "N lines (e.g. 10)" for notes and "e.g. 50" for total context lines.

**Decision:** `MAX_NOTES_LINES = 10`, `MAX_TOTAL_CONTEXT_LINES = 100`.

**Rationale:** Conservative notes truncation (10 lines) prevents bloat from assumptions/clarifications. A more generous total context limit (100 lines) allows richer project context (goals, plan phases, constraints) without hitting the ceiling prematurely. The total limit can be tightened later if prompt size becomes a concern.
