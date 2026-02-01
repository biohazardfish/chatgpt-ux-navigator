# AGENTS.md

_(AI Agent Guide for ChatGPT UX Navigator)_

This file provides context and guidelines for AI agents working on this codebase.

## Project Overview

**ChatGPT UX Navigator** is a dual-component tool designed to enhance the ChatGPT experience for power users.

1.  **Browser Extension**: A Chrome extension (Manifest V3) that injects a sticky sidebar into the ChatGPT interface for navigation, prompt injection, and response saving.
2.  **Local Server**: A lightweight HTTP server built with [Bun](https://bun.sh) that serves local Markdown prompts and handles file inclusions (`@path`).

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
    - `content/markdown.js`: Handles markdown parsing/rendering within the sidebar if needed.
    - `background.js`: Service worker (minimal logic).

### 2. Local Server (`server/`)

- **Tech**: TypeScript, [Bun](https://bun.sh).
- **Build**: No transpilation needed for development; Bun runs TS natively.
- **Entry Point**: `src/index.ts`.
- **Key Logic**:
    - **Prompt Parsing**: Reads `.md` files and resolves `@path` (single file), `@@path` (dir content), and directory trees. Located in `src/prompts/buildPrompt.ts`.
    - **Thread Parsing**: Splits prompts into `# {{USER}}` and `# {{ASSISTANT}}` blocks. Located in `src/prompts/thread.ts`.
    - **API Routes**:
        - `GET /list`: Lists all available prompt files (`.md`).
        - `GET /prompt/<filename>`: Returns processed prompt content with resolved includes.
        - `POST /prompt/<filename>`: Appends assistant response to the specified file.
        - `POST /responses/:id`: Per-client response streaming.
        - `POST /responses/:id/new`: Per-client response streaming with new chat.
        - `GET /ws`: WebSocket endpoint for real-time extension communication.

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
- **Mandatory Check**: Run `bun test` inside the `server/` directory before submitting any changes to the server logic.
- **Coverage**: Ensure new features include corresponding test cases in `server/test/`.

## Code Conventions

- **Extension**:
    - Use **ES Modules** (`import`/`export`).
    - Avoid external libraries to keep the footprint small.
- **Server**:
    - **Modular & Declarative**: Use the internal `Router` for defining routes.
    - **Native Bun APIs**: Prefer `Bun.file`, `Bun.write`, and `Bun.serve` over Node.js equivalents.
    - **Types**: Maintain strict TypeScript typing for all new logic.

## Common Tasks for Agents

- **"Fix the sidebar not appearing"**: Check `extension/content/bootstrap.js` or `observer.js`. The ChatGPT DOM structure may have changed.
- **"Add a new feature to the server"**:
    1.  Create a new handler in `server/src/http/routes/`.
    2.  Register it in `server/src/http/server.ts` using the router.
    3.  Add a test in `server/test/`.
- **"Improve prompt parsing"**: Modify `server/src/prompts/buildPrompt.ts`.
- **"Verify local changes"**:
    - For server: Run `cd server && bun test`.
    - For extension: Reload the extension in `chrome://extensions` and refresh ChatGPT.
