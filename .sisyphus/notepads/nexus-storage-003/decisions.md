
- **Date Formats**: Standardized `getIsoTimestamp()` to full ISO string and `getDateString()` to `YYYY-MM-DD` as per ticket requirements.
- **Import Strategy**: Used relative imports in tests (`../../src/storage/layout`) as the `nexus` package does not yet have path aliases configured.
- **Minimal Documentation**: Removed redundant docstrings for self-explanatory utilities (`getIsoTimestamp`, etc.) to align with a "code-first" readability style.

- Defined ProjectData and ProjectMeta interfaces in src/storage/project.ts to ensure typed storage operations.
- Decided to return raw strings for markdown files in loadProject for now, as formal parsing is out of scope for the storage layer MVP.
- Used Promise.all for parallel file writes and reads to improve performance.
