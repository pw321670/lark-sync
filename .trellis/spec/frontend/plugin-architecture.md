# Plugin Architecture

> Purpose: define the current Obsidian plugin shape and keep UI code from absorbing sync logic.

---

## Current Repo Reality

- The plugin shell exists in `src/main.ts`, `src/settings/`, `src/oauth/*`, `src/sync/*`, and `src/ui/*`.
- User entrypoints include:
  - left-ribbon sync button,
  - command palette commands,
  - settings tab,
  - Notice-based feedback.
- The plugin runtime itself is now the only maintained execution path.

The architecture should stay centered on one live plugin flow, not on preserving removed standalone wrappers.

---

## Target Shape

### 1. Obsidian Plugin Shell

Owns only Obsidian-facing concerns:

- plugin entrypoint and lifecycle hooks
- command registration
- settings tab registration
- ribbon and notice wiring
- loading and saving plugin-local settings/state
- launching browser or external auth flow through the OAuth layer

This layer should stay thin.

### 2. OAuth Services

Owns:

- authorization URL building
- loopback callback server lifecycle
- code exchange
- token refresh
- auth storage writes

### 3. Sync Runtime

Owns:

- vault scan
- path normalization
- include/exclude matching
- change detection
- folder creation
- file or document upload
- sync result aggregation

### 4. Infrastructure Adapters

Wrap environment-specific details behind small, real boundaries:

- vault file enumeration and file reads
- Feishu HTTP client
- auth storage
- sync-state storage
- time and logging helpers when needed

---

## Lifecycle Rules

### `onload`

- Load plugin settings and persisted summary data.
- Create OAuth and sync service instances once.
- Register commands and settings UI.
- Register passive UI only if it reflects real runtime state.
- Do not start authorization or sync automatically on startup.

### Command Execution

- Validate required settings before side effects.
- Refuse concurrent sync runs.
- If authorization is missing, route the user toward the auth flow instead of attempting a broken sync.
- Emit structured UI feedback; do not rely on raw `console.log` output as the main UX.

### Temporary Auth Lifecycle

- Start the local callback listener only for the auth session.
- Close it after success, timeout, or cancellation.
- Never keep a localhost auth server alive for the lifetime of the plugin.

### `onunload`

- Tear down transient UI.
- Cancel in-flight sync if needed.
- Ensure no orphaned auth server remains.

---

## Keep Out Of The Plugin Shell

- direct Feishu upload logic
- path/filter logic duplicated from `src/sync/*`
- token refresh logic duplicated outside `src/oauth/*`
- document/block payload shaping
- ad hoc sync state mutation inside UI code

---

## Recommended File Ownership

```text
plugin entrypoint
  -> registers commands/settings/ribbon
  -> calls oauth and sync services

oauth services
  -> own auth URL, callback server, code exchange, refresh

sync runtime
  -> owns scan, change detection, folder mapping, upload, result shaping

ui helpers
  -> render notices, ribbon state, and commands from structured results
```

If a file needs both `obsidian` APIs and Feishu sync behavior, split it until each part has one clear owner.

---

## Forbidden Patterns

- rewriting sync behavior separately in each command handler
- mixing `obsidian` imports into low-level Feishu clients
- treating the settings tab as the source of business logic
- starting long-running sync from `onload`
- keeping a second execution path alive after the plugin path already owns the runtime

## Scenario: Current Plugin Shell Boundary

### 1. Scope / Trigger

- Trigger: the repository now has a real Obsidian plugin shell, so the spec must describe the implemented boundary instead of a hypothetical migration target.

### 2. Signatures

- `src/main.ts`
  - `updateConfig(patch)`
  - `clearAuthorization()`
  - `startSync()`
  - `cancelSync()`
  - `previewSyncScope()`
- `src/sync/sync-coordinator.ts`
  - `startSync(config)`
  - `cancelSync()`

### 3. Contracts

- `src/main.ts` owns:
  - plugin lifecycle,
  - settings persistence,
  - command registration,
  - ribbon button wiring,
  - token validation before sync start.
- `src/sync/*` owns:
  - vault scanning,
  - path normalization,
  - folder creation,
  - Feishu request-level retries,
  - sync result aggregation,
  - cooperative cancellation during folder and upload work.

### 4. Validation & Error Matrix

| Case | Expected behavior |
|------|-------------------|
| Missing required config | block before sync and show a settings-oriented notice |
| Missing `refreshToken` | block before sync and route user toward authorization |
| Invalid or expired access token | refresh through OAuth layer before constructing sync config |
| User cancels an in-flight sync | stop remaining work cleanly and return control without treating it as success |
| Sync runtime error | keep the plugin shell thin and surface the summarized error back to UI |

### 5. Good / Base / Bad Cases

- Good: `main.ts` validates, refreshes token, then passes a normalized config into `SyncCoordinator`.
- Base: `main.ts` stores last-sync summary and maps it into ribbon and Notice state without implementing sync logic itself.
- Bad: `main.ts` starts accumulating file traversal, remote upload, or folder reconciliation logic directly.

### 6. Tests Required

- Starting sync with valid config should call token refresh before `SyncCoordinator.startSync`.
- Changing auth-related settings should recreate the OAuth helper with fresh config.
- Cancelling from the ribbon command should flip the coordinator into a cancelled state and avoid a fake success notice.
- UI helpers should stay disposable; unload should not leave timers or persistent status UI behind.

### 7. Wrong vs Correct

#### Wrong

- let `main.ts` call Feishu upload APIs directly because the code path is "small enough"

#### Correct

- keep `main.ts` as the Obsidian shell and push sync-side work into `src/sync/*`
