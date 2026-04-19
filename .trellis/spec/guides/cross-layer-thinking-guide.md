# Cross-Layer Thinking Guide

> Purpose: make boundary decisions explicit before changing auth, sync, or plugin-facing behavior.

---

## The Main Data Flow

In this project, most features eventually touch this chain:

```text
Plugin settings or config file
-> auth/token lifecycle
-> filesystem scan
-> normalized relative paths
-> folder mapping
-> Feishu Drive API calls
-> local sync state
-> user-facing status and errors
```

If a change touches two or more steps, treat it as cross-layer work.

---

## Boundary Map

| Boundary | Current Source | Typical Risk |
|----------|----------------|--------------|
| Settings -> persisted config | `config.example.json`, `config.json` | Missing field validation, secrets leaking into logs |
| OAuth callback -> token storage | `auth.js` | Refresh tokens overwritten incorrectly |
| Filesystem -> normalized path keys | `sync.js` | Mixed `\\` and `/`, exclude mismatches |
| Path key -> Feishu folder/file location | `sync.js` | Uploading to the wrong folder tree |
| Feishu API result -> local state | `sync.js` | State says upload succeeded when remote operation failed |
| Sync engine -> future Obsidian UX | future plugin layer | UI reports success without surfacing partial failure |

---

## Before Implementing

### 1. Write down the contract

For every boundary you touch, define:
- input shape
- output shape
- where validation happens
- what happens on partial failure

### 2. Check the current anchor points

Read the functions that already own the behavior:
- `auth.js`: `getUserAccessToken()`, local callback server, config persistence
- `sync.js`: `normalizeRelPath()`, `shouldExclude()`, `walkDir()`, `refreshUserAccessToken()`, `ensureFolder()`, `uploadSmallFile()`, `deleteFileByToken()`, `main()`

Do not add a second source of truth unless you are extracting the first one.

### 3. Decide which layer owns what

Use this split:
- plugin layer owns commands, settings UI, notices, and user actions
- shared sync core owns filesystem traversal, token refresh, mapping, and Feishu requests
- persistence layer owns config/state serialization and field compatibility

---

## Common Failure Modes

### Failure 1: Config shape changes in one place only

Symptoms:
- plugin settings save a new key
- script fallback still expects the old key
- runtime fails only after authorization or sync starts

### Failure 2: Path normalization is not applied symmetrically

Symptoms:
- exclude rules fail on Windows paths
- state keys stop matching the same file after refactor

### Failure 3: UI success hides sync failure

Symptoms:
- command palette action finishes
- user sees "done"
- one or more uploads silently failed or were skipped

### Failure 4: Refactor moves logic but leaves side effects behind

Symptoms:
- a new shared helper exists
- old code path still writes config or state separately
- behavior diverges between standalone and plugin modes

---

## Checklist

Before commit:
- [ ] I mapped every boundary touched by the change
- [ ] I identified the single owner for each piece of logic
- [ ] I verified config/state compatibility
- [ ] I traced partial failure behavior back to the user-facing layer

After implementation:
- [ ] I tested at least one happy path
- [ ] I tested one auth failure or invalid config path
- [ ] I tested one sync edge case involving excludes, folder mapping, or retries
