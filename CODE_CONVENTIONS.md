# Code Conventions

This document outlines the coding standards and best practices for the **ChatGPT UX Navigator** project. Adhering to these conventions ensures code consistency, maintainability, and stability across both the extension and the local server.

## Core Principles

1.  **No "AI Slop"**: Code must be intentional, efficient, and verified.
2.  **Zero Build Step (Extension)**: The browser extension must run directly from source. No Webpack, Babel, or transpilation.
3.  **Bun Native (Server)**: The server uses [Bun](https://bun.sh) natively. Do not add Node.js compatibility layers unless absolutely necessary.
4.  **Security First**: All file system operations must be strictly validated to prevent path traversal.

---

## Server (TypeScript & Bun)

### 1. Style & Formatting

- **Indentation**: 4 spaces.
- **Quotes**: Single quotes (`'`) for strings, unless escaping is required.
- **Semicolons**: Always use semicolons.
- **Structure**:
    - Imports at the top.
    - Types/Interfaces defined next or in a separate `types/` file.
    - Exported functions follow.

### 2. TypeScript Best Practices

- **Strict Mode**: `strict: true` is enabled. Do not use `any`. Use `unknown` if necessary and narrow types.
- **Type Definitions**: Use explicit return types for exported functions.

    ```typescript
    // Good
    export function startServer(cfg: AppConfig): void { ... }

    // Avoid
    export function startServer(cfg) { ... }
    ```

- **Imports**: Prefer named imports over default imports.
    ```typescript
    import {Router} from './router'; // Good
    import Router from './router'; // Avoid
    ```

### 3. Bun APIs

- **File I/O**: Use `Bun.file()` and `Bun.write()` instead of `fs.readFile`/`fs.writeFile`.
- **Server**: Use `Bun.serve()` for HTTP and WebSocket handling.
- **Testing**: Use `bun test` for all unit and integration tests.

### 4. Security

- **Path Validation**: **NEVER** trust user input for file paths.
- **Mandatory Check**: Always wrap file system access with `isPathInsideRoot()` from `src/fs/security.ts`.
    ```typescript
    if (!isPathInsideRoot(requestedPath, config.filesRoot)) {
        throw new Error('Access denied');
    }
    ```

### 5. Error Handling

- Use `try/catch` blocks at the route handler level.
- Return appropriate HTTP status codes (400 for bad input, 404 for missing files, 500 for server errors).

---

## Extension (Vanilla JS)

### 1. Architecture

- **No Build Tools**: Write standard ES6+ JavaScript.
- **Namespace**: Use `window.CGPT_NAV` as the single global state container.
- **Module Pattern**: Wrap files in IIFEs (Immediately Invoked Function Expressions) to prevent scope pollution, unless the file is a pure ES module imported by others (though currently `manifest.json` loads scripts sequentially).
    ```javascript
    (() => {
        const {store} = window.CGPT_NAV;
        // ... code ...
    })();
    ```

### 2. Style & Formatting

- **Indentation**: 4 spaces.
- **Quotes**: Single quotes (`'`).
- **Comments**: Use JSDoc format (`/** ... */`) for complex logic or type hinting.

### 3. DOM Interaction

- **Stability**: ChatGPT's classes are obfuscated and change frequently.
    - **Preferred**: Attribute selectors `[data-message-author-role="user"]`.
    - **Avoid**: Long class chains `.flex.flex-col.items-center`.
- **Performance**: Cache DOM lookups where possible, but be aware that the DOM changes dynamically (use `MutationObserver`).

### 4. State Management

- **Global State**: Store shared state in `window.CGPT_NAV.store` or `window.CGPT_NAV.model`.
- **Reactivity**: Use the centralized `observer.js` to react to new messages instead of creating multiple observers.

---

## Testing & Verification

- **Server**: Run `bun test` in the `server/` directory before committing.
- **Extension**: Manual verification required.
    1.  Reload extension in `chrome://extensions`.
    2.  Refresh ChatGPT tab.
    3.  Verify basic flows: Sidebar rendering, navigation, prompt injection, response saving.

## Git Workflow

- **Atomic Commits**: One feature or fix per commit.
- **Message Format**:
    - `feat: add response streaming`
    - `fix: resolve sidebar z-index issue`
    - `docs: update installation steps`
    - `refactor: simplify thread parsing logic`
- **No Broken Code**: Do not commit code that fails `bun test` or breaks the extension build.
