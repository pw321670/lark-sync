# Quality and Compatibility

> Purpose: preserve current behavior during the standalone-to-plugin migration and define the minimum manual validation for desktop-first plugin work.

---

## Current Repo Reality

The project does not have automated plugin tests yet. The current behavior lives in the standalone scripts and serves as the migration contract.

Key current behaviors:

- Authorization requires browser-based OAuth and writes managed tokens locally.
- Sync refreshes the access token before scanning files.
- Paths are normalized to `/` before exclude checks and state keys.
- Exclude rules match both exact paths and child paths.
- Recursive directory sync creates missing Feishu folders on demand.
- Unchanged files are skipped when `size` and `mtimeMs` match saved state.
- Oversize files are skipped when they exceed `maxDirectUploadMB`.
- Changed files replace same-name Feishu files by deleting first, then uploading.

Any plugin work that intentionally changes one of those rules must update this document and the relevant UX docs in the same task.

---

## Desktop-First Compatibility Rules

- The first plugin target is Obsidian desktop, not mobile.
- Do not promise mobile support until auth flow, file access, and upload behavior are explicitly designed for it.
- If the plugin can be installed on unsupported platforms, disable unsupported commands with a clear explanation.
- Any runtime API dependency that is currently satisfied by Node.js in the standalone scripts should be isolated behind an adapter so future compatibility work is possible.

---

## Migration-Safe Rules

- Build on the existing auth and sync contract before adding extra features such as scheduling or background sync.
- Preserve current config meanings even if the settings UI becomes more guided.
- Preserve current incremental sync semantics unless there is an intentional migration plan.
- Prefer importing or mapping existing standalone data over forcing unnecessary reauthorization or full reupload.
- Do not silently change the meaning of `exclude` entries, path normalization, or `maxDirectUploadMB`.
- Document any user-visible divergence from the standalone flow before implementation lands.

---

## Manual Test Matrix

Use these cases for every meaningful plugin change that touches the frontend layer.

1. First-run setup
   - Missing required settings block auth or sync with actionable guidance.
2. Authorization success
   - Browser opens, callback completes, and the plugin stores managed auth state without exposing tokens.
3. Authorization recovery
   - Invalid or missing refresh token routes the user toward reconnect instead of failing silently.
4. Initial vault sync
   - Nested folders are created and files upload to the configured Feishu root.
5. Incremental sync
   - Unchanged files are skipped, changed files are re-uploaded, and the summary reflects both counts.
6. Exclude behavior
   - Exact excluded paths and child paths are both skipped.
7. Oversize file behavior
   - Files above `maxDirectUploadMB` are skipped and reported to the user.
8. Failure reporting
   - A Feishu API or filesystem error produces a clear failure message with phase or path context.
9. Plugin reload safety
   - Persisted settings and sync state survive disable/enable or app restart.
10. Standalone migration
   - If import from old local files exists, it preserves expected settings and does not destroy originals.

---

## Release Readiness Rules

Before calling a plugin change ready:

- The command flow still matches the current auth-then-sync operator model unless the change explicitly documents a new model.
- Settings and secret handling follow [Settings and Secrets](./settings-and-secrets.md).
- Status and error surfaces follow [Commands and Status UX](./commands-and-status-ux.md).
- Shared-core ownership still follows [Obsidian Boundaries](./obsidian-boundaries.md).
- Manual desktop verification has been performed for the affected flows.

---

## Forbidden Patterns

- Shipping plugin UX that hides current sync limitations
- Declaring mobile support by default
- Regressing incremental sync behavior without an explicit migration note
- Treating console output as sufficient release validation
- Adding automation before the manual auth and sync flow is trustworthy
