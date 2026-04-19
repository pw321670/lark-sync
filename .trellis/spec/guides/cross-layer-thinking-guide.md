# Cross-Layer Thinking Guide

> Purpose: make boundary decisions explicit before changing auth, sync, or plugin-facing behavior.

---

## The Main Data Flow

In this project, most features eventually touch this chain:

```text
Plugin settings / plugin data
-> auth/token lifecycle
-> vault scan
-> normalized relative paths
-> folder mapping
-> Feishu Drive / Doc API calls
-> local sync state
-> user-facing status and errors
```

If a change touches two or more steps, treat it as cross-layer work.

---

## Boundary Map

| Boundary | Current Source | Typical Risk |
|----------|----------------|--------------|
| Settings -> persisted config | `config/config.example.json`, plugin data, `src/utils/contracts.ts` | Missing field validation, secrets leaking into logs |
| OAuth callback -> token storage | `src/oauth/*` | Refresh tokens overwritten incorrectly |
| Filesystem -> normalized path keys | `src/main.ts`, `src/sync/*` | Mixed `\\` and `/`, filter mismatches |
| Path key -> Feishu folder/file location | `src/sync/*` | Uploading to the wrong folder tree |
| Feishu API result -> local state | `src/sync/*` | State says upload succeeded when remote operation failed |
| Sync runtime -> Obsidian UX | `src/main.ts`, `src/ui/*` | UI reports success without surfacing partial failure |

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

- `src/main.ts`: plugin gating, summary persistence, command routing
- `src/oauth/*`: current OAuth implementation
- `src/sync/*`: current sync implementation
- `src/utils/contracts.ts`: config/auth data shape

Do not add a second source of truth unless you are extracting the first one.

### 3. Decide which layer owns what

Use this split:

- plugin layer owns commands, settings UI, notices, and user actions
- auth/sync layers own token refresh, traversal, mapping, and Feishu requests
- persistence layer owns config/auth/state serialization and compatibility

---

## Common Failure Modes

### Failure 1: Config shape changes in one place only

Symptoms:

- settings save a new key
- runtime still expects the old semantic field
- failure appears only when auth or sync starts

### Failure 2: Path normalization is not applied symmetrically

Symptoms:

- filters fail on Windows paths
- state keys stop matching the same file after refactor

### Failure 3: UI success hides sync failure

Symptoms:

- command or ribbon action finishes
- user sees "done"
- one or more uploads silently failed or were skipped

### Failure 4: Refactor moves logic but leaves side effects behind

Symptoms:

- a new shared helper exists
- old code path still writes auth or state separately
- behavior diverges between entrypoints

---

## Checklist

Before commit:

- [ ] I mapped every boundary touched by the change
- [ ] I identified the single owner for each piece of logic
- [ ] I verified config/auth/state compatibility
- [ ] I traced partial failure behavior back to the user-facing layer

After implementation:

- [ ] I tested at least one happy path
- [ ] I tested one auth failure or invalid config path
- [ ] I tested one sync edge case involving filters, folder mapping, or retries
