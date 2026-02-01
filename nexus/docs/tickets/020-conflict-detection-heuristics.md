# Ticket 020 - Conflict Detection Heuristics (Beyond Status-Level Disagreements)

## Title

Conflict Detection Heuristics (Beyond Status-Level Disagreements)

## Goal

Enhance Nexus governance by introducing **lightweight semantic conflict detection heuristics** that go beyond simple status mismatches, enabling Nexus to:

- Detect **incompatible assumptions or recommendations**
- Surface **hidden disagreements** even when reports share the same status
- Decide more accurately when to **escalate to the user**

This ticket improves **decision quality**, not automation depth.

---

## Context

From earlier tickets:

- Governance currently escalates primarily on status conflicts (ticket 015)
- Reports contain structured fields:
  - `SUMMARY`
  - `ARTIFACTS`
  - `RISKS`
  - `NEXT`
- Nexus must avoid blindly accepting superficially consistent outputs

This ticket introduces **heuristics**, not full semantic reasoning.

---

## Design principles

1. **Heuristics, not truth**
   - Signals of conflict, not proof
2. **Explainable**
   - Every detected conflict must have a human-readable rationale
3. **Low false negatives preferred over low false positives**
   - It’s better to escalate unnecessarily than miss a real conflict
4. **Deterministic**
   - No model calls, no probabilistic behavior

---

## Conflict types (MVP)

Define explicit conflict categories:

```ts
type ConflictType =
  | 'status-mismatch'
  | 'contradictory-artifacts'
  | 'risk-vs-success'
  | 'divergent-next-steps'
  | 'assumption-mismatch'
```

---

## Heuristic rules

### 1. Status mismatch (existing)
Already implemented:
- `success` vs `partial`
- `success` vs `blocked`

Keep as-is.

---

### 2. Contradictory artifacts

Trigger when:
- Two or more reports list **artifacts** that appear mutually exclusive

MVP heuristic:
- Artifact strings that share keywords but differ by negation:
  - e.g. `"Use OAuth2"` vs `"Do not use OAuth2"`
- Simple string checks:
  - presence of `not`, `avoid`, `reject` vs affirmative phrasing

If detected:
- `ConflictType = contradictory-artifacts`

---

### 3. Risk vs success mismatch

Trigger when:
- A report has `STATUS: success`
- Another report lists **high-severity risks**

MVP heuristic:
- Risk entry contains keywords:
  - `blocker`, `critical`, `unsafe`, `data loss`, `security`
- Case-insensitive match

If detected:
- `ConflictType = risk-vs-success`

---

### 4. Divergent next steps

Trigger when:
- Reports propose **incompatible NEXT steps**

MVP heuristic:
- NEXT entries with conflicting verbs:
  - `proceed`, `implement`, `ship`
  - vs `revisit`, `redesign`, `pause`, `validate`

If detected:
- `ConflictType = divergent-next-steps`

---

### 5. Assumption mismatch (lightweight)

Trigger when:
- One report states an assumption explicitly
- Another report contradicts it

MVP heuristic:
- Look for phrases:
  - `assumes`, `assuming`, `based on the assumption`
- Compare for negation or contradiction markers in another report

If detected:
- `ConflictType = assumption-mismatch`

---

## Conflict detection output

Define a structured conflict object:

```ts
interface Conflict {
  type: ConflictType
  rolesInvolved: Role[]
  description: string
  evidence: string[]
}
```

---

## Governance integration

Update governance evaluation (ticket 015):

- After basic status aggregation:
  - Run conflict heuristics
- If **any conflict detected**:
  - Force `GovernanceOutcome = escalate`
  - Include conflicts in escalation context

---

## Escalation context enhancement

When escalating, include:

- List of detected conflicts
- Short explanation per conflict
- Snippets from reports that triggered detection

Example escalation context:

```
Detected conflicts:
- risk-vs-success:
  Planner marked task as success, but Reviewer listed a critical security risk.
- divergent-next-steps:
  Planner suggests proceeding, Reviewer suggests redesign.
```

---

## API design

### Conflict detector

```ts
function detectConflicts(
  reports: Report[]
): Conflict[]
```

### Governance update

```ts
function evaluateReports(...) {
  ...
  const conflicts = detectConflicts(reports)
  if (conflicts.length > 0) {
    outcome = 'escalate'
  }
}
```

---

## Out of scope

- NLP embeddings or similarity models
- External knowledge checks
- Cross-task conflict detection
- Automatic conflict resolution

---

## Proposed file structure

### New files
```
src/core/governance/conflicts/
  detector.ts
  types.ts
  heuristics.ts
```

### Updated files
```
src/core/governance/evaluateReports.ts
```

---

## Implementation steps

1. Define `ConflictType` and `Conflict`
2. Implement heuristic functions per conflict type
3. Aggregate conflicts across all report pairs
4. Integrate into governance evaluation
5. Enhance escalation context generation

---

## Testing

Add tests under `test/governance/conflicts/`:

- Detect contradictory artifacts
- Detect risk-vs-success conflict
- Detect divergent next steps
- No conflicts when reports align
- Multiple conflicts detected simultaneously

Use synthetic `Report` objects.

---

## Acceptance criteria (Definition of Done)

- [ ] Conflict detection runs deterministically
- [ ] At least 4 heuristic conflict types implemented
- [ ] Conflicts trigger escalation reliably
- [ ] Escalation context includes explanations
- [ ] No false crashes on benign reports
- [ ] `bun test` passes

---

## Deliverables

- Conflict detection heuristics
- Structured conflict objects
- Governance integration
- Tests validating detection
