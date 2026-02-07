# ChatGPT UX Navigator – User Guide

A comprehensive guide for power users and developers using ChatGPT UX Navigator to enhance your ChatGPT workflow with local prompt management, navigation, and programmatic API access.

## Table of Contents

1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Installation & Setup](#installation--setup)
4. [The Sidebar UI](#the-sidebar-ui)
5. [Prompt Management](#prompt-management)
6. [WebSocket Streaming Mode](#websocket-streaming-mode)
7. [Responses API (Programmatic Access)](#responses-api-programmatic-access)
8. [Nexus: AI Project Orchestration](#nexus-ai-project-orchestration)
9. [Keyboard Shortcuts & Tips](#keyboard-shortcuts--tips)
10. [Troubleshooting](#troubleshooting)
11. [Security Notes](#security-notes)

---

## Introduction

**ChatGPT UX Navigator** is a dual-component tool designed for power users and developers who want to:

- **Navigate long ChatGPT conversations** with a sticky sidebar that jumps between messages
- **Manage prompts locally** in Markdown files with intelligent file inclusion syntax (`@path`)
- **Save ChatGPT responses** automatically back to your local filesystem
- **Automate ChatGPT interactions** via a programmatic HTTP API with WebSocket streaming support
- **Integrate ChatGPT** into your development workflows (CLI tools, scripts, external applications)

### Architecture

The tool consists of two components:

1. **Browser Extension** (Vanilla JavaScript, no build step)
    - Injects a sticky navigation sidebar into ChatGPT
    - Displays all messages with previews and code block navigation
    - Handles prompt selection, injection, and response saving
    - Optionally connects to a WebSocket server for real-time streaming

2. **Local HTTP Server** (TypeScript + Bun)
    - Serves prompt files from your local filesystem
    - Resolves `@path` and `@@path` file inclusion syntax
    - Provides HTTP REST API and WebSocket support
    - Forwards prompts to the extension and receives ChatGPT responses
    - Saves responses back to your Markdown files

---

## Prerequisites

Before you begin, ensure you have:

- **Bun** (https://bun.sh) – The server is built with Bun and requires it to run
- **Chrome, Edge, Brave, or other Chromium-based browser** – The extension is a Manifest V3 extension
- **Local filesystem access** – You need a directory to store your prompt Markdown files
- **Terminal/command-line access** – To start the server and run commands

---

## Installation & Setup

### Step 1: Configure the Server

Create a `.env` file in the project root to configure the server:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Server port (default: 8765)
PORT=8765

# Directory where your prompt .md files are stored
# Relative paths are resolved from the project root
PROMPTS_DIR=./prompts

# Root directory for @path file inclusion (@path syntax is relative to this)
# Relative paths are resolved from the project root
FILES_ROOT=./

# If true, disable SSE streaming and return single JSON responses instead
NO_STREAM=false

# If true, emit raw upstream ChatGPT events for debugging
DEBUG_EVENTS=false
```

**Key Configuration Details:**

- **`PROMPTS_DIR`**: Where the extension looks for `.md` prompt files. Used in the sidebar dropdown.
- **`FILES_ROOT`**: The base directory for `@path` and `@@path` file inclusion. For security, paths cannot escape this directory.
- **`NO_STREAM`**: If `true`, API responses return complete JSON objects instead of SSE streams. Useful for non-streaming integrations.
- **`DEBUG_EVENTS`**: If `true`, logs raw ChatGPT SSE events to stdout (verbose; useful for debugging only).

### Step 2: Start the Server

Navigate to the server directory and start it:

```bash
cd server
bun install
bun run src/index.ts
```

You should see output like:

```
🚀 Server listening on http://localhost:8765
```

**For development with auto-restart on file changes:**

```bash
bun run dev
```

### Step 3: Install the Chrome Extension

1. Open your Chromium-based browser and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `extension` folder from this repository
5. The extension should now appear in your extensions list

You should see the Navigator icon in your extension toolbar.

### Step 4: Configure the Extension's Server URL (Optional)

The extension defaults to `http://localhost:8765`. If your server runs on a different host/port:

1. Right-click the Navigator extension icon → **Options**
2. Enter your server URL (e.g., `http://192.168.1.100:8765`)
3. Click **Save**

Now reload ChatGPT to activate the extension.

---

## The Sidebar UI

Open ChatGPT and look for the Navigator sidebar on the right side of the page. It's a dark, semi-transparent panel with the extension's features.

### Keyboard Shortcut

**`Ctrl+Shift+Y`** – Toggles the sidebar visible/hidden. This is the quickest way to open the Navigator if the sidebar is collapsed.

### Header Controls

The top of the sidebar contains a row of controls:

```
Navigator | 🔌❌ | 🆕 | 💾 | 📋 | ✖️
```

- **Navigator** – Title; indicates the sidebar is active
- **🔌❌ (WebSocket toggle)** – Enable/disable WebSocket streaming mode (see [WebSocket Streaming Mode](#websocket-streaming-mode))
    - 🔌❌ = disabled (not connected)
    - 🔌🟢 = enabled (connected to server)
- **🆕 (New temporary chat)** – Starts a fresh temporary ChatGPT conversation (useful for isolated prompts)
- **💾 (Save)** – Saves the last assistant message to the currently selected prompt file (appended as `# {{ASSISTANT}}` section)
- **📋 (Copy thread)** – Copies the entire visible conversation as structured Markdown to your clipboard (with `# {{USER}}`/`# {{ASSISTANT}}` headers)
- **✖️ (Hide)** – Collapses the sidebar; use `Ctrl+Shift+Y` to toggle it back

### Client ID Input

Below the header, you'll see an input field:

```
[                          ]  Client ID
```

If you want to use **WebSocket streaming mode**, enter a unique identifier here (e.g., `my-chat-1` or `claude-dev`). This allows the server to recognize which browser session you're using for programmatic API calls.

This field is optional; leave it blank if you don't need WebSocket mode.

### Prompts Section

This collapsible section shows the prompts available from your `PROMPTS_DIR`:

```
▼ Prompts
  [Dropdown: Select a prompt...]  🔄
  [User message 1]
  [User message 2]
  ...
```

**Dropdown**: Click to select a prompt file from your `PROMPTS_DIR`. The sidebar automatically parses the file and displays all `# {{USER}}` messages as clickable buttons.

**Buttons**: Each user message in the selected prompt file becomes a clickable button. Click one to inject its content into the ChatGPT input box. The text is inserted via a synthetic paste event (safe and reliable).

**🔄 (Refresh)**: Reloads the prompts list from the server. Use this if you've added new `.md` files to your prompts directory.

### Filters & Controls

Below the prompts section:

```
☑️ User  ☑️ Assistant  Tokens: 1,245  🔄
```

- **☑️ User** – Toggle to show/hide user messages in the message list
- **☑️ Assistant** – Toggle to show/hide assistant messages in the message list
- **Tokens** – Rough token count estimate for visible messages (using simple heuristics)
- **🔄** – Refresh the message list (useful if the sidebar gets out of sync)

### Message List

The main scrollable area below filters shows all conversation messages:

```
┌─────────────────────────────────┐
│ 🟦 USER #3                      │
│ ↑  ↓                             │
│ "What is the capital of..."     │
│ [Code: 1 2]                     │
├─────────────────────────────────┤
│ 🟪 ASSISTANT #4 (active)        │
│ ↑  ↓                             │
│ "The capital of France is..."   │
│ [Code: 1 2 3]                   │
└─────────────────────────────────┘
```

**Each message item shows:**

- **Role label** (🟦 USER or 🟪 ASSISTANT) – Click to scroll to that message in the main chat
- **Index** (#3, #4, ...) – Message position in the conversation
- **"active"** indicator – Highlights which message is currently in the viewport (updated as you scroll)
- **3-line preview** – First 3 lines of the message content for quick scanning
- **↑ ↓ navigation buttons** – Jump to the previous/next message in the conversation
- **[Code: 1 2 3]** – Code block jump buttons (only for assistant messages with code blocks)
    - Click a number to scroll directly to that code block in the message
    - Useful when an assistant message contains multiple code snippets

**Navigation**: Click the role label or index to scroll the main ChatGPT conversation to that message. Use the ↑/↓ buttons to navigate sequentially.

---

## Prompt Management

### Writing Your First Prompt

Prompts are plain Markdown files (`.md`) stored in your `PROMPTS_DIR`. Create a new file:

**`prompts/refactor-code.md`:**

```markdown
# {{USER}}

Refactor the following code to be more functional and cleaner:

@./src/legacy-code.js

# {{ASSISTANT}}

(This section will be auto-filled when you click Save in the sidebar)
```

Save this file, then:

1. Open ChatGPT in your browser
2. In the Navigator sidebar, click the dropdown and select `refactor-code`
3. Click the "[Refactor the following code...]" button to inject the prompt
4. ChatGPT will respond
5. Click the **Save** button (💾) in the sidebar to append ChatGPT's response to the `# {{ASSISTANT}}` section

Your file now contains a complete conversation thread that you can review, edit, and reuse.

### Thread Format: `# {{USER}}` and `# {{ASSISTANT}}`

Prompts use a special Markdown format to organize multi-turn conversations:

```markdown
# {{USER}}

Your first question here.

# {{ASSISTANT}}

ChatGPT's response here.

# {{USER}}

Your follow-up question here.

# {{ASSISTANT}}

ChatGPT's follow-up response here.
```

**Benefits:**

- Preserves conversation structure in plain text
- Easy to edit and version control with Git
- Can be sent back to ChatGPT via the API as a full thread

**Parsing:**

- Lines starting with `# {{USER}}` mark a user message section
- Lines starting with `# {{ASSISTANT}}` mark an assistant message section
- Everything between headers belongs to that section
- The server automatically parses these when processing prompts

### File Inclusion: `@path` and `@@path`

Include file and directory content directly in your prompts using special syntax.

#### Single File: `@path`

```markdown
# {{USER}}

Review this code:

@./src/components/Button.tsx

Include any suggestions for improvement.
```

**Result:** The full contents of `src/components/Button.tsx` are inserted in place of `@./src/components/Button.tsx`, wrapped in a code fence:

````
# {{USER}}

Review this code:

**File: src/components/Button.tsx**
```tsx
... full file content ...
````

Include any suggestions for improvement.

````

**Rules:**

- Path is relative to `FILES_ROOT` (configured in `.env`)
- Paths are resolved securely; they cannot escape `FILES_ROOT` (prevents path traversal attacks)
- Both absolute and relative paths work
- File extension determines the code fence language (e.g., `.tsx` → ` ```tsx`)

#### Directory Tree: `@dir`

```markdown
# {{USER}}

Here is my project structure:

@./src
````

**Result:** An ASCII tree of all files and directories under `src`:

```
# {{USER}}

Here is my project structure:

**Directory: src**
```

src/
├── components/
│ ├── Button.tsx
│ └── Modal.tsx
├── hooks/
│ ├── useAuth.ts
│ └── useFetch.ts
├── utils/
│ └── helpers.ts
└── index.ts

```

```

**Rules:**

- Shows all files and subdirectories recursively
- No file contents, just structure
- Useful for context about your project layout

#### Directory Concat: `@@dir`

```markdown
# {{USER}}

Here are the helper functions:

@@./src/utils
```

**Result:** All `.md`, `.ts`, `.js`, `.tsx`, `.jsx` files in the directory (first level only) are concatenated:

````
# {{USER}}

Here are the helper functions:

**File: src/utils/helpers.ts**
```ts
... full contents of helpers.ts ...
````

**File: src/utils/constants.ts**

```ts
... full contents of constants.ts ...
```

````

**Rules:**

- Includes only first-level files (not nested subdirectories)
- File type filtered (common source files like `.ts`, `.js`, `.tsx`, etc.)
- Each file is wrapped in its own code fence
- Useful for sharing a whole module

#### Path Traversal Protection

All paths are validated. You **cannot** use `../` to escape `FILES_ROOT`:

```markdown
# Bad – This will NOT work:

@../../etc/passwd
````

The server rejects any path that tries to go outside the configured `FILES_ROOT` directory.

### Injecting Prompts

Once you've selected a prompt file from the dropdown:

1. The sidebar displays all `# {{USER}}` message blocks as clickable buttons
2. Click any button to inject that prompt text into the ChatGPT input box
3. The text is inserted safely via a synthetic paste event (avoids browser security restrictions)
4. The input box is ready for you to submit (you can edit the text or click Send immediately)

If the injection doesn't work:

- Make sure the chat input box is visible
- Refresh the sidebar (**🔄** button)
- Manually copy the prompt text and paste it

### Saving Responses

After ChatGPT replies:

1. Click the **Save** button (💾) in the sidebar header
2. The last assistant message is automatically appended to your prompt file as a new `# {{ASSISTANT}}` section
3. The response is saved as Markdown (formatted nicely, code blocks preserved)

**Example:**

Before saving:

```markdown
# {{USER}}

Refactor this code:

@./src/legacy-code.js

# {{ASSISTANT}}
```

After saving:

````markdown
# {{USER}}

Refactor this code:

@./src/legacy-code.js

# {{ASSISTANT}}

Here's a refactored version using more functional patterns:

**File: src/legacy-code.js**

```javascript
... ChatGPT's refactored code ...
```
````

This approach is much cleaner and easier to maintain.

````

### Copying the Full Thread

Click the **Copy thread** button (📋) to copy the entire visible conversation as Markdown to your clipboard:

```markdown
# {{USER}}

What is the capital of France?

# {{ASSISTANT}}

The capital of France is Paris.

# {{USER}}

Tell me more about its history.

# {{ASSISTANT}}

Paris has a rich history dating back to the 3rd century...
````

You can then paste this into a file, email, documentation, or anywhere else.

---

## WebSocket Streaming Mode

For real-time, low-latency automation workflows, ChatGPT UX Navigator supports a WebSocket streaming bridge that lets external programs send prompts to ChatGPT and receive responses programmatically.

### Enabling WebSocket Mode

1. **Enter a Client ID** – In the sidebar, enter a unique identifier in the "Client ID" input field (e.g., `my-app-1` or `automation-bot`). This identifies your browser session to the server.

2. **Toggle WebSocket** – Click the WebSocket toggle button (🔌) in the sidebar header. It should change to 🔌🟢 (connected).

3. **Verify connection** – The toggle should stay green. If it turns red, check:
    - Is the server running? (`bun run src/index.ts` in the `server/` directory)
    - Is the Client ID entered?
    - Are there any errors in the browser console? (Open DevTools: F12)

### How WebSocket Streaming Works

Here's the architecture:

```
External App
    ↓ (POST /responses/:clientId)
    │
Bun Server
    ↓ (WebSocket send)
    │
Content Script (streamTap.js)
    ↓ (inject + submit)
    │
ChatGPT Page
    ↓ (SSE response)
    │
Injected Page Hook (pageHook.js)
    ↓ (window.postMessage)
    │
Content Script (streamTap.js)
    ↓ (WebSocket send)
    │
Bun Server
    ↓ (HTTP SSE response)
    │
External App (receives streaming response)
```

**Step-by-step:**

1. External app (script, CLI tool, etc.) POSTs a JSON prompt to `POST /responses/my-app-1`
2. Server sends the prompt to the browser via WebSocket
3. Content script (`streamTap.js`) receives it and injects the prompt text into ChatGPT's input box
4. Content script submits the chat
5. ChatGPT responds with an SSE stream
6. Injected page hook (`pageHook.js`, running in the page world) intercepts the fetch request to ChatGPT's API
7. Page hook extracts text deltas from ChatGPT's SSE events and posts them back to the content script
8. Content script forwards them to the server via WebSocket
9. Server converts them to OpenAI-compatible SSE events and streams them back to the HTTP caller
10. Caller receives the complete, formatted response

### Use Cases

- **CLI automation**: Send prompts from your terminal and get responses programmatically
- **Scheduled tasks**: Trigger ChatGPT interactions on a schedule (cron, etc.)
- **Integration with external tools**: Pipe ChatGPT into your development workflows
- **Batch processing**: Process multiple prompts sequentially and save results to files

---

## Responses API (Programmatic Access)

The server exposes a RESTful HTTP API for programmatic control. This is perfect for automation, CLI tools, and external integrations.

### Endpoint Overview

| Method | Endpoint                   | Purpose                                          |
| ------ | -------------------------- | ------------------------------------------------ |
| `GET`  | `/`                        | Server status and route listing                  |
| `GET`  | `/list`                    | List all available prompt files                  |
| `GET`  | `/prompt/:filename`        | Get processed prompt (with `@path` resolved)     |
| `POST` | `/prompt/:filename`        | Save assistant response to file                  |
| `GET`  | `/clients`                 | List connected WebSocket client IDs              |
| `POST` | `/responses/:clientId`     | Send prompt to client (continue chat)            |
| `POST` | `/responses/:clientId/new` | Send prompt to client (start new temporary chat) |

### GET / – Server Status

Returns general information about the server and available endpoints.

**Request:**

```bash
curl http://localhost:8765/
```

**Response:**

```json
{
  "message": "ChatGPT UX Navigator Server",
  "port": 8765,
  "routes": [
    "GET /",
    "GET /list",
    "GET /prompt/:filename",
    ...
  ]
}
```

### GET /list – List Prompts

Lists all `.md` files in the configured `PROMPTS_DIR`.

**Request:**

```bash
curl http://localhost:8765/list
```

**Response:**

```json
["refactor-code.md", "debug-issue.md", "write-tests.md"]
```

### GET /prompt/:filename – Get Processed Prompt

Retrieves a prompt file with all `@path` and `@@path` includes resolved.

**Request:**

```bash
curl http://localhost:8765/prompt/refactor-code.md
```

**Response:**

    ````markdown
    # {{USER}}

    Refactor the following code to be more functional:

    **File: src/legacy-code.js**

    ```javascript
    ... full file content ...
    ```

    # {{ASSISTANT}}

    ````

**Use case:** Fetch a prompt in your script before sending it to the API.

### POST /prompt/:filename – Save Response

Appends an assistant response to a prompt file (adds a new `# {{ASSISTANT}}` section).

**Request:**

```bash
curl -X POST http://localhost:8765/prompt/refactor-code.md \
  -H "Content-Type: application/json" \
  -d '{"response": "Here is the refactored code..."}'
```

**Response:**

    ```json
    {
        "ok": true,
        "filename": "refactor-code.md"
    }
    ```

**What it does:** Appends the response as a new `# {{ASSISTANT}}` section to the file. This is how the sidebar's Save button (💾) works.

### GET /clients – List Connected WebSocket Clients

Returns all currently connected client IDs (useful for monitoring).

**Request:**

```bash
curl http://localhost:8765/clients
```

**Response:**

```json
{
    "clients": ["my-app-1", "automation-bot"],
    "count": 2
}
```

### POST /responses/:clientId – Send Prompt (Continue Chat)

Sends a prompt to a connected WebSocket client and receives the ChatGPT response in real-time via SSE streaming.

**Request:**

```bash
curl -X POST http://localhost:8765/responses/my-app-1 \
  -H "Content-Type: application/json" \
  -d '{
    "input": "What is the capital of France?"
  }'
```

**Response:** SSE stream (if `NO_STREAM=false`) or JSON (if `NO_STREAM=true`).

**SSE Stream:**

```
event: response.created
data: {"id":"resp_abc123","created_at":1234567890}

event: output_text.delta
data: {"delta":"The"}

event: output_text.delta
data: {"delta":" capital"}

event: output_text.delta
data: {"delta":" of"}

...

event: response.completed
data: {"id":"resp_abc123","text":"The capital of France is Paris."}
```

**Consume the stream in your code:**

```bash
curl -X POST http://localhost:8765/responses/my-app-1 \
  -H "Content-Type: application/json" \
  -d '{"input": "What is the capital of France?"}' \
  | while IFS= read -r line; do
      echo "$line"
    done
```

**Request Body Formats:**

The API is flexible and accepts multiple formats for the prompt:

**Simple string:**

```json
{
    "input": "What is the capital of France?"
}
```

**OpenAI message array format:**

```json
{
    "input": [{"role": "user", "content": "What is the capital of France?"}]
}
```

**Messages field (alternative):**

```json
{
    "messages": [{"role": "user", "content": "Refactor this code:\n\n@./src/app.js"}]
}
```

**With template resolution:** If your prompt contains `@path` syntax, the server automatically resolves it:

```json
{
    "input": "Review this code:\n\n@./src/components/Button.tsx"
}
```

The `@./src/components/Button.tsx` is resolved to the actual file content before sending to ChatGPT.

### POST /responses/:clientId/new – Send Prompt (New Chat)

Same as above, but forces a new temporary ChatGPT conversation first.

**Request:**

```bash
curl -X POST http://localhost:8765/responses/my-app-1/new \
  -H "Content-Type: application/json" \
  -d '{"input": "Start fresh: What is AI?"}'
```

**Use case:** When you want to isolate a prompt in its own conversation (no context from previous turns).

### Response Streaming: SSE vs. JSON

The server supports two response modes:

**1. SSE Streaming (default, `NO_STREAM=false`):**

Responses are streamed in real-time as Server-Sent Events (SSE). Text deltas arrive as they're generated:

```bash
curl -X POST http://localhost:8765/responses/my-app-1 \
  -H "Content-Type: application/json" \
  -d '{"input": "Write a poem about coding", "stream": true}'
```

Output:

```
event: output_text.delta
data: {"delta":"Here"}

event: output_text.delta
data: {"delta":" is"}

event: output_text.delta
data: {"delta":" a"}

...
```

**Pros:**

- Real-time response (see text as it arrives)
- Responsive user experience
- Faster perceived latency

**Cons:**

- Requires a client that handles SSE
- More complex to parse

**2. JSON Mode (`NO_STREAM=true` or `NO_STREAM=false` with client not supporting SSE):**

Responses are buffered and returned as a single JSON object when complete.

```bash
curl -X POST http://localhost:8765/responses/my-app-1 \
  -H "Content-Type: application/json" \
  -d '{"input": "Write a poem about coding", "stream": false}'
```

Output:

```json
{
    "id": "resp_abc123",
    "created_at": 1234567890,
    "status": "completed",
    "output_text": "Here is a poem about coding:\n\nBits and bytes...",
    "usage": {
        "input_tokens": 5,
        "output_tokens": 42
    }
}
```

**Pros:**

- Simple to parse (standard JSON)
- Easy to integrate with any language
- Complete response guaranteed

**Cons:**

- Requires waiting for entire response
- Slower perceived latency (user has to wait)

### Example: CLI Tool Using the Responses API

Use the included `send-request.ts` script to send prompts from the command line:

```bash
cd server
bun run scripts/send-request.ts message my-app-1
```

This reads a prompt from `scripts/request.md`, sends it to the server, and streams the response.

**Edit `scripts/request.md` to change the prompt:**

```markdown
# {{USER}}

What are the top 5 programming languages in 2025?
```

Then run:

```bash
bun run scripts/send-request.ts message my-app-1
```

The response streams back to your terminal.

**Using with new chat:**

```bash
bun run scripts/send-request.ts new my-app-1
```

This sends the prompt to a fresh temporary chat instead.

### Building Your Own Integrations

Here's a Node.js/Bun example:

```typescript
const clientId = 'my-app-1';
const prompt = 'What is machine learning?';

const response = await fetch(`http://localhost:8765/responses/${clientId}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({input: prompt}),
});

// Handle SSE stream
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
    const {done, value} = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split('\n');

    for (const line of lines) {
        if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (data.delta) {
                process.stdout.write(data.delta);
            }
        }
    }
}
```

### Error Handling

**Client not connected:**

```json
{
    "error": "Client 'my-app-1' not connected."
}
```

**Another request in-flight:**

```json
{
    "error": "Another request in-flight for client 'my-app-1'."
}
```

**Invalid JSON:**

```json
{
    "error": "Invalid JSON"
}
```

**Missing prompt:**

```json
{
    "error": "Missing user prompt. Provide {input:\"...\"} or {input:[{role:\"user\",content:\"...\"}]}."
}
```

---

## Nexus: AI Project Orchestration

**Nexus** is an advanced sub-component that transforms multi-session AI work from chaotic to structured. It's a local orchestration system for managing complex, multi-role AI-assisted projects with governance, persistent state, and user control.

### What is Nexus?

Nexus is a **terminal UI (TUI)-based project orchestration tool** that coordinates multiple ChatGPT sessions through the Navigator extension and local server. Unlike standalone chatbots, Nexus enables:

- **Structured Multi-Role Workflows** – Delegate tasks to specialized AI roles (planner, implementer, reviewer, researcher, devil's advocate)
- **Persistent Project State** – Keep all goals, plans, decisions, and artifacts in local Markdown files
- **Governance & Control** – Record decisions, evaluate results, maintain audit trails
- **Sequential Task Execution** – Execute complex projects step-by-step with role-based responsibility
- **User-Centric Design** – Keep humans in control at all decision points (not fully autonomous)

### Architecture: How Nexus Works

Nexus orchestrates ChatGPT through the existing Browser Extension and Local Server:

```
User → Nexus TUI → Local Server → Browser Extension → ChatGPT Web UI
                      ↓
                 (via WebSocket)
```

**Key difference from direct API use:** Nexus doesn't call model APIs directly. Instead, it:

1. Prepares prompts with full context
2. Sends them to the local server with a role name (e.g., `POST /responses/planner/new`)
3. Browser extension injects the prompt into ChatGPT
4. Captures the response
5. Stores results locally for governance and context

### Installation

Nexus is located in the `nexus/` subdirectory. Install it alongside the server and extension:

```bash
cd nexus
bun install
```

### Running Nexus

**Interactive TUI Mode (default):**

```bash
cd nexus
bun dev
```

You'll see a terminal UI with multiple views (Dashboard, Tasks, Sessions, Decisions, Logs). Use keyboard commands to navigate.

**Non-Interactive Mode (for CI/automation):**

```bash
cd nexus
NEXUS_TUI_AUTORUN=1 NEXUS_TUI_EXIT_AFTER_RUN=1 bun dev
```

**Run Tests:**

```bash
cd nexus
bun test
```

### Configuration

Nexus reads configuration from `nexus.config.json` (or `nexus.config.jsonc` with comments):

```jsonc
{
    // Base URL of the local server (where extension + prompts are hosted)
    "serverBaseUrl": "http://localhost:8765",

    // Directory where project state is stored
    "stateDir": "./nexus_state",

    // Log level: "trace", "debug", "info", "warn", "error"
    "logLevel": "info",
}
```

**Environment Variable Overrides:**

- `NEXUS_CONFIG_FILE` – Path to config file
- `NEXUS_SERVER_BASE_URL` – Override serverBaseUrl
- `NEXUS_STATE_DIR` – Override stateDir
- `NEXUS_LOG_LEVEL` – Override logLevel
- `NEXUS_TUI_AUTORUN` – Set to 1 for non-interactive mode
- `NEXUS_TUI_EXIT_AFTER_RUN` – Set to 1 to exit after first run

### Project Structure

Nexus organizes work into **projects** and **tasks**. Each project has a goal, constraints, plan, and decisions:

```
nexus_state/
├── projects/
│   └── my-project/
│       ├── project.md          # Main project file (goals, plan, decisions)
│       └── tasks/
│           ├── task-1.md       # Individual task definitions
│           └── task-2.md
├── runs/
│   └── my-project/
│       └── run-2025-02-07T10.30.00Z/
│           ├── meta.json       # Run metadata (ID, timestamp, roles executed)
│           ├── 01-planner/
│           │   ├── prompt.txt  # Prompt sent to this role
│           │   └── response.txt # Response from ChatGPT
│           ├── 02-implementer/
│           │   ├── prompt.txt
│           │   └── response.txt
│           └── ...
├── decisions/                   # Decision log
├── logs/                        # Application logs
└── config.jsonc               # Persisted UI state
```

### Creating a Project

Create a Markdown file at `nexus_state/projects/my-project/project.md`:

```markdown
# Project: Build a CLI Tool

## Goals

- Create a command-line tool for batch processing
- Support multiple input formats (CSV, JSON, YAML)
- Provide clear error messages and logging

## Constraints

- Must work on macOS, Linux, Windows
- No external dependencies (use Bun built-ins)
- License: MIT

## Current Plan

### Phase 1: Architecture & Design (planner)

- Define data models
- Design CLI interface
- Outline error handling strategy

### Phase 2: Core Implementation (implementer)

- Implement file readers
- Build processing pipeline
- Add logging

### Phase 3: Review & Polish (reviewer)

- Code review
- Performance optimization
- Documentation

## Notes

- Consider using existing parsing libraries from Bun
- Keep CLI interface simple and discoverable

## Decisions

(Populated as work progresses)
```

### Creating Tasks

Each task is a Markdown file in `tasks/` subdirectory:

**`nexus_state/projects/my-project/tasks/task-1.md`:**

```markdown
# Task: Design Data Models

## Objective

Define the core data structures for the CLI tool, including input validation and error types.

## Assigned Roles

- planner (primary)
- reviewer (secondary review)

## Description

We need to design data models that support:

- Multiple input formats (CSV, JSON, YAML)
- Validation with clear error messages
- Extensibility for future formats

The models should be simple but composable.

## Context

From project plan: Phase 1, Architecture & Design

## Status

pending
```

### Running Tasks

In the Nexus TUI:

1. **View Tasks** – Press `2` to go to Tasks view
2. **Select Task** – Use arrow keys to select a task
3. **Run Task** – Press `r` to execute the task
4. **Monitor Execution** – Watch progress as each role processes
5. **View Results** – Go to Sessions view (`3`) to see outputs

**Behind the scenes during execution:**

1. Nexus preflight checks that assigned roles are connected (have active extensions with WebSocket)
2. Nexus loads project state and task context
3. For each assigned role (sequentially):
    - Builds a context-aware prompt (includes project goals, plan, previous decisions, task details)
    - Posts to `/responses/<role>/new` (creates new temporary chat)
    - ChatGPT responds in the browser
    - Response is captured and stored in `runs/` directory
4. Results are available for review

### Roles

Nexus uses specialized roles that map to ChatGPT sessions identified by Client ID:

| Role                | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| **planner**         | Designs architecture, outlines plans, identifies risks    |
| **implementer**     | Writes code, builds features, handles technical execution |
| **reviewer**        | Reviews work, suggests improvements, quality gates        |
| **researcher**      | Investigates topics, gathers information, does analysis   |
| **devils-advocate** | Challenges assumptions, finds edge cases, stress-tests    |

Each role becomes a separate ChatGPT conversation (with its own browser tab/extension instance) that Nexus coordinates.

### Report Convention

When a task runs, each role must produce a **structured report**. Nexus expects responses to follow this format:

```markdown
# Report — <RoleName>

STATUS: success | partial | blocked

SUMMARY: <1-2 sentence summary of what was done>

ARTIFACTS:

- Artifact 1 (e.g., file created, decision made)
- Artifact 2

RISKS:

- Risk 1 (potential issues or blockers)
- Risk 2

NEXT:

- Next step 1
- Next step 2
```

Example response from "planner" role:

```markdown
# Report — planner

STATUS: success

SUMMARY: Designed core data models supporting CSV, JSON, and YAML formats with comprehensive error handling. Identified three phases of implementation.

ARTIFACTS:

- Data model diagram (conceptual)
- Error type hierarchy
- CLI interface specification

RISKS:

- Bun's built-in JSON parser may not handle all edge cases
- YAML parsing library selection needed
- Performance for large files not yet analyzed

NEXT:

- Implementer to start with core file readers
- Verify YAML library compatibility
- Create test fixtures for all input formats
```

Nexus parses this report to extract status, summary, artifacts, and next steps for the decision log.

### TUI Navigation

The Nexus terminal UI has 5 main views:

**`1` – Dashboard**

- Overview of current project
- Recent runs
- Key project metrics

**`2` – Tasks**

- List of all tasks for the project
- Task status and assignments
- Press `r` to run selected task

**`3` – Sessions**

- All past execution runs
- Results from each role
- Execution timeline

**`4` – Decisions**

- Decision log for the project
- Records when/why decisions were made
- Links to supporting reports

**`5` – Logs**

- Application and execution logs
- Useful for debugging
- Traces of all HTTP requests to server

**Global Keys:**

| Key   | Action                            |
| ----- | --------------------------------- |
| `1-5` | Switch views                      |
| `r`   | Run selected task (in Tasks view) |
| `?`   | Toggle help/key bindings          |
| `q`   | Quit (saves UI state)             |
| `Esc` | Close help or reset selection     |

### How Nexus Connects to Your ChatGPT Sessions

For Nexus to work, you need **browser extension instances for each role you want to use**.

**Setup:**

1. **For each role, open a separate ChatGPT conversation:**
    - Tab 1: ChatGPT with extension (Client ID: `planner`)
    - Tab 2: ChatGPT with extension (Client ID: `implementer`)
    - Tab 3: ChatGPT with extension (Client ID: `reviewer`)
    - (etc.)

2. **Enable WebSocket mode on each tab:**
    - In the Navigator sidebar, enter the role name as Client ID
    - Toggle the WebSocket indicator to 🔌🟢

3. **Verify connection in Nexus:**
    - Press `5` to view Logs
    - You should see messages like: `Connected client: planner`

4. **Run a task:**
    - Go to Tasks view (`2`)
    - Select a task and press `r`
    - Nexus will post prompts to each role's ChatGPT session
    - Monitor progress in Logs

### Example Workflow: Building a Project

Here's a complete example of using Nexus to plan and implement a feature:

**Step 1: Create project**

```bash
mkdir -p nexus_state/projects/my-feature/tasks
cat > nexus_state/projects/my-feature/project.md << 'EOF'
# Project: Add Dark Mode Support

## Goals
- Implement dark mode toggle in UI
- Preserve user preference in localStorage
- Support system preference detection

## Plan
- Phase 1 (planner): Design component structure and state management
- Phase 2 (implementer): Write React components and CSS
- Phase 3 (reviewer): Test, optimize, document

## Notes
- Use CSS custom properties (--color-bg, --color-text, etc.)
EOF
```

**Step 2: Create first task**

```bash
cat > nexus_state/projects/my-feature/tasks/task-1.md << 'EOF'
# Task: Design Dark Mode Architecture

## Objective
Design the component structure, state management approach, and CSS organization for dark mode support.

## Assigned Roles
- planner
- devils-advocate

## Description
Before implementing, we need a solid design that:
- Minimizes re-renders
- Works with existing component structure
- Supports both user preference and system preference

Please propose an architecture and identify potential issues.

## Status
pending
EOF
```

**Step 3: Run Nexus**

```bash
cd nexus
bun dev
```

**Step 4: Execute task**

1. Press `2` (Tasks view)
2. Select "Design Dark Mode Architecture"
3. Press `r` to run
4. Watch as Nexus posts to `planner` ChatGPT session
5. `planner` responds with design proposal
6. Nexus then posts to `devils-advocate` session
7. `devils-advocate` reviews and challenges the design
8. Results are captured and stored

**Step 5: Review results**

- Press `3` (Sessions) to see responses from both roles
- Press `4` (Decisions) to see what Nexus decided
- Press `5` (Logs) to see execution details

**Step 6: Create next task**

Based on the design, create a task-2.md for the implementer:

```markdown
# Task: Implement Dark Mode Components

## Objective

Implement the React components and CSS for dark mode based on the architecture from task-1.

## Assigned Roles

- implementer

## Context

Planner designed the following architecture:
[paste relevant excerpts from task-1 results]

## Status

pending
```

Then run it with `r` to get implementation code from the implementer role.

### Integration with Browser Extension

Nexus uses the **Client ID feature** to coordinate multiple ChatGPT sessions:

- Each role maps to a Client ID (e.g., "planner", "implementer", "reviewer")
- The local server recognizes these Client IDs via WebSocket
- Nexus posts to `/responses/<clientId>/new` when it needs a new response from that role
- The browser extension injects the prompt and captures the response
- Nexus receives the response and records it

**No direct API calls** – Nexus always goes through ChatGPT's Web UI via the extension. This means:

✅ Full access to ChatGPT's latest features
✅ Works with Claude, GPT-4, GPT-4o, any model ChatGPT supports
✅ No API key needed (uses your existing ChatGPT account)
✅ All interactions visible in ChatGPT history

❌ Requires browser extensions to be running (manual setup)
❌ Can't run fully autonomously (by design – keeps user in control)

### When to Use Nexus

Nexus is ideal for:

- **Complex multi-phase projects** – Where different stages have different expertise
- **Requirement gathering** – Planner + researcher roles to explore ideas
- **Code review workflows** – Implementer + reviewer roles to ensure quality
- **Architecture design** – Planner + devil's advocate to test assumptions
- **Educational projects** – Using different roles to learn from multiple perspectives

Nexus is **not ideal for**:

- Simple, single-turn prompts (use the sidebar directly)
- Real-time chat conversations (use ChatGPT directly)
- Fully autonomous agents (Nexus keeps humans in control)

### Troubleshooting Nexus

**"Client 'planner' not connected" error**

- Ensure you have a ChatGPT tab open with Client ID set to "planner"
- Toggle WebSocket to 🔌🟢 on that tab
- Verify in Nexus Logs view that it shows "Connected client: planner"

**Task runs but response is incomplete**

- The role may have exceeded the 120-second timeout
- Try simpler prompts or split the task
- Check browser for any errors (F12 Console)

**Nexus TUI shows strange characters or doesn't render**

- Ensure your terminal supports Unicode
- Try a different terminal application
- Check your `TERM` environment variable (should be `xterm-256color` or similar)

**State is lost after restart**

- Nexus saves state in `nexus_state/` directory
- If you deleted that directory, state is gone
- Recreate projects/tasks or restore from backups
- Consider version-controlling `nexus_state/projects/` in Git

---

## Keyboard Shortcuts & Tips

### Shortcuts

| Shortcut       | Action                        |
| -------------- | ----------------------------- |
| `Ctrl+Shift+Y` | Toggle sidebar visible/hidden |

### Tips & Tricks

**1. Quick Navigation**

- Use the ↑/↓ buttons in the sidebar to quickly navigate between messages
- Click any role label to jump to that message in the main chat
- Use the [Code: N] buttons to jump directly to code blocks

**2. Filtering**

- Temporarily hide assistant messages to see only your prompts: uncheck "Assistant" filter
- This makes it easy to review your entire conversation flow

**3. Context Preservation**

- Use the "Copy thread" button (📋) to save your entire conversation as Markdown
- Paste into a document, Git commit, or shareable format

**4. Prompt Reuse**

- Store frequently used prompts as separate `.md` files
- The sidebar dropdown lets you switch between them instantly
- Add multiple `# {{USER}}` sections in one file for different variations

**5. File Inclusion Organization**

- Keep code snippets in well-organized directories (e.g., `src/`, `docs/`)
- Use short relative paths: `@./src/Button.tsx` instead of absolute paths
- Use `@@./utils` to include all utility functions at once

**6. Automation Workflows**

- Use the `/responses/:clientId` API with a client ID to enable end-to-end automation
- Combine with `@path` templates to keep prompts DRY (Don't Repeat Yourself)
- Script multiple prompts in sequence with your own orchestration layer

**7. New Temporary Chats**

- Click the 🆕 button to start a fresh conversation
- Or use the `/responses/:clientId/new` API endpoint
- Useful when you want to isolate context between different prompts

**8. Token Counting**

- The "Tokens: X" display gives a rough estimate
- Useful for understanding prompt size before sending
- Exact count depends on ChatGPT's tokenizer

---

## Troubleshooting

### Sidebar Not Appearing

**Problem:** The Navigator sidebar doesn't show up on ChatGPT pages.

**Solutions:**

1. **Check extension is installed:**
    - Open `chrome://extensions`
    - Verify Navigator is listed and enabled (toggle should be on)
    - If missing, reload it: `extension/` folder via **Load unpacked**

2. **Reload ChatGPT:**
    - Refresh the ChatGPT page (F5 or Cmd+R)
    - The sidebar should appear on the right

3. **Check extension permissions:**
    - Right-click Navigator icon → **Details**
    - Under "Site access," verify it allows access to `chatgpt.com`
    - If not, click "Allow on chatgpt.com"

4. **Check for extension conflicts:**
    - Disable other extensions temporarily
    - Reload ChatGPT
    - If the sidebar appears, one of those extensions was interfering

5. **Clear extension data:**
    - Right-click Navigator → **Manage extension**
    - Scroll down and click "Clear data"
    - Reload ChatGPT

6. **Check browser console for errors:**
    - Open DevTools (F12)
    - Look at the **Console** tab
    - Report any errors to the project GitHub

### Server Not Running or Not Reachable

**Problem:** The extension can't reach the local server.

**Solutions:**

1. **Verify server is running:**
    - Open `http://localhost:8765/` in your browser
    - Should see a JSON response with server info
    - If not, start the server: `cd server && bun run src/index.ts`

2. **Check server port:**
    - Verify `PORT=8765` in your `.env` file (or whatever port you configured)
    - Ensure no other process is using that port

3. **Check extension server URL:**
    - Right-click Navigator → **Options**
    - Verify the URL matches your server (default: `http://localhost:8765`)
    - If you changed the port in `.env`, update the extension options too

4. **Check firewall:**
    - Ensure your OS firewall allows connections to `localhost:8765`
    - On macOS/Linux, this is usually not an issue for localhost
    - On Windows, you may see a prompt to allow the connection

5. **Check browser console:**
    - Open DevTools (F12) on ChatGPT
    - Look for network errors or connection warnings
    - Share these in an issue if you're stuck

### WebSocket Not Connecting

**Problem:** The WebSocket toggle (🔌) stays red and won't connect.

**Solutions:**

1. **Enter a Client ID:**
    - The Client ID field cannot be empty
    - Enter any string (e.g., `test-1`, `my-browser`)
    - Click the toggle again

2. **Verify server is running:**
    - Open `http://localhost:8765/` in browser
    - Should work without errors

3. **Check WebSocket support:**
    - Modern browsers support WebSocket
    - If you're behind a corporate proxy, WebSocket might be blocked
    - Try a different network or contact your IT

4. **Browser console errors:**
    - Open DevTools (F12)
    - Look for WebSocket connection errors
    - Copy the error message and search the project GitHub issues

5. **Reconnection:**
    - The sidebar auto-reconnects with exponential backoff
    - If the connection drops, it will retry automatically
    - Check browser console to see retry attempts

### ChatGPT DOM Changes (Sidebar Breaks)

**Problem:** After a ChatGPT UI update, the sidebar stops working or messages aren't detected.

**Solutions:**

1. **Reload the extension:**
    - Open `chrome://extensions`
    - Click the refresh icon on Navigator
    - Reload ChatGPT page

2. **Clear cached selectors:**
    - Right-click Navigator → **Manage extension**
    - Scroll down and click "Clear data"
    - Reload ChatGPT

3. **Check for known issues:**
    - Visit the GitHub repository: https://github.com/anomalyco/opencode
    - Search for issues related to ChatGPT DOM changes
    - If your issue isn't listed, file a new issue with details

4. **Manual workarounds:**
    - The sidebar may still appear, but detection might lag
    - Use the refresh button (🔄) in the sidebar to manually update
    - Try the filters checkboxes to see if they help

### Prompts Not Showing in Dropdown

**Problem:** You've added `.md` files to `PROMPTS_DIR`, but they don't appear in the sidebar dropdown.

**Solutions:**

1. **Verify file location:**
    - Check that your `.md` files are in the `PROMPTS_DIR` you configured in `.env`
    - If you're not sure, check `.env`: look for `PROMPTS_DIR=./path`
    - Place your files there

2. **Restart server:**
    - Stop the server (Ctrl+C in terminal)
    - Start it again: `cd server && bun run src/index.ts`
    - The server reads prompts on startup

3. **Refresh sidebar:**
    - In the sidebar, click the 🔄 button next to the dropdown
    - Wait a moment for the list to update

4. **Check file extension:**
    - Only `.md` files are shown
    - Ensure your files end with `.md` (not `.txt`, `.markdown`, etc.)

5. **File permissions:**
    - Ensure the server process can read the files
    - Check OS file permissions (Linux/macOS: `ls -la prompts/`)

### File Inclusion Not Resolving (`@path` Not Expanded)

**Problem:** You used `@./src/app.js` in a prompt, but it didn't get replaced with the actual file content.

**Solutions:**

1. **Check file exists:**
    - Verify the file actually exists at the path
    - Test: `curl http://localhost:8765/prompt/my-file.md` to see processed content

2. **Check path is relative to FILES_ROOT:**
    - File inclusion is relative to `FILES_ROOT` in your `.env`
    - If `FILES_ROOT=./` and you use `@./src/app.js`, the server looks for `./src/app.js`
    - Adjust the path or your `.env` settings

3. **Use correct syntax:**
    - Single file: `@./src/app.js` (single @)
    - Directory tree: `@./src` (single @, no trailing slash)
    - Directory concat: `@@./src` (double @@)

4. **Restart server:**
    - Changes to `.env` require server restart
    - Stop (Ctrl+C) and start again: `bun run src/index.ts`

5. **Check server logs:**
    - Look for errors in the terminal where server is running
    - Copy any error messages and search GitHub issues

### Can't Inject Prompt into ChatGPT

**Problem:** Clicking a prompt in the sidebar doesn't insert it into the chat input box.

**Solutions:**

1. **Make sure chat input is visible:**
    - Scroll to the bottom of ChatGPT
    - Ensure the input box (text area) is visible
    - Try clicking in the input box first to focus it

2. **Refresh sidebar:**
    - Click the 🔄 button next to filters
    - Wait a moment

3. **Try manual copy/paste:**
    - Right-click the prompt button in sidebar → inspect
    - Or manually copy the prompt text and paste it

4. **Check browser permissions:**
    - Navigate to `chrome://extensions`
    - Click **Details** on Navigator
    - Under "Site access," ensure it allows `chatgpt.com`

5. **ChatGPT DOM may have changed:**
    - See [ChatGPT DOM Changes](#chatgpt-dom-changes-sidebar-breaks) section above

### Token Count Seems Wrong

**Problem:** The "Tokens: X" display doesn't match your expectations.

**Note:** Token counting is an estimate based on simple heuristics (character count, word count), not the exact OpenAI tokenizer.

**Accurate count:** ChatGPT shows the exact token count when you submit a message. Use that as the ground truth.

### Extension Consuming Too Much Memory

**Problem:** The extension seems to slow down your browser.

**Solutions:**

1. **Disable if not in use:**
    - Toggle off the extension when not using ChatGPT
    - Or unload it from `chrome://extensions`

2. **Clear extension data:**
    - Right-click Navigator → **Manage extension**
    - Scroll down and click "Clear data"
    - This clears the message cache

3. **Close extra tabs:**
    - The extension runs on every ChatGPT tab you have open
    - Close tabs you're not actively using

4. **Report if it persists:**
    - If memory usage is still excessive, file a GitHub issue with details

---

## Security Notes

### Path Traversal Protection

The server **strictly validates all file paths** to prevent path traversal attacks.

**What this means:**

- You **cannot** use `../` to escape the configured `FILES_ROOT` directory
- Path validation is mandatory for all `@path` operations
- All paths are resolved relative to `FILES_ROOT` only

**Examples:**

```markdown
✅ Safe (relative path within FILES_ROOT):
@./src/app.js

✅ Safe (directory tree):
@./docs

✅ Safe (double @ for concat):
@@./utils

❌ NOT safe (path traversal attempt):
@../../../etc/passwd

❌ NOT safe (absolute path escape):
@/etc/passwd
```

The server will reject any attempt to use `../` or absolute paths that escape `FILES_ROOT`.

### Localhost-Only Communication

By default, the extension and server communicate only over `localhost`:

- **WebSocket:** `ws://localhost:8765/ws` (hardcoded in extension)
- **HTTP API:** `http://localhost:8765` (default, configurable in extension options)

**Why this is secure:**

- No external network access
- Files stay on your machine
- ChatGPT credentials are never sent to your local server
- Only you have access to the server (running on your computer)

**If you expose the server to a network:**

- Anyone with access to your server URL can send prompts to ChatGPT (via your browser)
- Anyone can read files from your `FILES_ROOT` directory
- **DO NOT expose the server to the internet** unless you add authentication

### File System Isolation

The server can only access files within `FILES_ROOT` and prompts within `PROMPTS_DIR`:

- **`FILES_ROOT`** – Used for `@path` file inclusion
- **`PROMPTS_DIR`** – Used for prompt files listed in the sidebar

Both are configured in `.env` and cannot be overridden by API requests.

### Best Practices

1. **Use a dedicated directory for prompts:**

    ```bash
    PROMPTS_DIR=./my-prompts
    FILES_ROOT=./my-files
    ```

2. **Don't store secrets in prompts:**
    - API keys, passwords, tokens should not be in prompt files
    - These could be exposed if you share prompts or save ChatGPT responses

3. **Version control:**
    - Add `.env` to `.gitignore` (don't commit it with secrets)
    - Prompts themselves are safe to commit

4. **Server runtime:**
    - Run the server only when needed
    - Stop it when not using the extension (`Ctrl+C` in terminal)

---

## Getting Help

If you encounter issues or have questions:

1. **Check this guide** – Most common problems are covered in [Troubleshooting](#troubleshooting)
2. **GitHub Issues** – Visit https://github.com/anomalyco/opencode to search for your issue or file a new one
3. **Browser Console** – Open DevTools (F12) and check the **Console** tab for error messages
4. **Server Logs** – Check the terminal where the server is running for error messages

---

## Document Version

Last updated: February 2025

For the latest version, visit the [ChatGPT UX Navigator GitHub repository](https://github.com/anomalyco/opencode).
