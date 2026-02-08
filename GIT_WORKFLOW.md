# Git Workflow

## 1. Branching Strategy

We follow a **lightweight Git Flow** model.

### Main Branches

| Branch    | Purpose                                   |
| --------- | ----------------------------------------- |
| `main`    | Production-ready code only                |
| `develop` | Integration branch for completed features |

### Supporting Branches

| Branch Prefix | Purpose                 | Example                |
| ------------- | ----------------------- | ---------------------- |
| `feature/`    | New features            | `feature/user-auth`    |
| `bugfix/`     | Bug fixes               | `bugfix/login-error`   |
| `hotfix/`     | Urgent production fixes | `hotfix/payment-crash` |
| `release/`    | Release preparation     | `release/v1.2.0`       |

---

## 2. Branch Naming Rules

```
<type>/<optional-ticket-number>-<short-description>
```

### Rules:

- Use **lowercase**
- Use **kebab-case**
- Keep names **short and descriptive**
- For workspace-specific changes, optionally include the workspace name

Examples:

```
feature/012-add-dark-mode
feature/server-add-jwt-auth
bugfix/extension-sidebar-z-index
bugfix/fix-token-expiry
hotfix/crash-on-startup
release/v2.0.1
```

---

## 3. Workflow Overview

```
main <- hotfix/*
  ^
release/*
  ^
develop <- feature/* & bugfix/*
```

### Development Flow

1. Create branch from `develop`
2. Work on feature / fix
3. Open Pull Request -> `develop`
4. Code review + tests
5. Merge into `develop`

---

## 4. Feature Development Process

```bash
git checkout develop
git pull
git checkout -b feature/my-feature
```

After finishing:

```bash
# Run tests across all workspaces before pushing
bun test

git push origin feature/my-feature
```

-> Open a Pull Request into `develop`

---

## 5. Bug Fix Process

```bash
git checkout develop
git pull
git checkout -b bugfix/my-bug
```

After fixing:

```bash
# Run tests across all workspaces before pushing
bun test

git push origin bugfix/my-bug
```

-> Open a Pull Request into `develop`

---

## 6. Hotfix Process (Production Emergency)

```bash
git checkout main
git pull
git checkout -b hotfix/critical-fix
```

After fixing:

```bash
git push origin hotfix/critical-fix
```

-> Open Pull Requests into:

- `main`
- `develop`

---

## 7. Release Process

```bash
git checkout develop
git checkout -b release/v1.2.0
```

### Tasks:

- Version bump
- Final testing (`bun test` from monorepo root)
- Documentation updates

After approval:

```bash
git merge release/v1.2.0 -> main
git merge release/v1.2.0 -> develop
```

---

## 8. Commit Message Convention

We follow **Conventional Commits**:

```
<type>(<scope>): <short summary>
```

The `(<scope>)` is optional but recommended when the change is specific to a single workspace.

### Types:

| Type       | Usage                     |
| ---------- | ------------------------- |
| `feat`     | New feature               |
| `fix`      | Bug fix                   |
| `docs`     | Documentation             |
| `style`    | Formatting                |
| `refactor` | Code restructuring        |
| `test`     | Adding/updating tests     |
| `chore`    | Tooling, configs, cleanup |

### Scopes (optional):

| Scope       | When to use                          |
| ----------- | ------------------------------------ |
| `server`    | Changes in `server/` workspace       |
| `extension` | Changes in `extension/` workspace    |
| `monorepo`  | Root config, workspace setup changes |
| _(omit)_    | Cross-cutting or general changes     |

### Examples:

```
feat(server): add JWT authentication
fix(extension): prevent sidebar z-index overlap
docs: update monorepo setup instructions
refactor(server): simplify thread parsing logic
chore(monorepo): add typecheck script to root package.json
test(server): add prompt parser edge case tests
```

---

## 9. Pull Request Rules

### PR Title Format

```
<type>(<scope>): <summary>
```

Example:

```
feat(server): implement role-based access control
```

### PR Requirements

- Clear description
- Linked issue (if exists)
- All CI checks passing
- `bun test` passing from monorepo root
- At least **1 reviewer approval**

---

## 10. Merge Strategy

- Use **Squash & Merge** for:
    - `feature/*`
    - `bugfix/*`

- Use **Merge Commit** for:
    - `release/*`
    - `hotfix/*`

---

## 11. Versioning Strategy

We follow **Semantic Versioning (SemVer)**:

```
MAJOR.MINOR.PATCH
```

Examples:

- `1.0.0` -- Initial release
- `1.1.0` -- New features
- `1.1.1` -- Bug fixes

---

## 12. Tagging Releases

```bash
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

---

## 13. Pre-Commit Checklist

Before pushing any changes, verify from the **monorepo root**:

```bash
bun test          # Run tests across all workspaces
bun lint          # Lint all workspaces
bun format        # Format all workspaces
bun typecheck     # Type-check all workspaces
```
