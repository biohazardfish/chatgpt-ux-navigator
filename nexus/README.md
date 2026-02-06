# Nexus

The Nexus module for ChatGPT UX Navigator.

## Canonical docs

MVP behavior is locked in `nexus/docs/006-session-orchestration.md#mvp-decisions-resolved` (plus its glossary). Every secondary doc—including this README—must defer to that canonical record for terminology, routing rules, and scope boundaries.

## MVP scope (sequential + buffered)

- **Sequential runner only:** Ticket 013 delivers a single “run one task” flow. Parallel execution/control panels live in ticket 018 and remain Future work.
- **ChatGPT UI dependence:** Nexus never speaks to model/provider APIs. Automation happens via the browser extension driving the ChatGPT web UI.
- **Buffered capture:** The local server writes buffered JSON responses. There is **no streaming UI inside Nexus or its TUI**. Streaming toggles in marketing material refer to the browser extension’s ChatGPT view.
- **Temporary chats by default:** `/responses/:clientId/new` always starts a fresh ChatGPT chat unless you explicitly reuse the same `clientId` (see doc 006 routing section).
- **Single control surface:** No parallel dashboards, no multi-task queue, no multi-run batch triggers in MVP.

Any richer functionality must be labeled **Future work** and cite the canonical doc.

## Usage

```bash
# Install dependencies
bun install

# Run dev server
bun dev

# Run tests
bun test
```

## Report parser module

Ticket 007 introduced a dedicated `src/core/report/` module that documents the
report convention inline. Import `parseReport` (plus `ReportParseError` and
`ParseReportParams`) from `src/core/report/index.ts`, and treat
`src/core/report/convention.ts` as the canonical source of constants shared with
ChatGPT-facing instructions.

## Future work pointers

- Streaming UI/log viewer inside Nexus → see `nexus/docs/tickets/006-response-streaming-and-capture.md`
- Parallel session execution → see `nexus/docs/tickets/018-parallel-session-execution.md`
- Expanded TUI controls → see `nexus/docs/tickets/008-tui-shell-and-navigation.md`
