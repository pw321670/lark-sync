# Filesystem And State

This document defines how the current plugin runtime discovers vault content, filters paths, and tracks incremental sync state.

## Source Anchors

- [`src/main.ts`](../../../src/main.ts): injects Obsidian file enumeration and binary reads into the sync layer.
- [`src/sync/sync-coordinator.ts`](../../../src/sync/sync-coordinator.ts): scans files, filters them, detects changes, and persists upload state.
- [`src/sync/state-tracker.ts`](../../../src/sync/state-tracker.ts): owns the current state schema and save timing.
- [`src/utils/contracts.ts`](../../../src/utils/contracts.ts): config defaults such as include/exclude mode and upload thresholds.
- [`config/config.example.json`](../../../config/config.example.json): compatibility baseline for `vaultPath`, `exclude`, and `maxDirectUploadMB`.

## Path Contract

Every path that leaves Obsidian file enumeration and enters sync logic must be:

- vault-relative
- normalized with `/` separators
- reused consistently for include/exclude checks, state keys, folder lookup, and logs

This normalization is mandatory. A path like `Folder\\Note.md` on Windows must become `Folder/Note.md` before matching or persistence.

## Match Semantics

The current sync layer supports two modes:

- `fileMatchMode = "exclude"`:
  - a path is ignored when `normalized === item`
  - or `normalized.startsWith(item + "/")`
- `fileMatchMode = "include"`:
  - a path is kept only when the same checks succeed

The current settings UI still presents these entries as the user-managed path list, so all callers must apply the same normalization rules.

There is no globbing, regex support, or case normalization beyond `/` separator normalization.

## Vault Scan Semantics

The plugin scan flow is:

1. `main.ts` calls `this.app.vault.getFiles()`.
2. The result is mapped into simple `{ path, stat }` entries.
3. `SyncCoordinator.scanFiles()` converts those entries into normalized `FileEntry` objects:
   - `relPath`
   - `size`
   - `mtimeMs`
4. `filterFiles()` applies include/exclude logic and oversize checks.
5. `detectChanges()` compares remaining files against `StateTracker`.

Current behavior is file-oriented. The runtime no longer keeps a separate standalone recursive directory walker as a second source of truth.

## State Schema

Current in-memory shape:

```json
{
  "Folder/Note.md": {
    "size": 1234,
    "mtimeMs": 1711111111111,
    "uploadedAt": "2026-04-19T03:00:00.000Z"
  }
}
```

Rules:

- the key is the normalized vault-relative file path
- `size` comes from Obsidian file stats
- `mtimeMs` comes from Obsidian file stats
- `uploadedAt` is written with `new Date().toISOString()` after a successful upload

## Change Detection

A file is treated as unchanged only when all of the following are true:

- a previous state entry exists for `state[relPath]`
- `prev.size === file.size`
- `prev.mtimeMs === file.mtimeMs`

If those checks pass, the file is skipped without any remote API calls.

## Current State Limitations

- The default `StateTracker` store is in-memory only.
- State is saved after successful uploads, but without a persistent injected store it does not survive plugin reload.
- Deleted local files are not pruned from Feishu Drive or from stored sync state.
- Files larger than `maxDirectUploadMB` are skipped and do not receive a fresh state entry for that run.
- Folder tokens are not persisted across runs; they are rebuilt in memory every sync.

These limitations are part of the current runtime behavior and must be changed deliberately, not accidentally.

## Migration Rules

- Do not switch state keys to absolute paths, platform-native separators, or remote file tokens.
- If state gains new fields, keep existing keys readable or define a migration step.
- Preserve the normalized relative-path contract even though file access now uses Obsidian APIs instead of a standalone filesystem walk.
- Keep match logic centralized so preview, sync, and settings explanations cannot drift apart.

## Manual Verification

- Add nested files and verify their normalized `relPath` values remain slash-separated on Windows.
- Add an excluded path such as `.trash` and verify it never reaches upload.
- Re-run sync without changing a file and verify it is skipped based on `size` and `mtimeMs`.
- Modify a file and verify its state entry receives a new `uploadedAt`.
- Reload the plugin and verify current state limitations are understood: unchanged-skip behavior will reset unless persistent state storage is added.

## Scenario: Obsidian Vault Reads Must Stay Vault-Relative

### 1. Scope / Trigger

- Trigger: the plugin hit a real runtime failure where folder creation worked but file uploads failed because vault-relative paths were treated as OS paths.

### 2. Signatures

- [`src/main.ts`](../../../src/main.ts)
  - `initSyncCoordinator()`
- [`src/sync/obsidian-adapter.ts`](../../../src/sync/obsidian-adapter.ts)
  - `buildSyncConfig({ config, auth })`
- [`src/sync/sync-coordinator.ts`](../../../src/sync/sync-coordinator.ts)
  - constructor `(vault)`
  - `startSync(config)`

### 3. Contracts

- Obsidian file enumeration produces vault-relative paths such as `Folder/Note.md`.
- File reads inside the plugin must use `vault.readBinary(normalizedVaultPath)`.
- Do not reinterpret vault-relative paths as OS absolute paths inside the plugin runtime.
- `SyncCoordinator` and `UploadManager` must treat `relPath` as the only file-read key in the Obsidian runtime.

### 4. Validation & Error Matrix

| Input path | Expected behavior |
|------------|-------------------|
| `Welcome.md` | read through `readBinary('Welcome.md')` |
| `00-inbox/note.md` | read through `readBinary('00-inbox/note.md')` |
| empty path | fail immediately with a local validation error |
| path mixed with OS-specific absolute path assumptions | reject as an implementation bug |

### 5. Good / Base / Bad Cases

- Good: vault-relative path is normalized once and reused end-to-end.
- Base: sync state keys still use vault-relative slash-separated paths.
- Bad: build a path with Node `path.join()` against an undefined base path inside the plugin or store a second absolute-path field for reads.

### 6. Tests Required

- Sync a root-level file and a nested file from an actual Obsidian vault.
- Verify file reads succeed without requiring a local absolute filesystem path.
- Re-run sync on Windows-style vault contents and confirm no `path argument must be of type string` error appears.

### 7. Wrong vs Correct

#### Wrong

- treat `file.path` from Obsidian as if it were a Node absolute path

#### Correct

- keep `file.path` vault-relative and hand it directly to the injected `readBinary()` callback after slash normalization
