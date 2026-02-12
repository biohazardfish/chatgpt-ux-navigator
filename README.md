# ChatGPT UX Navigator

![Demo](./chatgpt-ux-navigator.png)

A power-user browser extension for ChatGPT that improves navigation and workflow for long conversations. It pairs with a local server to manage prompts and save responses directly to your filesystem.

## Overview

This is a **Bun-managed monorepo** consisting of:

| Workspace     | Package Name    | Description                                                    |
| ------------- | --------------- | -------------------------------------------------------------- |
| `server/`     | `@repo/server`  | Lightweight HTTP + WebSocket server for prompt management      |
| `extension/`  | `extension`     | Chrome extension that enhances the ChatGPT interface           |
| `orchestrator/`| `orchestrator` | CLI tool for running multi-agent AI conversations (Nexus)      |

## Features

### Browser Extension

- **Sticky Navigation Sidebar**: Quickly jump between User and Assistant messages.
- **Message Previews**: See the first 3 lines of each message in the sidebar to easily locate context.
- **Code Block Navigation**: Assistant messages with code blocks get direct "jump buttons" in the sidebar (e.g., `Code: 1 2 3`) to scroll immediately to that specific snippet.
- **Prompt Injection**: Select a local prompt file from the sidebar and insert its content into ChatGPT with one click.
- **Save Responses**: Save the last Assistant response directly back to the local prompt file (appending it to the thread).
- **Copy Thread**: One-click copy of the entire visible conversation as structured Markdown (`# {{USER}}` / `# {{ASSISTANT}}`).
- **Filters**: Toggle visibility of User or Assistant messages in the sidebar.
- **WebSocket Streaming**: Toggle between standard and real-time streaming modes for instant response saving.
- **Temporary Chat**: Start a new, temporary chat session with one click.
- **Token Estimation**: Real-time token count estimation for your messages.

### Local Prompt Server

- **Markdown-based Prompts**: Write prompts in your favorite local editor.
- **File Inclusion**: Dynamically include local files or directories in your prompt using `@path` syntax.
    - **Single file**: `@./src/index.ts` injects the full contents of that file.
    - **Directory tree**: `@./src` injects a formatted directory tree (recursive, no file contents).
    - **Directory content concat**: `@@./src` injects the contents of **all files in that directory (first level only)**, concatenated.
    - Paths are resolved relative to the configured files root and cannot escape it.
- **Thread History**: Supports "chat mode" in Markdown files using `# {{USER}}` and `# {{ASSISTANT}}` headers to preserve context.
- **WebSocket API**: Supports low-latency, real-time response streaming from ChatGPT directly to your local files.
- **Privacy-First**: Your files stay on your machine. The extension only talks to `localhost`.

### Orchestrator (Nexus)

- **Multi-Agent Conversations**: Run automated conversations between multiple AI agents with distinct personas.
- **Round-Robin Workflow**: Agents take turns speaking in a fixed order defined in YAML config.
- **Judge System**: Optional judge agent that evaluates the conversation and decides when to stop.
- **Inbox-Based Delivery**: Each agent only receives messages from the previous speaker (not the full transcript).
- **Full Artifacts**: Every run produces timestamped markdown files, JSON metadata, and a complete transcript.
- **CLI Tool**: Simple command-line interface for running multi-agent workflows locally.

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- A Chromium-based browser (Chrome, Edge, Brave, etc.)

## Installation

### 1. Clone and Install

```bash
git clone <repo-url>
cd chatgpt-ux-navigator
bun install
```

This installs dependencies across all workspaces.

### 2. Configure the Server

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` to customize settings:

```bash
# Server Configuration
PORT=8765

# Directory where prompt markdown files are stored
PROMPTS_DIR=./prompts

# Root directory for file inclusion (@path syntax)
FILES_ROOT=./server

# Directory where generated images are saved
IMAGES_DIR=./images

# If true, disable SSE streaming and return single JSON responses
NO_STREAM=false

# If true, emit raw upstream events for debugging
DEBUG_EVENTS=false
```

### 3. Start the Server

From the **monorepo root**:

```bash
bun dev
```

This starts the server in watch mode with automatic restarts on file changes.

Alternatively, run directly from the server workspace:

```bash
cd server
bun run dev
```

### 4. Install the Extension

1.  Open your browser (Chrome, Edge, Brave, or other Chromium-based browsers).
2.  Navigate to `chrome://extensions`.
3.  Enable **Developer mode** (top right).
4.  Click **Load unpacked**.
5.  Select the `extension/` folder from this repository.

## Usage

### Managing Prompts

Create a `.md` file in the directory your server is watching (configured via `PROMPTS_DIR`).

**Example `my-task.md`:**

```markdown
# {{USER}}

Refactor the following code to be more functional:

@./src/legacy-code.js

# {{ASSISTANT}}

(This section will be auto-filled if you click "Save Response" in the extension)
```

### In ChatGPT

1.  Open ChatGPT.
2.  The **Navigator** sidebar will appear on the right.
3.  Use the dropdown at the top to select `my-task.md`.
4.  Click the prompt text in the sidebar to insert it into the chat input.
5.  After ChatGPT replies, click the **Save** icon in the sidebar to append the response to `my-task.md`.

### Response and Image APIs

- `POST /responses/:client_id` sends a prompt to a connected ChatGPT tab.
- `POST /responses/:client_id/new` starts a new chat before sending the prompt.
- `POST /responses/:client_id/new?temporary=false` starts a new chat without temporary mode.
- `POST /images/:client_id` sends an image-generation prompt, saves the final generated image to `IMAGES_DIR`, and returns the saved `image_path` in the response payload.

Note: for image generation, manually enable **Create image** in the ChatGPT composer before sending `/images/:client_id`.

### Running Multi-Agent Conversations

See the [orchestrator README](orchestrator/README.md) for complete documentation on Nexus.

**Quick Start:**

1. Ensure the server is running (`bun dev`)
2. Open multiple ChatGPT tabs (one per agent + one for judge)
3. Note the client IDs from the server console
4. Create a config file:

```yaml
version: 1
server:
  url: http://localhost:8765
agents:
  alice:
    client_id: client-abc123  # Your actual client ID
    system: "You are Alice, a creative thinker."
  bob:
    client_id: client-def456  # Your actual client ID
    system: "You are Bob, a practical analyst."
workflow:
  type: round_robin
  order: [alice, bob]
seed:
  content: "Let's brainstorm app ideas. Alice, start us off!"
judge:
  enabled: false
termination:
  max_turns: 6
```

5. Run the orchestrator:

```bash
cd orchestrator
bun start my-config.yml
```

Output will be saved to `orchestrator/runs/` as timestamped folders with full transcripts, individual message files, and metadata.

## Development

### Project Structure

```
chatgpt-ux-navigator/
├── package.json          # Root monorepo config (workspaces)
├── bunfig.toml           # Bun workspace config
├── .env.example          # Environment variable template
├── server/               # @repo/server -- TypeScript + Bun
│   ├── src/              # Server source code
│   └── test/             # Server tests
├── extension/            # Chrome extension -- Vanilla JS
│   ├── content/          # Content scripts
│   ├── options/          # Options page
│   └── manifest.json     # Extension manifest (V3)
├── orchestrator/         # Nexus CLI -- TypeScript + Bun
│   ├── src/              # Orchestrator source code
│   ├── examples/         # Example config files
│   └── runs/             # Output artifacts (gitignored)
└── prompts/              # Local prompt files (gitignored)
```

### Root Scripts

| Script           | Description                          |
| ---------------- | ------------------------------------ |
| `bun dev`        | Start server in watch mode           |
| `bun test`       | Run tests across all workspaces      |
| `bun lint`       | Lint all workspaces                  |
| `bun format`     | Format all workspaces                |
| `bun typecheck`  | Type-check all workspaces            |

### Running Workspace-Specific Commands

```bash
# Run a script in a specific workspace
bun --filter @repo/server <script>
bun --filter extension <script>

# Run a script across all workspaces
bun --filter '*' <script>
```

### Testing

```bash
# Run all tests from the monorepo root
bun test

# Run server tests only
bun --filter @repo/server test
```

### Extension Development

The extension uses vanilla JS with no build step. After making changes:

1. Go to `chrome://extensions`
2. Click the reload button on the extension
3. Refresh the ChatGPT tab

## License

[MIT](https://opensource.org/licenses/MIT)

Copyright (c) 2025-present, Quang Tran.
