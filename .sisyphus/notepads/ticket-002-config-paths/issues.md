# Issues - Ticket 002 Config + Path Resolution

## JSONC Stripping vs URLs
- **Problem**: Simple line comment stripping regex `//.*$` matches the double slashes in URLs like `http://`.
- **Status**: Resolved by using a string-aware regex replacement in `src/config/config.ts`.
