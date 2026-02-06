# Ticket 007 - Report Convention and Parser (Text → Structured Report)

## Title

Report Convention and Parser (Text → Structured Report)

## Goal

Define a **strict, text-based report convention** for AI session outputs and implement a **robust parser** that converts plain-text responses into structured `Report` domain objects suitable for governance.

This ticket is critical because:
- The server returns **only text**
- There are **no tool calls or JSON**
- Governance depends on extracting reliable structure from free-form output

---

## Context

From earlier tickets:

- Raw session output is captured as `response.txt` (ticket 006)
- Domain model defines a `Report` object (ticket 004)
- Nexus must judge task outcomes without trusting free-form prose

This ticket establishes the **contract between Nexus and AI sessions**.

---

## Report convention (MVP)

Sessions must produce output following this exact structure. The canonical
constants and helpers mirror this documentation inside
`src/core/report/convention.ts`, so any future edits must update both the doc and
the convention file in tandem.

### Required header

The report **must** start with:

```
# Report — <Role>
```

Example:
```
# Report — Planner
```

---

### Required fields (order matters)

Each field starts on its own line, followed by content.

```
STATUS: success | partial | blocked
```

```
SUMMARY:
<free text, one or more lines>
```

```
ARTIFACTS:
- item
- item
```

```
RISKS:
- item
- item
```

```
NEXT:
- item
- item
```

Notes:
- Bullet lists must start with `- `
- Empty sections are allowed but must still be present
- Field names are **case-sensitive**

---

### Minimal valid report example

```
# Report — Planner

STATUS: success

SUMMARY:
Defined a minimal, parseable report structure.

ARTIFACTS:
- Proposed markdown template

RISKS:
- LLMs may deviate from the format

NEXT:
- Validate with reviewer role
```

---

## Parsing rules

### General
- Parser is **strict** by default
- Deviations produce **actionable errors**
- Parser should be tolerant of extra whitespace but not missing fields

### Role extraction
- Extract role from header
- Must match known `Role` union
- Mismatch between expected role (from run metadata) and header role is an error

---

### Status parsing
- Must be one of:
  - `success`
  - `partial`
  - `blocked`
- Anything else → error

---

### Section parsing
- Sections are delimited by exact section headers:
  - `SUMMARY:`
  - `ARTIFACTS:`
  - `RISKS:`
  - `NEXT:`
- Order must match the convention
- Content continues until the next known section header or EOF
- A `section-order` error is effectively a missing section for downstream
  consumers—the parser raises it the moment a later section appears before the
  expected one, signaling that the skipped section should be treated as absent.

---

### Bullet list parsing
- For `ARTIFACTS`, `RISKS`, `NEXT`:
  - Lines must start with `- `
  - Strip prefix and trim
- If a bullet list section contains no bullets:
  - Parse as empty array (allowed)

---

### Raw text preservation
- The full input text must be preserved verbatim as `rawText` on the `Report`

---

## Error classification

Introduce a small error taxonomy:

```ts
type ReportParseErrorType =
  | 'missing-header'
  | 'invalid-role'
  | 'missing-section'
  | 'invalid-status'
  | 'section-order'
  | 'malformed-bullets'
```

Parser should throw an error including:
- Error type
- Human-readable message
- Snippet of offending text (first ~200 chars)

---

## API design

```ts
interface ParseReportParams {
  expectedRole: Role
  rawText: string
}

function parseReport(
  params: ParseReportParams
): Report
```

- `expectedRole` comes from run metadata (ticket 006)
- If header role ≠ expectedRole → error

---

## Proposed file structure

### New files
```
src/core/report/
  convention.ts      // string constants, section names
  parser.ts
  errors.ts
```

### Updates
- `src/core/domain/report.ts`
  - Ensure it matches parsed output exactly

---

## Integration points

- Used by orchestration layer (later ticket) after a run completes
- Parse errors should:
  - Mark the run as “unusable”
  - Trigger retry or escalation (later governance logic)
- This ticket does **not** decide what happens after a parse failure

---

## Testing

Add tests under `test/report/`:

### Valid cases
- Fully valid report
- Empty bullet sections
- Multi-line summaries

### Invalid cases
- Missing header
- Missing required section
- Invalid status value
- Sections out of order
- Bullets without `- `
- Role mismatch

Tests should assert:
- Correct structured output
- Correct error type and message

---

## Acceptance criteria (Definition of Done)

- [ ] Report convention is documented in code
- [ ] Parser converts valid text into `Report` objects
- [ ] All required fields are enforced
- [ ] Raw text is preserved
- [ ] Parse errors are explicit and classified
- [ ] Tests cover valid and invalid scenarios
- [ ] No orchestration or governance logic included
- [ ] `bun test` passes

---

## Deliverables

- Report convention constants
- Strict report parser with error taxonomy
- Comprehensive tests
