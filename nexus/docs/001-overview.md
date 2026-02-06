# Docs 001 - Nexus — Overview

Nexus is a local orchestration system designed to help users **drive large, complex tasks to completion** using multiple ChatGPT sessions (MVP: sequential orchestration; parallel execution is future work).

It acts as a **governing control plane** that plans work, delegates tasks to AI sessions, evaluates results, resolves conflicts, and decides what to do next — while keeping the human user in the loop for major decisions.

Nexus is not a chatbot.  
It is not an autonomous agent.  
It is an operator-oriented system for coordinated AI-assisted work.

---

## The Problem Nexus Solves

Modern AI tools are powerful, but scaling them to real-world work quickly breaks down:

- One chat thread becomes overloaded
- Context gets lost or diluted
- Different perspectives (planning, implementation, review) collide
- Users must manually coordinate multiple conversations
- Long-running efforts lack structure and memory

Nexus addresses this by introducing **explicit orchestration**:

- Clear goals and plans
- Structured task delegation
- Sequential execution (MVP; parallel execution is future work)
- Centralized decision-making
- Persistent project state

---

## What Nexus Is

At a high level, Nexus:

- Maintains a **project-level state**
    - goals
    - plans
    - notes
    - decisions
- Breaks work into **large, human-sized tasks**
- Assigns tasks to **ChatGPT sessions with specific roles**
    - planner
    - implementer
    - reviewer
    - etc.
- Collects structured reports from those sessions
- Resolves conflicts and determines next steps
- (Future work) Pauses for **user approval at major decision points**

Nexus runs as a **local TUI (terminal UI)** application and communicates with the existing local server and browser extension to control ChatGPT sessions.

---

## What Nexus Is Not

To set expectations clearly, Nexus does **not**:

- Operate fully autonomously
- Persist ChatGPT conversations across restarts
- Replace human judgment
- Guarantee correctness
- Attempt to “think like a human” indefinitely

ChatGPT sessions are treated as **ephemeral workers**.  
Nexus is the long-lived coordinator.

---

## Relationship to Existing Components

Nexus builds on the existing system:

- **Browser Extension**
    - Manages ChatGPT UI interaction
    - Observes messages
    - Injects prompts
- **Local Server**
    - Manages prompt files
    - Returns buffered JSON responses (MVP; no streaming UI)
    - Provides session-level control
- **Nexus (new)**
    - Decides _what_ should happen next
    - Orchestrates _which_ sessions do the work
    - Maintains _why_ decisions were made

Nexus never talks to ChatGPT directly.  
All interaction goes through the server and extension.

---

## Design Philosophy

Nexus is built around the following principles:

- **Governance over autonomy**  
  AI executes; Nexus decides; user approval points are future work.

- **Explicit state over implicit memory**  
  All important context lives in inspectable project state.

- **Sequential orchestration (MVP)**  
  One session runs at a time; parallelism with centralized reconciliation is future work.

- **Local-first and transparent**  
  No cloud dependency, no hidden processes.

- **Software engineering as the primary use case**  
  Generalization is possible, but engineering workflows come first.

---

## Intended Use Cases

Nexus is designed for:

- Planning and breaking down large software projects
- Generating and refining implementation tickets
- Coordinating implementation and review cycles
- Managing architectural decisions
- Any complex, multi-step knowledge work where structure matters
