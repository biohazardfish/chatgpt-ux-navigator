# Docs 007 - Conflict and Governance

This document describes how Nexus detects, evaluates, and resolves conflicts, and how governance is enforced throughout a project.

Governance is the defining characteristic of Nexus.  
It is what separates Nexus from a collection of independent AI sessions.

---

## What Is a Conflict

A **conflict** occurs when outputs from sessions cannot be reconciled trivially.

Common examples include:
- Contradictory recommendations
- Mutually exclusive designs
- Disagreement on feasibility or risk
- Inconsistent assumptions
- Diverging interpretations of goals

Not all differences are conflicts.  
Conflicts are differences that affect project direction or correctness.

---

## Conflict Detection

Nexus detects conflicts by:
- Comparing reports from multiple roles
- Checking outputs against project goals and constraints
- Monitoring confidence and uncertainty signals
- Identifying incompatible assumptions

Conflict detection is continuous and automatic.

---

## Levels of Conflict

Conflicts are categorized by severity.

### Minor Conflicts
- Differences in wording or emphasis
- Small implementation details
- Alternative but compatible approaches

Minor conflicts may be resolved automatically by Nexus.

---

### Major Conflicts
- Architectural disagreements
- Strategy or scope differences
- High-risk trade-offs
- Contradictions affecting multiple tasks

Major conflicts trigger escalation.

---

## Governance Authority

Nexus acts as the **governance authority**.

This means Nexus:
- Evaluates competing perspectives
- Weighs evidence and reasoning
- Aligns outcomes with goals and constraints
- Decides whether to proceed, retry, or escalate

Session outputs are advisory, not authoritative.

---

## Conflict Resolution Strategies

Nexus may use one or more of the following strategies:

### 1. Reconciliation
- Merge compatible ideas
- Normalize assumptions
- Resolve ambiguity using project notes

### 2. Additional Perspectives
- Spawn additional reviewer sessions
- Assign a devil’s advocate role
- Request focused clarification

### 3. Confidence Weighting
- Favor outputs with stronger reasoning
- Discount low-confidence or speculative reports

### 4. Plan Alignment
- Prefer solutions that better match the approved plan
- Reject approaches that introduce unapproved scope

---

## User Escalation

When a conflict is major or cannot be resolved confidently, Nexus escalates to the user.

In escalation:
- Nexus pauses execution
- Presents a clear summary of the conflict
- Outlines viable options
- Recommends a preferred path

The user makes the final decision.

---

## Decision Recording

All resolved conflicts that affect project direction result in an explicit **decision record**.

Decision records include:
- The chosen option
- Rationale
- Trade-offs considered
- Date and context

These records become part of the persistent project state.

---

## Preventing Conflict Drift

To reduce repeated conflicts, Nexus:
- Updates project notes
- Clarifies assumptions
- Refines plans and constraints

This allows future tasks to operate with improved alignment.

---

## Governance Guarantees

Nexus guarantees that:
- No major decision is made silently
- Conflicts are surfaced, not hidden
- The user remains in control
- Project state reflects actual decisions

---

## Summary

In Nexus:

- Conflicts are expected and managed
- Nexus governs, sessions advise
- Escalation is intentional, not reactive
- Decisions are explicit and persistent

Governance ensures progress without loss of control.
