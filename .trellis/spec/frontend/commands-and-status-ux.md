# Commands And Status UX

> Purpose: define how the plugin exposes auth and sync actions through Obsidian commands, notices, and long-running status feedback.

---

## Current Repo Reality

The current plugin flow is Obsidian-native:

1. Open plugin settings
2. Authorize Feishu through the settings UI
3. Start sync from the ribbon button or command palette
4. Review summary and follow-up notices inside Obsidian

The plugin currently turns the real runtime phases into Obsidian interactions instead of relying on standalone console output.

---

## Required Commands

Current implemented commands and entrypoints:

- `Start Lark Sync`
- `Cancel Lark Sync`
- `Open Lark Sync settings`
- `Preview Lark Sync scope`
- `Show Lark Sync status`

Authorization is handled through the settings UI with an authorize action, not through a separate command.

---

## Command Execution Rules

- Commands must validate required settings before side effects.
- `Start Lark Sync` must refuse to start if another sync is already running.
- If `refreshToken` is missing or invalid, the sync command should route the user toward reauthorization.
- Do not start sync automatically on plugin load.
- Only expose controls that really exist in the runtime. The current plugin supports cancel, not pause/resume.

---

## Status Surfaces

### Notices

Use for concise moments:

- auth started
- auth succeeded
- sync started
- sync completed
- sync failed

Keep notices short and actionable.
Use the current plugin product name in sync notices and command labels so rename work does not leave mixed old/new wording in the UI.

### Persistent Runtime Status

Use a longer-lived surface for in-progress work:

- ribbon icon state
- status-bar progress text
- persisted last result summary

### Last Result Summary

Persist and display a structured summary after each run:

- started time
- finished time
- files discovered
- uploaded count
- skipped unchanged count
- skipped oversized count
- failure state and first failing path, if any

Do not rely on users reading developer console logs to understand what happened.

---

## Progress Model

The UI should reflect the current runtime phases:

1. `Authorizing` or `Refreshing token`
2. `Scanning vault`
3. `Ensuring Feishu folders`
4. `Uploading changed files`
5. `Writing sync state`
6. `Completed` or `Failed`

Rules:

- Do not invent percentage progress before total work is known.
- Once scan results are known, progress should include counts when possible.
- The current status bar should report processed file counts against total candidate files, plus uploaded/skipped/failed counts when known.
- Report large-file skips explicitly.
- If the run stops on an upload or doc-creation error, the UI must say the run stopped early.

---

## Error UX Rules

### Missing Configuration

- Name the missing field.
- Route the user to settings.
- Do not start partial work.

### Auth Failures

- Explain whether the failure happened before browser launch, during callback, or during token exchange/refresh.
- Suggest reconnect when the saved token is invalid.
- Never expose raw token strings.

### Sync Failures

- Preserve the most relevant path or phase from the failing operation.
- Show a short notice plus a place to inspect the saved summary.
- Avoid dumping entire Feishu payloads into the main UI.

### Recoverability

- If a failure requires user action, say so.
- If retry is safe, the UI can expose retry later, but it must not imply automatic recovery that does not exist.
- If the sync partially completed, say that clearly instead of implying success.

---

## UX Notes For Current Sync Semantics

The current sync behavior has important user-facing consequences:

- unchanged files are skipped based on saved file size and modification time
- files above `maxDirectUploadMB` are skipped
- existing same-name Feishu files are deleted before replacement upload
- the sync is vault-wide and recursive, not limited to the active note
- Markdown document mode changes the remote representation of Markdown files when enabled

These facts should not stay hidden in implementation details.

---

## Forbidden Patterns

- using only `console.log` as the sync UX
- running overlapping syncs
- showing success when any required phase failed
- hiding skipped oversize files from the final summary
- exposing raw secret values in notices, modals, or logs

## Scenario: Ribbon + Notice + Status Bar Progress

### 1. Scope / Trigger

- Trigger: large sync runs need a bottom status-bar surface so users can see real-time file progress instead of waiting only for the final Notice.

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
- `src/ui/sync-status-bar.ts`
  - `setStarting()`
  - `setBlocked(message)`
  - `setProgress(progress)`
  - `setSummary(summary)`

### 3. Contracts

- The primary runtime surfaces are:
  - ribbon icon state,
  - status-bar progress text,
  - short Notice messages,
  - persisted `lastSync` summary in plugin data.
- Status-bar text must render the same underlying runtime phases as the ribbon/notice flow:
  - `Scanning vault`
  - `Ensuring Feishu folders`
  - `Uploading changed files`
  - `Writing sync state`
- Once scan results are known, the status bar should show processed file counts against total candidate files and include uploaded/skipped/failed counts when available.
- Current file path, if shown, should stay in the tooltip/title rather than bloating the one-line status text.

### 4. Validation & Error Matrix

| Case | Expected UX |
|------|-------------|
| Sync started | notice + ribbon enters syncing state + status bar shows start/progress text |
| Scan finished and totals are known | status bar shows processed/total counts |
| Sync completed with zero failures | success notice + ribbon success state + status bar summary |
| Sync completed with file failures | warning or failed summary, never silent success |
| Sync blocked by config/auth | warning notice before any side effects + blocked status-bar message |
| User cancels sync | cancellation notice + ribbon returns to idle without a success flash + cancelled status-bar message |

### 5. Good / Base / Bad Cases

- Good: one runtime progress vocabulary rendered into ribbon, notice, and status bar without duplicating sync logic in the UI layer.
- Base: status bar shows `processed/total`, `uploaded`, `skipped`, and `failed` on one line.
- Bad: UI invents its own counters instead of consuming structured runtime progress, or multiple layers log/announce conflicting progress text.

### 6. Tests Required

- Plugin load should create one status-bar item and reuse it across sync runs.
- Clicking the ribbon button should update the existing status-bar item instead of creating duplicates.
- Failing sync should leave a failed summary in plugin data.
- Partial sync should drive the ribbon into warning or error state before it returns to idle.
- Large sync should update status bar counts while files finish.
- Success should auto-reset the ribbon button back to idle after the short success window.

### 7. Wrong vs Correct

#### Wrong

- create an ad hoc status-bar string in `main.ts` that guesses progress separately from the sync runtime

#### Correct

- keep one structured runtime progress object and let ribbon, notice, and status bar render that same state
