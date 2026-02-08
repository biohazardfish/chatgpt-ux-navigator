#!/usr/bin/env bun
/**
 * Initialises a Nexus example project inside a state directory.
 *
 * Usage:
 *   bun run scripts/init-project.ts [stateDir] [projectId]
 *
 * Arguments:
 *   stateDir   – root state directory (default: ./nexus_state)
 *   projectId  – kebab-case project id   (default: short-film)
 *
 * The script is idempotent: it will NOT overwrite files that already exist,
 * so it is safe to re-run after manual edits.
 */

import {resolve, join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {validateProjectId} from '../src/storage/layout.ts';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const stateDir = resolve(process.cwd(), process.argv[2] ?? './nexus_state');
const projectId = process.argv[3] ?? 'short-film';

if (!validateProjectId(projectId)) {
    console.error(
        `Error: invalid project id "${projectId}" – must match /^[a-z0-9-]+$/`
    );
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const projectsDir = join(stateDir, 'projects');
const projectDir = join(projectsDir, projectId);
const tasksDir = join(projectDir, 'tasks');
const decisionsDir = join(projectDir, 'decisions');
const reportsDir = join(projectDir, 'reports');
const runsDir = join(stateDir, 'runs');
const logsDir = join(stateDir, 'logs');

// ---------------------------------------------------------------------------
// Example file contents
// ---------------------------------------------------------------------------

const CONFIG_JSONC = `{
  // Nexus TUI persisted state.
  // Edit "lastProjectId" to switch the active project on startup.
  "ui": {
    "lastProjectId": "${projectId}",
    "activeView": "dashboard"
  }
}
`;

const PROJECT_MD = `## Project: Write a Short Film Script

## Goals
- Write a compelling 5-minute short film screenplay
- Develop a clear three-act structure (setup, confrontation, resolution)
- Create two memorable characters with distinct voices
- Produce a polished final draft ready for table-read

## Constraints
- Runtime must be under 5 minutes (approx. 5 pages at 1 min/page)
- Genre: sci-fi drama
- Maximum two speaking characters and one location
- No VFX-heavy scenes — keep it producible on a micro-budget

## Non-Goals
- Feature-length expansion (out of scope for this project)
- Storyboard or shot-list creation
- Casting or production scheduling
`;

const PLAN_MD = `## Current Plan

## Status
draft

## Phases
- Phase 1 (researcher): Gather references — study award-winning short screenplays and extract structural patterns
- Phase 2 (planner): Outline the story — define premise, characters, and beat sheet
- Phase 3 (implementer): Write first draft — flesh out dialogue and scene descriptions
- Phase 4 (reviewer): Review and polish — check pacing, dialogue authenticity, and formatting
- Phase 5 (devils-advocate): Stress-test — challenge weak story logic and suggest alternatives

## Notes
- Keep scenes tight; every line should advance character or plot
- Use the "Save the Cat" beat sheet adapted for short form
`;

const NOTES_MD = `## Project Notes
- The working title is "Last Signal"
- Setting: a lone radio operator on a deep-space relay station receives an unexpected transmission
- Tone reference: the short film "World Builder" and the opening of "Moon" (2009)

## Assumptions
- The screenplay follows standard Hollywood format (Courier 12pt, 1 inch margins)
- One script page equals roughly one minute of screen time
- The audience is festival judges and online viewers

## Clarifications
- "Micro-budget" means the film can be shot in a single practical set with available lighting
- "Two speaking characters" — extras or non-speaking background actors are allowed

## Lessons Learned
- (none yet — this section will be updated as the project progresses)
`;

const TASK_001_MD = `## Task T-001 — Research award-winning short screenplays

## Status
pending

## Objective
Identify three to five acclaimed short film scripts (under 10 minutes) and extract common structural patterns, dialogue techniques, and pacing strategies.

## Assigned Roles
- researcher

## Related Goals
- Write a compelling 5-minute short film screenplay
- Develop a clear three-act structure (setup, confrontation, resolution)

## Created At
${new Date().toISOString()}
`;

const TASK_002_MD = `## Task T-002 — Outline story beat sheet

## Status
pending

## Objective
Create a one-page beat sheet covering the premise, character arcs, and scene-by-scene progression for the short film "Last Signal".

## Assigned Roles
- planner

## Related Goals
- Develop a clear three-act structure (setup, confrontation, resolution)
- Create two memorable characters with distinct voices

## Created At
${new Date().toISOString()}
`;

const TASK_003_MD = `## Task T-003 — Write first draft screenplay

## Status
pending

## Objective
Produce the complete first draft of the screenplay in standard format, including slug lines, action descriptions, and dialogue for both characters.

## Assigned Roles
- implementer

## Related Goals
- Write a compelling 5-minute short film screenplay
- Produce a polished final draft ready for table-read

## Created At
${new Date().toISOString()}
`;

const DECISION_001_MD = `## Decision 1 — Genre and Setting

## Date
${new Date().toISOString().split('T')[0]}

## Context
The project needs a genre and setting that work within the micro-budget constraint of a single location and two actors.

## Options Considered
- Psychological thriller in an apartment
- Sci-fi drama on a space station (practical set)
- Romantic comedy in a coffee shop

## Decision
Go with sci-fi drama set on a deep-space relay station. The confined setting naturally limits the cast and location while providing high dramatic stakes.

## Rationale
Sci-fi drama allows for thematic depth (isolation, hope, connection) without requiring expensive visual effects. A single "station interior" set is achievable with set dressing and lighting.

## Consequences
- The script must convey "space" through sound design and dialogue rather than VFX
- Props and set dressing need to suggest technology without a large budget
- Opens the door for festival submissions in the sci-fi short category
`;

const META_JSON = JSON.stringify(
    {
        id: projectId,
        status: 'active',
        createdAt: new Date().toISOString(),
    },
    null,
    4
);

// ---------------------------------------------------------------------------
// File map: path -> content
// ---------------------------------------------------------------------------

const files: [string, string][] = [
    [join(stateDir, 'config.jsonc'), CONFIG_JSONC],
    [join(projectDir, 'project.md'), PROJECT_MD],
    [join(projectDir, 'plan.md'), PLAN_MD],
    [join(projectDir, 'notes.md'), NOTES_MD],
    [join(projectDir, 'meta.json'), META_JSON],
    [join(tasksDir, 'T-001', 'task.md'), TASK_001_MD],
    [join(tasksDir, 'T-002', 'task.md'), TASK_002_MD],
    [join(tasksDir, 'T-003', 'task.md'), TASK_003_MD],
    [join(decisionsDir, '001-genre-and-setting.md'), DECISION_001_MD],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureDir(dir: string): Promise<void> {
    await mkdir(dir, {recursive: true});
}

async function writeIfMissing(path: string, content: string): Promise<boolean> {
    const file = Bun.file(path);
    if (await file.exists()) {
        return false; // already exists — skip
    }
    await Bun.write(path, content);
    return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    console.log(`Initialising example project "${projectId}" in ${stateDir}\n`);

    // Ensure directory tree
    const dirs = [
        stateDir,
        projectsDir,
        projectDir,
        tasksDir,
        join(tasksDir, 'T-001'),
        join(tasksDir, 'T-002'),
        join(tasksDir, 'T-003'),
        decisionsDir,
        reportsDir,
        runsDir,
        logsDir,
    ];

    for (const dir of dirs) {
        await ensureDir(dir);
    }

    // Write files (skip existing)
    let created = 0;
    let skipped = 0;

    for (const [path, content] of files) {
        const wasCreated = await writeIfMissing(path, content);
        if (wasCreated) {
            const rel = path.replace(stateDir + '/', '');
            console.log(`  + ${rel}`);
            created++;
        } else {
            const rel = path.replace(stateDir + '/', '');
            console.log(`  ~ ${rel} (already exists, skipped)`);
            skipped++;
        }
    }

    console.log(`\nDone — ${created} file(s) created, ${skipped} skipped.`);
    console.log(`\nProject layout:`);
    console.log(`  ${stateDir}/`);
    console.log(`  ├── config.jsonc`);
    console.log(`  ├── logs/`);
    console.log(`  ├── runs/`);
    console.log(`  └── projects/`);
    console.log(`      └── ${projectId}/`);
    console.log(`          ├── project.md        # Project definition (goals, constraints)`);
    console.log(`          ├── plan.md            # Execution plan with phases`);
    console.log(`          ├── notes.md           # Working notes and assumptions`);
    console.log(`          ├── meta.json          # Machine-readable metadata`);
    console.log(`          ├── tasks/`);
    console.log(`          │   ├── T-001/task.md  # Research short screenplays`);
    console.log(`          │   ├── T-002/task.md  # Outline story beat sheet`);
    console.log(`          │   └── T-003/task.md  # Write first draft screenplay`);
    console.log(`          ├── decisions/`);
    console.log(`          │   └── 001-genre-and-setting.md`);
    console.log(`          └── reports/`);
    console.log(`\nRun "bun dev" (or "bun start") to open the Nexus TUI.`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
