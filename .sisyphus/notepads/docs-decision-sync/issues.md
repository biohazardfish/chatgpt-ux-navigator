# Issues (docs-decision-sync)

> Append-only. Track blockers, mismatches, or unexpected contradictions discovered during scans.
Contradiction scan run: $(date -u)

Commands executed:
- rg -n --hidden --no-ignore -g 'nexus/docs/**' -e 'SSE' -e 'server-sent' -e 'streaming UI' -e 'streaming' -e 'stream'
- rg -n --hidden --no-ignore -g 'nexus/docs/**' -e 'parallel' -e 'parallelism' -e 'simultaneou' -e 'concurrent'
- rg -n --hidden --no-ignore -g 'nexus/docs/**' -e 'OpenAI' -e 'gpt' -e 'model API' -e 'model api' -e 'model:' -e 'completion' -e 'chat.completions'
- rg -n --hidden --no-ignore -g 'nexus/docs/**' -e 'endpoint' -e '/prompt' -e '/responses' -e '/ws' -e 'http' -e 'websocket'
- rg -n --hidden --no-ignore -g 'nexus/docs/**' -e 'clientId' -e 'client id' -e 'role' -e 'routing'
- rg -n --hidden --no-ignore -g 'nexus/docs/**' -e 'precedence' -e 'override' -e 'config' -e 'defaults' -e 'priority'

Searched path: nexus/docs/** (confirmed)

Summary of contradiction findings (file:line snippet) — classification + suggested minimal wording

1) README claims a streaming UI / WebSocket streaming in extension while TUI/docs state no real-time streaming UI yet.
- /Users/quangtranly/Documents/chatgpt-ux-navigator/README.md:118: - WebSocket Streaming: Toggle between standard and real-time streaming modes (🔌🟢/🔌❌) for instant response saving.
- /Users/quangtranly/Documents/chatgpt-ux-navigator/nexus/docs/tickets/006-response-streaming-and-capture.md:114: - No real-time TUI streaming display yet (later ticket).
Classification: NEEDS CHANGE
Suggested replacement (minimal): "WebSocket streaming support exists on the server; real-time TUI streaming display is planned but not implemented in the TUI MVP."

2) Tech stack (000-tech-tack.md) states all model interaction is mediated by Vercel AI SDK — but architecture and extension rely on browser ChatGPT sessions (not mediated), creating an overbroad claim.
- /Users/quangtranly/Documents/chatgpt-ux-navigator/nexus/docs/000-tech-tack.md:40: Nexus **does not** talk to models directly.
- /Users/quangtranly/Documents/chatgpt-ux-navigator/nexus/docs/003-architecture.md:31: Browser Extension → ChatGPT Sessions
Classification: NEEDS CHANGE
Suggested replacement: "Server components use the Vercel AI SDK for provider-mediated model calls. Browser extension-driven ChatGPT sessions use the web UI and are not mediated by the server-side SDK; treat those as a separate execution path."

3) ENV example mentions SSE explicitly (NO_STREAM) while other docs reference WebSocket/readable streams — ambiguous use of "SSE" vs "WebSocket".
- /Users/quangtranly/Documents/chatgpt-ux-navigator/README.md:123: # If true, disable SSE streaming and return single JSON responses
- /Users/quangtranly/Documents/chatgpt-ux-navigator/nexus/docs/006-response-streaming-and-capture.md:61: - The local server: - Returns **plain text** - May stream output (chunked)
- /Users/quangtranly/Documents/chatgpt-ux-navigator/AGENTS.md: (WebSocket endpoint) - `GET /ws`: WebSocket endpoint for real-time extension communication.
Classification: NEEDS CHANGE
Suggested replacement: "Clarify transport options: the server supports WebSocket-based streaming and chunked ReadableStream responses. If SSE (Server-Sent Events) is supported, name it explicitly and document behavior; otherwise replace 'SSE' with 'streaming' or 'WebSocket' to avoid implying SSE-specific behavior."

4) Parallelism statements in high-level docs imply parallel runs are core behavior while the sequential session runner is the current implementation (parallel runner is a later ticket).
- /Users/quangtranly/Documents/chatgpt-ux-navigator/nexus/docs/001-overview.md:3: Nexus is a local orchestration system designed to help users **drive large, complex tasks to completion** using multiple ChatGPT sessions in parallel.
- /Users/quangtranly/Documents/chatgpt-ux-navigator/nexus/docs/tickets/013-session-runner-basic.md:36: ### Included - Sequential execution of roles for a task
- /Users/quangtranly/Documents/chatgpt-ux-navigator/nexus/docs/tickets/018-parallel-session-execution.md:15: This ticket adds **concurrency orchestration** on top of the sequential session runner from ticket 013.
Classification: NEEDS CHANGE
Suggested replacement: "Nexus is designed to enable controlled parallel execution; the initial session runner is sequential (ticket 013). Parallel execution will be added via a dedicated parallel runner (ticket 018) with explicit concurrency controls."

Additional notes / FUTURE_WORK labels
- Several tickets correctly label streaming UI as 'later ticket'—mark these as OK where they already state the limitation (e.g., tickets 005,006). Classification: OK for those explicit notes.

Verification — exact commands run (ripgrep):
The following command was executed (single combined run):
rg -n --hidden --no-ignore -g 'nexus/docs/**' -e 'SSE' -e 'server-sent' -e 'streaming UI' -e 'streaming' -e 'stream' || true && rg -n --hidden --no-ignore -g 'nexus/docs/**' -e 'parallel' -e 'parallelism' -e 'simultaneou' -e 'concurrent' || true && rg -n --hidden --no-ignore -g 'nexus/docs/**' -e 'OpenAI' -e 'gpt' -e 'model API' -e 'model api' -e 'model:' -e 'completion' -e 'chat.completions' || true && rg -n --hidden --no-ignore -g 'nexus/docs/**' -e 'endpoint' -e '/prompt' -e '/responses' -e '/ws' -e 'http' -e 'websocket' || true && rg -n --hidden --no-ignore -g 'nexus/docs/**' -e 'clientId' -e 'client id' -e 'role' -e 'routing' || true && rg -n --hidden --no-ignore -g 'nexus/docs/**' -e 'precedence' -e 'override' -e 'config' -e 'defaults' -e 'priority' || true

All searches targeted nexus/docs/** and the top-level README (some streaming claims live in repo README). Confirmed: nexus/docs/** was exhaustively searched with the patterns above.

