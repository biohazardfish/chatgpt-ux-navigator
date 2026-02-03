# Lessons Learned

## Bootstrap Phase
- Initial repository setup and clean slate.

## Ticket 002 (Config + Paths)

### Decisions
- **Config Discovery**: Configuration is loaded from `nexus.json` in the current working directory (CWD), then overridden by environment variables. This prioritizes local configuration while allowing deployment flexibility.
- **Auto-Derived Paths**: `projectsDir`, `runsDir`, and `logsDir` are strictly derived from `stateDir`. This simplifies configuration by requiring only one root path to be set.
- **Eager Directory Creation**: Required directories are created immediately during the `loadConfig` phase. This ensures the application fails fast if it lacks write permissions.
- **Fail-Fast Error Handling**: Directory creation and path resolution throw explicit errors immediately rather than failing silently or later during runtime.
- **JSONC Support**: Configuration files support comments (JSONC) to allow for documentation within the config file itself.
- **Path Security**: Implemented strict path containment checks (`isPathInsideRoot`) mirroring the server's security model to prevent directory traversal attacks.

### Problems & Solutions

#### JSONC vs. URLs
**Problem**: The initial regex for stripping line comments (`//.*$`) incorrectly matched the double slashes in URLs (e.g., `"url": "http://localhost"`), breaking valid JSON configuration.
**Solution**: We implemented a more robust, tokenizer-style regex that matches strings first (consuming them) before matching comments.
**Regex Used**:
```regex
/("(?:\\.|[^\\"])*"|'(?:\\.|[^\\'])*'|`(?:\\.|[^\\`])*`)|\/\*[\s\S]*?\*\/|\/\/.*$/gm
```

#### Bun Test Isolation
**Problem**: Tests needing filesystem access required isolation to avoid side effects.
**Solution**: Adopted a pattern using `beforeEach` and `afterEach` to create and destroy unique temporary directories for each test suite.
**Gotcha**: On macOS, `/var` is a symlink to `/private/var`. We used `realpathSync` in tests to normalize paths and prevent assertion failures when comparing expected vs. actual paths.

### Patterns
- **Path Security**:
  ```typescript
  const rel = relative(resolvedRoot, resolvedPath);
  return !rel.startsWith('..') && !isAbsolute(rel);
  ```
- **Test Setup**:
  ```typescript
  const TEST_ROOT = join(import.meta.dir, 'temp_test_env');
  beforeEach(() => mkdir(TEST_ROOT));
  afterEach(() => rm(TEST_ROOT, { recursive: true }));
  ```
