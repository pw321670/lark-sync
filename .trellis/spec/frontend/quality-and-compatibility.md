# Quality And Compatibility

> Purpose: preserve current plugin behavior and define the minimum manual validation for desktop-first Obsidian work.

---

## Current Repo Reality

The project does not have automated plugin tests yet. The current behavior lives in the plugin runtime itself.

Key current behaviors:

- Authorization requires browser-based OAuth and stores managed auth state locally.
- Sync refreshes the access token before scanning files when needed.
- Paths are normalized to `/` before filter checks and state keys.
- Path-list rules match both exact paths and child paths.
- Sync creates missing Feishu folders on demand.
- Unchanged files are skipped when `size` and `mtimeMs` match saved state.
- Oversize files are skipped when they exceed `maxDirectUploadMB`.
- Changed files replace same-name Feishu files by deleting first, then uploading.
- Markdown files may create Feishu online documents when document mode is enabled.

Any plugin work that intentionally changes one of those rules must update this document and the relevant UX docs in the same task.

---

## Desktop-First Compatibility Rules

- The first supported target is Obsidian desktop, not mobile.
- Do not promise mobile support until auth flow, file access, and upload behavior are explicitly designed for it.
- If the plugin can be installed on unsupported platforms, disable unsupported commands with a clear explanation.
- Any runtime API dependency that is currently satisfied by desktop capabilities should stay isolated enough that future compatibility work has a clear entry point.

---

## Stability Rules

- Build on the current auth and sync contract before adding extra features such as scheduling or background sync.
- Preserve current config meanings even if the settings UI becomes more guided.
- Preserve current incremental sync semantics unless there is an intentional migration plan.
- Do not silently change the meaning of path-list entries, path normalization, or `maxDirectUploadMB`.
- Document any user-visible divergence from the current flow before implementation lands.

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
6. Path-list behavior
   - Exact listed paths and child paths are both filtered consistently with the selected mode.
7. Oversize file behavior
   - Files above `maxDirectUploadMB` are skipped and reported to the user.
8. Failure reporting
   - A Feishu API or filesystem error produces a clear failure message with phase or path context.
9. Plugin reload safety
   - Persisted settings and summaries survive disable/enable or app restart.
10. Markdown document mode
   - Markdown files follow the document path only when that mode is enabled, and failures are surfaced clearly.

---

## Release Readiness Rules

Before calling a plugin change ready:

- The command flow still matches the current auth-then-sync model unless the change explicitly documents a new model.
- Settings and secret handling follow [Settings And Secrets](./settings-and-secrets.md).
- Status and error surfaces follow [Commands And Status UX](./commands-and-status-ux.md).
- Shared ownership still follows [Obsidian Boundaries](./obsidian-boundaries.md).
- Manual desktop verification has been performed for the affected flows.

---

## Forbidden Patterns

- shipping plugin UX that hides current sync limitations
- declaring mobile support by default
- regressing incremental sync behavior without an explicit note
- treating console output as sufficient release validation
- adding automation before the manual auth and sync flow is trustworthy
