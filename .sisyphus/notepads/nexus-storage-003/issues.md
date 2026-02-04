# Issues & Blockers

## Resolved
- **Date Format**: Standardized on `toISOString()` for machine-readable dates and `YYYY-MM-DD` for human-readable dates.
- **Project Structure**: Decided `loadProject` returns raw markdown content for now, deferring parsing logic to future tickets.
- **Task Status Updates**: Implemented regex-based status updates to preserve existing content, avoiding complex AST parsing for now.
