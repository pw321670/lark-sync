# Feishu Drive Sync

This document defines the current remote sync algorithm and Feishu Drive API assumptions implemented in `sync.js`.

## Source Anchors

- [`sync.js`](../../../sync.js)
  - `listFolderItems()`
  - `createFolder()`
  - `ensureFolder()`
  - `uploadSmallFile()`
  - `findExistingFilesInFolder()`
  - `deleteFileByToken()`
  - `main()` folder and file orchestration

## Current API Surface

| Operation | Endpoint | Current caller |
|-----------|----------|----------------|
| Refresh token | `POST /open-apis/authen/v2/oauth/token` | `refreshUserAccessToken()` |
| List folder contents | `GET /open-apis/drive/v1/files?folder_token=...&page_size=200` | `listFolderItems()` |
| Create folder | `POST /open-apis/drive/v1/files/create_folder` | `createFolder()` |
| Upload file | `POST /open-apis/drive/v1/files/upload_all` | `uploadSmallFile()` |
| Delete file | `DELETE /open-apis/drive/v1/files/{token}?type=file` | `deleteFileByToken()` |

The Drive client currently treats `data.code === 0` as success and throws `Error` otherwise.

## Folder Discovery And Creation

The sync run builds folder structure first:

1. Initialize `folderMap[""] = config.feishuRootFolderToken`.
2. Walk the vault and sort directories by normalized `relPath`.
3. For each directory:
   - derive `parentKey` from `path.dirname(dir.relPath)` and normalize `"."` to `""`
   - look up the parent token in `folderMap`
   - call `ensureFolder(userAccessToken, parentToken, folderName)`
4. `ensureFolder()` lists the parent folder and reuses an existing entry only when:
   - `item.type === "folder"`
   - `item.name === folderName`
5. If no matching folder exists, `createFolder()` creates it and returns the new token.
6. Cache the token in `folderMap[dir.relPath]` for later child directories and files in the same run.

## Folder Creation Retry Policy

`createFolder()` is the only remote operation with built-in retry behavior today:

- up to 3 attempts
- wait `1000 * attempt` milliseconds between failures
- log the raw response text before JSON parsing
- treat non-JSON responses as errors

Upload and delete calls do not currently retry.

## File Sync Algorithm

For each normalized file path, in sorted order:

1. Read local `stat`.
2. Skip unchanged files using the `state.json` comparison rules.
3. Skip files whose size exceeds `config.maxDirectUploadMB`.
4. Resolve the parent folder token from `folderMap`.
5. Call `findExistingFilesInFolder()` using the file basename.
6. Delete every same-name remote file found in that folder.
7. Upload the local file with `uploadSmallFile()`.
8. Write the new `state[relPath]` entry in memory.

This is a delete-and-reupload strategy, not an in-place update strategy.

## Remote Matching Rules

- Duplicate-name detection is scoped to one Feishu parent folder and one basename.
- The current sync engine does not compare remote hashes, timestamps, or metadata.
- Local file deletion is not mirrored remotely.
- Remote pagination is not implemented beyond requesting `page_size=200`.

Any change to those assumptions is a behavioral change and should be documented here before implementation.

## Upload Contract

`uploadSmallFile()` currently assumes a direct multipart upload is valid when the file size is at or below `config.maxDirectUploadMB`.

Multipart fields:

- `file_name`
- `parent_type = "explorer"`
- `parent_node = parentFolderToken`
- `size`
- `file` as a `Blob` built from the full local file contents

There is no chunked upload path yet.

## Operational Consequences

- Re-uploading a changed file deletes all same-name remote files in the target folder first.
- Remote version history or metadata tied to the deleted file token is not preserved.
- Remote operations are sequential. There is no batching or concurrency control.
- Folder existence is checked by listing the full parent folder every time `ensureFolder()` runs.

## Migration Rules

- Keep the Drive client and the sync engine separate so API changes do not leak into traversal logic.
- Preserve the current operation order unless a new order is intentionally designed and tested:
  - refresh token
  - build folder map
  - reconcile files
  - persist state
- If pagination, chunked upload, or remote deletion reconciliation is added, define the new contract here before changing the runtime.
- If the reusable core needs to run outside Node.js, move `Blob` and transport specifics behind an adapter rather than changing sync semantics.

## Manual Verification

- Start with an empty Feishu target folder and verify nested local folders are created in the right hierarchy.
- Upload a file twice after modifying it and verify the remote folder ends with one current copy, not duplicates.
- Place more than one same-name remote file in a target folder and verify the next upload deletes all matches before re-uploading.
- Test a file above `maxDirectUploadMB` and verify it is skipped without breaking the rest of the run.
- Force a transient folder-creation failure and verify the 3-attempt retry loop is the only automatic retry behavior.
