# Fix Sync Completeness With Folder Pagination

## Goal

Make large vault syncs trustworthy again when the status bar reports uploaded/skipped counts. In the reported case, syncing `d:/onedrive/word/20-项目` ended with `Uploaded 134 file(s), skipped 119`, but Feishu did not contain every expected remote item. The fix should prevent local incremental state from hiding missing remote uploads and should make Feishu folder inventory reads complete for folders larger than one API page.

## What I Already Know

- The current status text counts skipped files from local `size`/`mtimeMs` state, not from a fresh remote completeness check.
- Markdown document mode already persists `FileState.remote` for online documents and reprocesses unchanged Markdown files when the stored document identity is missing.
- Regular file uploads currently persist no `remote` reference, so old successful local state can keep skipping a file even if Feishu does not have the expected remote file.
- `FeishuClient.listFolderItems()` currently requests `page_size=200` but does not follow `next_page_token`, so folder inventory cache can be incomplete for folders with more than 200 children.
- Feishu's folder list API is `GET /open-apis/drive/v1/files`; official docs say `page_size` has a maximum of 200 and paginated responses use `has_more` plus `next_page_token`.

## Requirements

- `listFolderItems()` must collect every page for a folder before caching and returning folder inventory.
- Regular file uploads must persist a `remote` reference after the upload succeeds.
- Incremental skip logic must not skip unchanged regular files that have no usable remote file identity in local state.
- Existing Markdown document recovery behavior must continue to work.
- The fix must preserve the current status-bar vocabulary while making `skipped` mean "local state has enough remote identity to trust the skip".
- The implementation should avoid adding a second sync path or a broad remote audit mode in this task.

## Acceptance Criteria

- [x] A folder with more than 200 children is listed across all Feishu pages before duplicate detection or folder lookup uses the result.
- [x] Newly uploaded regular files write `remote.type = "file"` and a Feishu token into sync state.
- [x] Legacy unchanged regular files that only have `size`/`mtimeMs` state are uploaded once instead of counted as skipped.
- [x] After that repair upload succeeds, the next unchanged sync can skip the same file because a remote identity exists.
- [x] Markdown files in `markdownSyncMode = "document"` still require a stored document token before they are skipped.
- [x] Failed uploads still do not update local sync state.
- [x] `npm run build` passes.

## Definition Of Done

- Code compiles with the existing build script.
- Backend specs document the new remote-state contract and paginated folder inventory behavior.
- The PRD records the root-cause conclusion for the user's `Uploaded 134 / skipped 119` observation.
- Manual follow-up recommendation is clear: rerun sync for `20-项目`; the first run after this fix may upload many previously skipped legacy files.

## Technical Approach

- Extend `RemoteFileRef.type` from document-only to `document | file`.
- Normalize plugin data loading so persisted `file` remote references survive reloads.
- Return the uploaded token from the regular-file path as a `RemoteFileRef` and let `StateTracker.updateFileStates()` persist it only after successful upload completion.
- Replace document-only recovery detection with a small remote-state completeness predicate:
  - Markdown in document mode requires `remote.type === "document"` and a token.
  - All other files require `remote.type === "file"` and a token.
- Implement a loop in `FeishuClient.listFolderItems()` using `page_token` and `next_page_token`, caching the fully accumulated result.

## Decision (ADR-lite)

**Context**: The visible symptom looks like a cache issue, but the code shows two concrete runtime gaps: local skip state is stronger than remote proof for regular files, and folder inventory only reads one page.

**Decision**: Repair completeness at the existing sync boundaries instead of adding a separate audit command. The regular incremental path will re-upload legacy regular files once to establish remote identity, and Feishu folder inventory will become complete by default.

**Consequences**: The first sync after upgrade may upload more files than before, especially in vaults whose regular-file states were created before remote file tokens were persisted. That extra work is intentional because the previous skipped count was not trustworthy for those files.

## Out Of Scope

- A full remote reconciliation/audit mode that checks every skipped file against Feishu on every run.
- Recursive Feishu folder reads; local vault recursion remains the source of traversal.
- Large multipart upload behavior beyond the existing direct-upload size limit.
- New settings UI for repair or audit modes.

## Technical Notes

- Primary files expected to change:
  - `src/sync/feishu-client.ts`
  - `src/sync/sync-coordinator.ts`
  - `src/sync/upload-manager.ts`
  - `src/sync/types.ts`
  - `src/utils/contracts.ts`
- Specs expected to change:
  - `.trellis/spec/backend/filesystem-and-state.md`
  - `.trellis/spec/backend/feishu-drive-sync.md`
- Feishu reference:
  - `https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/list.md`

## Implementation Result

- `FeishuClient.listFolderItems()` now follows `has_more` / `next_page_token` and caches the full accumulated folder inventory.
- Regular file uploads now return and persist `remote.type = "file"` with the Drive file token.
- `SyncCoordinator.detectChanges()` now treats missing or mismatched remote identity as a repair case for both online documents and regular files.
- The reported `Uploaded 134 file(s), skipped 119` case is best explained by plugin behavior: regular-file skips previously trusted local `size`/`mtimeMs` state even when no remote file identity was stored, so the skipped count could hide missing remote files.
