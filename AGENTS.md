# AGENTS.md

_(AI Agent Guide for ChatGPT UX Navigator)_

This file provides context and guidelines for AI agents working on this codebase.

## Project Overview

**ChatGPT UX Navigator** is a Bun-managed monorepo designed to enhance the ChatGPT experience for power users. It consists of multiple workspaces:

1.  **Browser Extension** (`extension/`): A Chrome extension (Manifest V3) that injects a sticky sidebar into the ChatGPT interface for navigation, prompt injection, and response saving.
2.  **Local Server** (`server/`): A lightweight HTTP + WebSocket server built with [Bun](https://bun.sh) that serves local Markdown prompts and handles file inclusions (`@path`).
3.  **Orchestrator** (`orchestrator/`): Planning documentation for "Nexus," a future multi-agent AI orchestration tool. No implementation code yet.

## Monorepo Structure

This project is a **Bun workspace monorepo**. The root `package.json` declares the workspaces and provides top-level scripts.

```
chatgpt-ux-navigator/
├── package.json              # Root monorepo config (workspaces: ["server", "extension"])
├── bunfig.toml               # Bun config (linkWorkspacePackages = true)
├── bun.lock                  # Bun lockfile (workspace-aware)
├── .env.example              # Environment variable template
├── AGENTS.md                 # This file
├── CODE_CONVENTIONS.md       # Coding standards
├── GIT_WORKFLOW.md           # Git branching/commit conventions
├── README.md                 # Project documentation
├── server/                   # @repo/server workspace
├── extension/                # extension workspace
├── orchestrator/             # Nexus docs (not a workspace)
└── prompts/                  # Local-only markdown prompt files (gitignored)
```

### Root Scripts

| Script       | Command                           | Description                         |
| ------------ | --------------------------------- | ----------------------------------- |
| `bun dev`    | `bun --filter @repo/server dev`   | Start server in watch mode          |
| `bun test`   | `bun --filter '*' test`           | Run tests across all workspaces     |
| `bun lint`   | `bun --filter '*' lint`           | Lint all workspaces                 |
| `bun format` | `bun --filter '*' format`         | Format all workspaces               |
| `bun typecheck` | `bun --filter '*' typecheck`   | Type-check all workspaces           |

### Workspace Packages

| Workspace     | Package Name    | Tech                      |
| ------------- | --------------- | ------------------------- |
| `server/`     | `@repo/server`  | TypeScript, Bun           |
| `extension/`  | `extension`     | Vanilla JS (no build)     |

## Architecture & Stack

### 1. Browser Extension (`extension/`)

- **Tech**: Vanilla JavaScript (ES Modules), CSS3, HTML.
- **Build**: **NO BUILD STEP.** The code runs directly in the browser.
- **Global Namespace**: The extension uses `window.CGPT_NAV` to store its state and core objects.
- **Manifest**: V3 (`manifest.json`).
- **Key Files**:
    - `content/bootstrap.js`: Entry point for content scripts.
    - `content/sidebar.js`: Manages the sidebar UI creation and updates.
    - `content/observer.js`: MutationObserver to detect new ChatGPT messages.
    - `content/messaging.js`: Handles communication with the local server.
    - `content/markdown.js`: Handles markdown parsing/rendering within the sidebar.
    - `content/store.js`: State management (uses `window.CGPT_NAV`).
    - `content/streamTap.js`: Stream response tapping/interception.
    - `background.js`: Service worker (minimal logic).
    - `options/`: Extension options page (HTML, CSS, JS).

### 2. Local Server (`server/`, package: `@repo/server`)

- **Tech**: TypeScript, [Bun](https://bun.sh).
- **Build**: No transpilation needed; Bun runs TS natively.
- **Entry Point**: `src/index.ts`.
- **Key Directories**:
    - `src/config/`: Configuration and environment parsing.
    - `src/fs/`: File system operations (security, tree generation, constants).
    - `src/http/`: HTTP server, router, CORS, routes, and response handling (SSE).
    - `src/prompts/`: Prompt building, parsing, include resolution, and thread handling.
    - `src/ws/`: WebSocket hub, handlers, message parsing.
    - `src/types/`: Shared TypeScript type definitions.
- **API Routes**:

    | Method  | Path                    | Description                              |
    | ------- | ----------------------- | ---------------------------------------- |
    | GET     | `/`                     | Index / health check                     |
    | GET     | `/list`                 | List available prompt files (`.md`)       |
    | GET     | `/clients`              | List connected WebSocket clients          |
    | GET     | `/prompt/<filename>`    | Return processed prompt with resolved includes |
    | POST    | `/prompt/<filename>`    | Append assistant response to prompt file  |
    | POST    | `/responses/:id`        | Per-client response streaming             |
    | POST    | `/responses/:id/new`    | Per-client response streaming (new chat)  |
    | GET     | `/ws`                   | WebSocket endpoint for extension comms    |
    | OPTIONS | `.*`                    | CORS preflight                            |

### 3. Orchestrator (`orchestrator/`) -- Planned

- **Status**: Documentation and planning only. No source code.
- **Purpose**: "Nexus" -- a multi-agent AI conversation orchestrator.
- **Contents**: Design specs and implementation tickets in `docs/tickets/`.
- **Note**: Not declared as a Bun workspace.

## Extension Development Rules

- **No Build Steps**: Do NOT introduce Webpack, Babel, or any build tools. The extension must remain readable and runnable directly from source.
- **Vanilla JS Modules**: Use standard ES Modules for organization.
- **DOM Stability**: ChatGPT's CSS classes are dynamic. Prefer stable selectors (e.g., `[data-message-author-role]`) over obfuscated classes.
- **State Management**: Use `window.CGPT_NAV` for persistent state within a page session.
- **UI Consistency**: Sidebar styles in `extension/styles.css` should adapt to ChatGPT's light/dark modes using CSS variables.

## Security Guardrails

- **Path Traversal Protection**: ALL file system operations MUST be validated using `isPathInsideRoot` from `server/src/fs/security.ts`.
- **Root Enforcement**: Ensure no operation can read or write files outside the configured `promptsDir` or `filesRoot`.
- **Input Sanitization**: Always sanitize content when rendering markdown or injecting text into the DOM.

## Testing & Verification

- **Test Runner**: The project uses `bun test` for server-side testing.
- **Test Location**: Tests are located in `server/test/` and use `.test.ts` extension.
- **Running Tests**:
    - From monorepo root: `bun test` (runs tests across all workspaces via `bun --filter '*' test`).
    - From server workspace: `bun test` inside `server/`.
- **Mandatory Check**: Run `bun test` before submitting any changes to the server logic.
- **Coverage**: Ensure new features include corresponding test cases in `server/test/`.

## Code Conventions

Please refer to [CODE_CONVENTIONS.md](./CODE_CONVENTIONS.md) for detailed coding standards.

**Key Highlights:**
-   **Monorepo**: Bun workspaces with `bun --filter` for cross-workspace commands.
-   **Extension**: No build steps, use ES Modules, use `window.CGPT_NAV` namespace.
-   **Server**: Native Bun APIs (`Bun.file`, `Bun.serve`), strict TypeScript.
-   **Security**: MANDATORY use of `isPathInsideRoot()` for all file operations.
-   **Git**: Atomic commits, `bun test` required before commit.

## Common Tasks for Agents

- **"Fix the sidebar not appearing"**: Check `extension/content/bootstrap.js` or `observer.js`. The ChatGPT DOM structure may have changed.
- **"Add a new feature to the server"**:
    1.  Create a new handler in `server/src/http/routes/`.
    2.  Register it in `server/src/http/server.ts` using the router.
    3.  Add a test in `server/test/`.
- **"Improve prompt parsing"**: Modify `server/src/prompts/buildPrompt.ts`.
- **"Add a new workspace/package"**:
    1.  Create the directory with its own `package.json`.
    2.  Add it to the `workspaces` array in the root `package.json`.
    3.  Run `bun install` from the monorepo root to link it.
- **"Run a command in a specific workspace"**: Use `bun --filter <package-name> <script>` from the root.
- **"Verify local changes"**:
    - For server: Run `bun test` from the root or from `server/`.
    - For extension: Reload the extension in `chrome://extensions` and refresh ChatGPT.
