# Commands and Status UX

> Purpose: define how the future plugin should expose auth and sync actions through Obsidian commands, notices, and long-running status feedback.

---

## Current Repo Reality

Today the operator flow is CLI-like:

1. Fill `config.json`
2. Run `node auth.js`
3. Run `node sync.js`

The scripts reveal the actual runtime phases:

- Authorization builds a browser URL, opens it, waits for a localhost callback, and stores tokens.
- Sync refreshes the access token first.
- Sync scans the vault and applies exclude rules.
- Sync ensures the Feishu folder tree exists.
- Sync uploads changed files, skips unchanged files, and skips oversize files.
- Sync writes a final summary through logs.

The plugin must turn those phases into usable Obsidian interactions without changing the underlying contract by accident.

---

## Required Commands

These are forward-looking plugin commands that should exist once the plugin is implemented:

- `Connect Feishu account`
  - Starts the OAuth flow and stores managed tokens on success.
- `Sync vault to Feishu`
  - Runs the end-to-end sync flow for the active vault.
- `Reconnect Feishu account`
  - Clears or refreshes invalid auth state, then starts the auth flow again.
- `Show last sync summary`
  - Displays the latest success/failure summary without starting a new sync.

Optional later commands are fine, but these baseline actions should exist before adding automation or background sync.

---

## Command Execution Rules

- Commands must validate required settings before side effects.
- `Sync vault to Feishu` must refuse to start if another sync is already running.
- If `refreshToken` is missing or invalid, the sync command should route the user toward reauthorization.
- Do not start sync automatically on plugin load.
- Only expose controls that really exist in the runtime. The current plugin supports cancel, not pause/resume.

---

## Status Surfaces

Use more than one surface for long-running work:

### Notices

Use for concise moments:

- auth started
- auth succeeded
- sync started
- sync completed
- sync failed

Keep notices short and actionable.

### Persistent Runtime Status

Use a longer-lived surface for in-progress work:

- ribbon icon state
- modal with live progress
- dedicated log panel

The implementation choice can vary, but long sync must have a surface that outlives a transient notice. The current plugin shell intentionally uses ribbon state plus a persisted result summary instead of a status-bar line.

### Last Result Summary

Persist and display a structured summary after each run:

- started time
- finished time
- directories discovered
- files discovered
- uploaded count
- skipped unchanged count
- skipped oversized count
- failure state and the last failing path, if any

Do not rely on users reading developer console logs to understand what happened.
The current plugin persists the summary in plugin data and surfaces it through a command instead of a dedicated progress panel.

---

## Progress Model

The UI should mirror the real phases already present in `sync.js`:

1. `Authorizing` or `Refreshing token`
2. `Scanning vault`
3. `Ensuring Feishu folders`
4. `Uploading changed files`
5. `Writing sync state`
6. `Completed` or `Failed`

Rules:

- Do not invent percentage progress before the total work is known.
- Once scan results are known, progress should include counts, not just spinner text.
- Report large-file skips explicitly; they are meaningful user outcomes, not silent no-ops.
- If the core still aborts on the first file-level error, the UI must say the run stopped early.

---

## Error UX Rules

Errors should be actionable and sanitized.

### Missing Configuration

- Name the missing field.
- Link or route the user to settings.
- Do not start partial work.

### Auth Failures

- Explain whether the failure happened before browser launch, during callback, or during token exchange.
- Suggest reconnect when the saved token is invalid.
- Never expose raw token strings.

### Sync Failures

- Preserve the most relevant path or phase from the failing operation.
- Show a short notice plus a place to inspect richer details.
- Avoid dumping entire Feishu payloads into the primary UI.

### Recoverability

- If a failure requires user action, say so.
- If retry is safe, the UI can expose retry from the failed state.
- If the sync partially completed, say that clearly instead of implying success.

---

## UX Notes For Current Sync Semantics

The current sync behavior has important implications the plugin must surface honestly:

- Unchanged files are skipped based on saved file size and modification time.
- Files above `maxDirectUploadMB` are skipped, not uploaded later automatically.
- Existing same-name Feishu files are deleted before the replacement upload.
- The sync is vault-wide and recursive, not limited to the active note.

These are user-facing facts and should not stay hidden in implementation details.

---

## Forbidden Patterns

- Using only `console.log` as the sync UX
- Running overlapping syncs
- Showing success when any required phase failed
- Hiding skipped oversize files from the final summary
- Exposing raw secret values in notices, modals, or logs

## Scenario: Ribbon + Notice UX Without Status Bar

### 1. Scope / Trigger

- Trigger: the plugin now has a real ribbon button and persisted summary, but the status-bar text was deliberately removed during cleanup.

### 2. Signatures

- `src/ui/sync-button.ts`
  - `setIdle()`
  - `setSyncing()`
  - `setSuccess()`
  - `setWarning()`
  - `setError()`
- `src/ui/notification-manager.ts`
  - `syncStarted()`
  - `syncCompleted(summary)`
  - `needsConfiguration(fields)`
  - `needsAuthorization()`

### 3. Contracts

- The primary runtime surfaces are:
  - ribbon icon state,
  - short Notice messages,
  - persisted `lastSync` summary in plugin data.
- There is currently no status-bar text surface and no manual token-refresh command; new work should not reintroduce either casually.

### 4. Validation & Error Matrix

| Case | Expected UX |
|------|-------------|
| Sync started | notice + ribbon enters syncing state |
| Sync completed with zero failures | success notice + ribbon success state |
| Sync completed with file failures | warning or failed summary, never silent success |
| Sync blocked by config/auth | warning notice before any side effects |
| User cancels sync | cancellation notice + ribbon returns to idle without a success flash |

### 5. Good / Base / Bad Cases

- Good: a concise Notice plus a persisted summary users can query later.
- Base: a ribbon-only live indicator with no extra panels.
- Bad: reintroducing developer-console spam or a permanent status bar line just to show progress.

### 6. Tests Required

- Clicking the ribbon button should not create a status-bar item.
- Failing sync should leave a failed summary in plugin data.
- Partial sync should drive the ribbon into warning state before it returns to idle.
- Success should auto-reset the ribbon button back to idle after the short success window.

### 7. Wrong vs Correct

#### Wrong

- show `Feishu Sync: ...` in the status bar while also logging the same state transitions in multiple layers

#### Correct

- keep one transient UI path for runtime state and one persisted summary for later inspection
