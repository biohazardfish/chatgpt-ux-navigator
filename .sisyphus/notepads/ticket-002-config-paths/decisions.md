# Decisions - Ticket 002 Config + Path Resolution

## Robust JSONC Stripping
- **Context**: The initial suggested regex for line comments (`//.*$`) incorrectly matched `//` within URL strings (e.g., `"serverBaseUrl": "http://localhost:8765"`).
- **Decision**: Implemented a more robust `stripJSONC` function that uses a regex to match and ignore strings (double-quoted, single-quoted, and backticks) while replacing only actual comments.
- **Rationale**: Configuration files for a server are highly likely to contain URLs. Breaking on standard JSON-compatible URLs would lead to significant UX issues and "hard to debug" syntax errors.
