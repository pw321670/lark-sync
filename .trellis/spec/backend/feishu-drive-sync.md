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
   - if file stats are unchanged but sync state has no usable `remote.token`, treat the file as needing recovery instead of skipping it
   - if that remote document still exists, update it in place
   - otherwise try same-folder and same-title recovery
   - only create a new online document when neither of the above succeeds
   - after the document path succeeds, delete any stale same-folder regular-file upload for the full `.md` filename
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
- Missing `remote.token` in document mode is a state-repair case, not a reason to skip an unchanged Markdown file.
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
- Re-running document mode with unchanged local bytes but missing `remote.token` now repairs the remote identity instead of reporting the file as skipped.
- Document-mode content replacement is implemented by clearing the root page children and recreating the Markdown-derived blocks inside the same document.
- Remote document identity is preserved, but block ids are not preserved across document-content replacement.
- If sync state is missing, same-folder title recovery may attach the path to the first matching remote document in that folder to avoid creating more duplicates.
- When a Markdown note is synced as an online doc, any stale regular Drive file with the same local `.md` filename is deleted after the doc update/create succeeds.
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
- Delete `remote.token` from one unchanged Markdown state entry and verify the next document-mode sync repairs it instead of skipping the file.
- Seed a stale `Note.md` regular file beside the online doc and verify the next successful document-mode sync removes the stale regular file.
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

## Scenario: True Incremental DocX Update Flow

### 1. Scope / Trigger

- Trigger: Markdown document sync needed to stop creating duplicate Feishu docs and instead reuse a known remote `document_id` across runs.

### 2. Signatures

```ts
export class FeishuDocClient {
  async documentExists(docId: string): Promise<boolean>;
  async updateDocument(
    docId: string,
    markdownContent: string,
    options?: { parentBlockId?: string },
  ): Promise<void>;
}

export interface FileState {
  remote?: {
    type: 'document';
    token: string;
    title?: string;
    parentFolderToken?: string;
    url?: string;
  };
}
```

### 3. Contracts

- Primary identity for a Markdown document is `state[relPath].remote.token`.
- Update order is:
  1. try persisted `remote.token`
  2. if missing or stale, try same remote folder + same document title recovery
  3. if recovery fails, create a new document
- If `size` and `mtimeMs` still match but `remote.token` is missing, the coordinator must still send the Markdown file through the recovery/create path instead of skipping it.
- In-place document update is implemented as:
  1. `GET /open-apis/docx/v1/documents/:document_id`
  2. `GET /open-apis/docx/v1/documents/:document_id/blocks/:block_id/children`
  3. `DELETE /open-apis/docx/v1/documents/:document_id/blocks/:block_id/children/batch_delete`
  4. `POST /open-apis/docx/v1/documents/:document_id/blocks/:block_id/children`
- The parent block for current whole-document replacement is the root page block, i.e. the `document_id` itself.
- Recovery by title must stay scoped to the resolved remote parent folder; never search the whole drive globally by title.
- Same-folder title recovery is a fallback only. It must not run before a persisted `remote.token` lookup.
- Existing document identity must only be written back to state after the remote update/create operation succeeds.
- After document update/create succeeds, delete same-folder regular-file matches for the full Markdown filename such as `Note.md` so one local note does not leave two remote representations behind.

### 4. Validation & Error Matrix

| Case | Expected behavior |
|------|-------------------|
| `GET /documents/:document_id` returns not found | treat persisted remote as stale and continue to recovery/create |
| `size` and `mtimeMs` match but `remote.token` is missing | do not skip; run recovery/create and write a fresh `remote.token` on success |
| Child list returns zero blocks | skip delete and append new blocks directly |
| Child list returns `n > 0` blocks | delete `[0, n)` before appending replacement blocks |
| Append fails after delete | surface sync failure; do not mark local state as successful |
| Multiple same-title docs exist in one folder during recovery | reuse the first valid doc to stop duplicate growth, but log the ambiguity |
| Recovery title match resolves to a non-docx drive item | ignore it and continue searching/creating |
| A stale regular `Note.md` file still exists in the same folder | delete it after doc update/create succeeds |

### 5. Good / Base / Bad Cases

- Good: local `03-bbb/03未命名.md` keeps the same remote doc URL after repeated edits and plugin reloads.
- Base: if sync state is missing, recovery may reuse one same-title doc in the same remote folder.
- Bad: delete all same-title docs before checking the persisted `docId`, or recover by title across unrelated remote folders.

### 6. Tests Required

- Create a Markdown doc, sync it, edit it, sync again, and assert the remote doc URL is unchanged.
- Reload the plugin between two edits and assert the second sync still updates the same remote doc.
- Remove `remote.token` from an unchanged Markdown state entry and assert the next sync still reaches recovery/create instead of reporting the file as skipped.
- Delete the remote doc manually, sync again, and assert recovery or recreation succeeds without leaving the state half-written.
- Seed multiple same-title docs in one remote folder with missing local state and assert sync reuses one instead of creating a new duplicate.
- Seed a stale regular `Note.md` file beside the remote doc and assert a successful document-mode sync deletes that stale file.

### 7. Wrong vs Correct

#### Wrong

```ts
await deleteExistingItems(parentFolderToken, docTitle);
const result = await feishuDocClient.createDocument(docTitle, markdownText, {
  parentFolderToken,
});
```

#### Correct

```ts
const previousToken = previousState?.remote?.token;

if (previousToken) {
  await feishuDocClient.updateDocument(previousToken, markdownText);
} else {
  const recoveredToken = await recoverExistingDocumentToken(parentFolderToken, docTitle);
  if (recoveredToken) {
    await feishuDocClient.updateDocument(recoveredToken, markdownText);
  } else {
    await feishuDocClient.createDocument(docTitle, markdownText, {
      parentFolderToken,
    });
  }
}
```

## Scenario: Inspectable DocX API Errors

### 1. Scope / Trigger

- Trigger: DocX APIs return both HTTP status and Feishu `code/msg`; using default throwing hides the response body and makes missing-doc recovery brittle.

### 2. Signatures

- [`src/sync/feishu-doc-client.ts`](../../../src/sync/feishu-doc-client.ts)
  - `requestApi(init, action)`
  - `buildError(action, response, payload)`
  - `class FeishuDocClientError`

### 3. Contracts

- DocX client requests must use `requestUrl({ throw: false })`.
- The client must inspect both:
  - `response.status`
  - Feishu JSON envelope `code` / `msg`
- Missing-doc detection must currently treat these as stale/missing identity signals:
  - HTTP `404`
  - Feishu `code = 1770002`
  - Feishu `code = 1770003`
- Client code must throw a typed error that preserves:
  - HTTP status
  - Feishu API code
  - Feishu message
  - whether the error means “remote doc is missing”

### 4. Validation & Error Matrix

| Case | Expected behavior |
|------|-------------------|
| HTTP 200 and `code = 0` | success |
| HTTP 200 and `code != 0` | typed DocX error with API code/message |
| HTTP 404 and JSON body | typed DocX error with `isMissing = true` |
| network failure before response | surface a normal thrown error; do not classify as missing doc |

### 5. Good / Base / Bad Cases

- Good: recovery code can branch on `error.isMissing`.
- Base: logs still show the original status and Feishu `code`.
- Bad: rely on default `requestUrl` throwing and then guess missing-doc behavior from a stringified error message.

### 6. Tests Required

- Simulate a missing remote doc and assert the update path reaches recovery/create.
- Simulate a non-missing DocX API failure and assert sync fails instead of silently recreating a doc.
- Inspect logs or thrown error fields and assert status/API code remain available.

### 7. Wrong vs Correct

#### Wrong

```ts
const response = await requestUrl({
  url,
  method: 'GET',
});
```

#### Correct

```ts
const response = await requestUrl({
  url,
  method: 'GET',
  throw: false,
});

if (response.status >= 400 || response.json.code !== 0) {
  throw buildError(action, response, response.json);
}
```
