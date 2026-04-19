# Quality And Safety

This project is an Obsidian plugin with TypeScript build infrastructure. The quality bar is based on the current plugin runtime, not on removed standalone scripts.

## Source Anchors

- [`README.md`](../../../README.md): project overview and usage
- [`config/config.example.json`](../../../config/config.example.json): stable runtime contract for core settings concepts
- [`src/main.ts`](../../../src/main.ts): plugin entry point with command registration and sync gating
- [`src/oauth/*`](../../../src/oauth): auth flow, refresh, and auth storage
- [`src/sync/*`](../../../src/sync): sync orchestration, upload, state, and Feishu clients
- [`.gitignore`](../../../.gitignore): local-only sensitive/runtime files

## Current Quality Profile

- **Build system**: TypeScript compilation plus esbuild bundle generation
- **Type safety**: shared config and sync types flow through `src/`
- **Modular architecture**: auth, sync, settings, UI, and utility responsibilities are split
- **Error handling**: fail-fast auth gating plus retry-aware upload behavior
- **Concurrency**: configurable concurrent uploads with a single-run sync guard
- **Logging**: runtime logs exist, but user-visible UX should come from notices and summaries, not developer-console spam

## Failure Handling Rules

- Fail fast on missing required config.
- Fail fast on invalid or missing auth state before Drive or Doc API calls.
- Fail fast on Feishu responses whose `code` is not `0`.
- Do not silently continue after a failed delete, upload, or doc-creation operation.
- If sync partially succeeds, surface that as partial or failed state rather than false success.

## Safety Boundaries

- `config/config.example.json` is safe to commit; local plugin data is not.
- `appSecret`, `userAccessToken`, and `refreshToken` must never appear in committed files, notices, or default logs.
- The sync runtime must not rely on repository-root config/state files.
- Browser launch, callback hosting, and raw Obsidian APIs are adapter concerns, not business-logic concerns.

## Migration Constraints

- Preserve the meaning of current config keys or add a documented compatibility layer.
- Preserve normalized relative-path behavior and current sync-state semantics unless a migration plan is documented.
- Do not assume browser `fetch` can reach Feishu auth endpoints from `app://obsidian.md`; use `requestUrl` where required.
- When simplifying code, remove prototype-only debug logging instead of copying it into new layers.

## Manual Regression Checklist

- Run `npm run build` and confirm the plugin bundle still typechecks and builds.
- In an Obsidian test vault, start authorization and confirm the browser flow completes and writes local auth state.
- Start sync and confirm token refresh happens before remote file work when needed.
- Confirm folder creation happens before file uploads.
- Re-run sync without edits and confirm unchanged files are skipped.
- Modify an existing file and confirm it is re-uploaded and reflected in current sync state.
- Add an excluded path and confirm it never reaches the remote target.
- Add a file above `maxDirectUploadMB` and confirm the run continues while that file is skipped.
- If `markdownSyncMode=document` is enabled, confirm Markdown files take the doc path and failures surface clearly.
- If `markdownSyncMode=document` is enabled, confirm a second edit to the same Markdown file keeps the same remote doc URL instead of creating a duplicate doc.

## Known Gaps To Revisit Deliberately

- no automated tests and no dedicated lint command
- no pagination handling for folder listing beyond current client behavior
- no reconciliation for local deletions
- document updates are still coarse-grained block replacement inside one `docId`, not fine-grained block patching
- same-folder title recovery can be ambiguous if old duplicate docs already exist and sync state is missing
- some debug-heavy logging still exists in sync client/upload paths and should keep shrinking
