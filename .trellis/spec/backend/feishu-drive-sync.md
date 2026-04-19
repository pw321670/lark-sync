# Feishu Drive Sync

This document defines the current remote sync algorithm and Feishu Drive / Feishu Docs API assumptions implemented in `src/sync/`.

## Source Anchors

- [`src/sync/sync-coordinator.ts`](../../../src/sync/sync-coordinator.ts)
- [`src/sync/upload-manager.ts`](../../../src/sync/upload-manager.ts)
- [`src/sync/feishu-client.ts`](../../../src/sync/feishu-client.ts)
- [`src/sync/feishu-doc-client.ts`](../../../src/sync/feishu-doc-client.ts)
- [`src/sync/types.ts`](../../../src/sync/types.ts)

## Current API Surface

| Operation | Endpoint family | Current caller |
|-----------|-----------------|----------------|
| Refresh token | `POST /open-apis/authen/v2/oauth/token` | OAuth layer before sync starts |
| List folder contents | Feishu Drive files list | `FeishuClient.ensureFolder()` / duplicate-name checks |
| Create folder | Feishu Drive create folder | `FeishuClient.ensureFolder()` |
| Upload file | Feishu Drive multipart upload | `UploadManager.uploadAsRegularFile()` |
| Delete file | Feishu Drive delete file | `UploadManager.deleteExistingFiles()` |
| Get doc metadata | Feishu DocX document get | `FeishuDocClient.updateDocument()` / document recovery |
| List child blocks | Feishu DocX children list | `FeishuDocClient.updateDocument()` |
| Delete child blocks | Feishu DocX batch delete | `FeishuDocClient.updateDocument()` |
| Create online doc | Feishu DocX create / block APIs | `UploadManager.uploadAsDocument()` through `FeishuDocClient` |
| Update online doc in place | Feishu DocX get / delete children / create block APIs | `UploadManager.uploadAsDocument()` through `FeishuDocClient.updateDocument()` |

The runtime treats `data.code === 0` as success and surfaces errors otherwise.

## Folder Discovery And Creation

The sync run builds folder structure before uploads:

1. Initialize `folderMap[""] = config.feishuRootFolderToken`.
2. Collect parent paths from the changed file set.
3. Sort parent paths lexicographically.
4. For each path:
   - derive `parentPath`
   - look up the parent token in `folderMap`
   - call `FeishuClient.ensureFolder(parentToken, folderName)`
5. Cache the result in `folderMap[relPath]` for later child folders and file uploads.

Folder discovery is based on normalized vault-relative paths with `/` separators.

## File Sync Algorithm

For each changed file:

1. Resolve the parent folder token from `folderMap`.
2. Read local file content through the injected vault reader.
3. If the file is Markdown and `markdownSyncMode === 'document'`:
   - try the persisted remote `docId` from sync state first
   - if that remote document still exists, update it in place
   - otherwise try same-folder and same-title recovery
   - only create a new online document when neither of the above succeeds
4. Otherwise:
   - find same-name files in the target folder
   - delete all same-name remote matches
   - upload the local file as a regular Drive file
5. Record successful uploads back into `StateTracker`.

This remains a delete-and-reupload strategy for regular files, not an in-place update strategy.
Document mode is now identity-preserving across runs: the same local `relPath` reuses its stored remote `docId` whenever possible.

## Remote Matching Rules

- Duplicate-name detection is scoped to one Feishu parent folder and one basename.
- In document mode, the primary remote identity is the persisted `remote.token` (`document_id`) from sync state.
- Same-folder and same-title matching is now a recovery fallback, not the primary identity mechanism.
- The fallback title used in document mode is the Markdown filename without `.md`.
- The current sync engine does not compare remote hashes, timestamps, or metadata.
- Local file deletion is not mirrored remotely.
- Folder token caching is in-memory for one sync run.
- Markdown document mode is controlled per sync config and does not change non-Markdown file behavior.

Any change to those assumptions is a behavioral change and should be documented here before implementation.

## Upload Contract

Regular file uploads currently assume direct multipart upload is valid when `file.size <= maxDirectUploadMB`.

Important fields:

- `file_name`
- `parent_type = "explorer"`
- `parent_node = parentFolderToken`
- `size`
- `file`

There is no chunked upload path yet.

## Retry And Concurrency

- Folder creation is handled inside `FeishuClient.ensureFolder()`.
- File uploads use `UploadManager.executeWithConcurrency()` with configurable concurrency.
- Failed uploads are retried with configurable `retryAttempts` and `retryDelay`.
- Request-level retry for transient Feishu API failures lives inside the client layer.

These are current plugin-runtime behaviors and should not be described as a legacy migration artifact anymore.

## Operational Consequences

- Re-uploading a changed file deletes all same-name remote files in the target folder first.
- Re-syncing a Markdown file in document mode now keeps the same remote document URL when the stored `docId` is still valid.
- Document-mode content replacement is implemented by clearing the root page children and recreating the Markdown-derived blocks inside the same document.
- Remote document identity is preserved, but block ids are not preserved across document-content replacement.
- If sync state is missing, same-folder title recovery may attach the path to the first matching remote document in that folder to avoid creating more duplicates.
- Uploads can run concurrently; folder-map creation stays ordered.
- Files above `maxDirectUploadMB` are skipped and reported, not uploaded later automatically.

## Migration Rules

- Keep the Feishu client and the sync coordinator separate so API changes do not leak into traversal logic.
- Preserve the current high-level order unless a new order is intentionally designed and tested:
  - validate/refresh token
  - scan vault
  - filter and detect changes
  - build folder map
  - upload files or documents
  - persist sync state
- If pagination, chunked upload, remote deletion reconciliation, or finer-grained block patching is added, define the new contract here before changing runtime behavior.

## Manual Verification

- Start with an empty Feishu target folder and verify nested local folders are created in the right hierarchy.
- Upload a file twice after modifying it and verify the remote folder ends with one current copy, not duplicates.
- Place more than one same-name remote file in a target folder and verify the next upload deletes all matches before re-uploading.
- Test a file above `maxDirectUploadMB` and verify it is skipped without breaking the rest of the run.
- Set `markdownSyncMode=document` and verify Markdown files create online docs while non-Markdown files still upload normally.
- Re-run Markdown document sync after modifying the same file and verify the remote doc URL stays the same.
- Reload the plugin and verify a later Markdown edit still updates the same remote doc rather than creating a duplicate.
- Verify configured upload retries and concurrent upload limits behave as expected.

## Scenario: Markdown To Feishu Online Documents

### 1. Scope / Trigger

- Trigger: converting Markdown files into Feishu online documents instead of binary file uploads.

### 2. Signatures

```ts
export class FeishuDocClient {
  async createDocument(
    title: string,
    markdownContent: string,
    options?: { parentFolderToken?: string },
  ): Promise<{ docId: string; docUrl: string }>;
}
```

### 3. Contracts

- `title`: document title derived from the Markdown filename without `.md`
- `parentFolderToken`: optional target folder
- `markdownContent`: raw Markdown text decoded from the local file
- persisted doc identity is `remote.token` in sync state, keyed by normalized local `relPath`
- update order is state-first, then same-folder title recovery, then fresh creation
- Feishu block payloads must use numeric `block_type` values and snake_case field names
- Heading payload keys must use semantic names such as `heading1`, `heading2`, `heading3`
- Do not use the numeric `block_type` value itself as the payload object key
- Block type constants must follow the current official DocX contract (`Code = 14`, `Quote = 15`, `Todo = 17`, `Divider = 22`)
- In-place document updates clear the root page children and recreate the Markdown-derived block list inside the same `document_id`

### 4. Validation & Error Matrix

| Case | Expected behavior |
|------|-------------------|
| Missing `docx:document` or `docx:document:write_only` scope | doc creation or block creation fails clearly |
| Document create succeeds but block append fails | surface as sync failure, do not mark upload state as successful |
| Stored `remote.token` points to a deleted doc | fall back to same-folder title recovery or fresh creation |
| Stored `remote.token` is valid | update the existing remote doc in place and keep the same doc URL |
| Non-Markdown file | stay on regular file-upload path |
| `markdownSyncMode=file` | Markdown stays on regular file-upload path |

### 5. Good / Base / Bad Cases

- Good: Markdown mode is a deliberate config choice and reuses the same coordinator and state flow.
- Base: one document client owns DocX API details.
- Bad: duplicate Markdown upload logic in UI code, direct block-payload construction inside command handlers, or primary identity rules that depend only on title instead of persisted remote document ids.

### 6. Tests Required

- Create a document with text blocks, headings, lists, and code blocks.
- Modify the same Markdown file twice and confirm the second sync keeps the same `docId`.
- Verify OAuth permission failures are surfaced as actionable sync errors.
- Verify state is only updated after document creation succeeds.

### 7. Wrong vs Correct

#### Wrong

```ts
{
  block_type: 'text',
  text: {
    elements: [{
      type: 'textRun',
      textRun: { content: 'text' },
    }],
  },
}

{
  block_type: 3,
  3: {
    elements: [{ type: 'text_run', text_run: { content: 'Title' } }],
  },
}
```

#### Correct

```ts
{
  block_type: 2,
  text: {
    elements: [{
      type: 'text_run',
      text_run: { content: 'text', style: {} },
    }],
  },
}

{
  block_type: 3,
  heading1: {
    elements: [{ type: 'text_run', text_run: { content: 'Title', style: {} } }],
  },
}
```
