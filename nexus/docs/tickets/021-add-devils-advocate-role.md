# Ticket 021 - Add Devil’s Advocate Role (Proactive Risk Surfacing)

## Title

Add Devil’s Advocate Role (Proactive Risk Surfacing)

## Goal

Introduce a **Devil’s Advocate** role into Nexus so the system can **proactively challenge assumptions and recommendations** before governance, reducing late-stage conflicts and improving decision quality.

This ticket formalizes:
- The Devil’s Advocate role definition
- When and how it is assigned
- How its outputs are interpreted during governance

---

## Context

From earlier tickets:

- Roles are explicit and role-based execution exists (tickets 004, 012, 013)
- Governance can detect conflicts after the fact (ticket 020)
- Escalation is costly and interrupts flow

The Devil’s Advocate role is intended to **surface risks early**, not to block progress by default.

---

## Design principles

1. **Adversarial but constructive**
   - Challenge assumptions, not sabotage outcomes
2. **Explicit scope**
   - Focus on risks, blind spots, and counterexamples
3. **Non-authoritative**
   - Outputs are advisory and weighed by governance
4. **Opt-in by policy**
   - Not every task requires a Devil’s Advocate

---

## Role definition

### Role identifier
Extend the role union:

```ts
type Role =
  | 'planner'
  | 'implementer'
  | 'reviewer'
  | 'researcher'
  | 'devils-advocate'
```

(Already present in earlier domain tickets; this ticket operationalizes it.)

---

### Devil’s Advocate mandate

When assigned, the session must:

- Identify hidden assumptions
- Argue against the proposed approach
- Highlight failure modes and edge cases
- Propose alternative interpretations or risks

It must **not**:
- Produce implementation artifacts
- Rewrite the plan
- Declare final decisions

---

## Prompt specialization

Extend prompt composition to include **role-specific instructions**.

### Devil’s Advocate instruction block

Append to the standard prompt:

```
ROLE-SPECIFIC INSTRUCTIONS:
You are acting as a Devil’s Advocate.
Your job is to actively challenge the task outcome by:
- Identifying flawed assumptions
- Pointing out risks or counterexamples
- Stress-testing the proposal
Do not propose final decisions.
Follow the required report format exactly.
```

This applies **only** when role = `devils-advocate`.

---

## Assignment policy (MVP)

Introduce a simple policy for automatic assignment.

### Auto-assign Devil’s Advocate when:
- Task has **high impact**, defined as:
  - Affects architecture
  - Introduces new system boundaries
  - Has irreversible consequences
- OR task has **multiple primary roles** (e.g., Planner + Implementer)
- OR task is explicitly marked as `highRisk` (optional flag)

For MVP, implement **one deterministic rule**:
- If task has more than one role → append `devils-advocate`

(Keep policy simple and visible.)

---

## ExecutableTask changes

Extend derived task structure:

```ts
interface ExecutableTask {
  taskId: string
  objective: string
  roles: Role[]
  context: TaskContext
  executionMode: ExecutionMode
}
```

Rules:
- Devil’s Advocate is appended **last**
- Execution order:
  - Sequential mode: DA runs last
  - Parallel mode: DA runs in parallel with others

---

## Governance weighting rules

Update governance evaluation:

- Devil’s Advocate reports are:
  - Never ignored
  - Never automatically blocking
- Heuristics:
  - If DA reports `STATUS: blocked`
    → strong signal to escalate
  - If DA reports `partial` with serious risks
    → increase likelihood of escalation
- DA alone cannot force `blocked` outcome without corroboration

---

## Escalation context enhancement

When escalating, include a dedicated section:

```
Devil’s Advocate Findings:
- <summary of key challenges>
```

This ensures the operator clearly sees adversarial input.

---

## Out of scope

- Multiple Devil’s Advocate sessions
- Scoring or weighting systems
- Auto-resolution of DA concerns
- User-configurable DA policies via TUI

---

## Proposed file changes

### Updated files
```
src/core/domain/role.ts
src/core/orchestration/taskAssignment.ts
src/core/orchestration/sessionRunner.ts
src/core/context/renderer.ts
src/core/governance/evaluateReports.ts
```

### Optional (clarity)
```
src/core/orchestration/policies/devilsAdvocate.ts
```

---

## Implementation steps

1. **Confirm role support**
   - Ensure `devils-advocate` is recognized everywhere roles are validated

2. **Assignment policy**
   - Append DA role based on simple rule (multi-role tasks)

3. **Prompt specialization**
   - Inject DA-specific instructions

4. **Execution ordering**
   - Ensure DA runs last (sequential) or concurrently (parallel)

5. **Governance integration**
   - Adjust escalation logic to weight DA reports appropriately
   - Add DA section to escalation context

---

## Testing

Add tests under `test/roles/devilsAdvocate.test.ts`:

- DA role auto-assigned when multiple roles present
- DA prompt includes adversarial instructions
- DA report influences escalation but does not auto-block alone
- Escalation context includes DA findings

Mock reports and execution; no real server calls.

---

## Acceptance criteria (Definition of Done)

- [ ] Devil’s Advocate role is fully supported end-to-end
- [ ] Deterministic assignment policy implemented
- [ ] Prompt instructions are role-specific
- [ ] Governance weights DA input correctly
- [ ] Escalation context surfaces DA findings clearly
- [ ] No breaking changes to existing roles
- [ ] `bun test` passes

---

## Deliverables

- Devil’s Advocate role integration
- Assignment policy
- Governance weighting updates
- Tests validating behavior
