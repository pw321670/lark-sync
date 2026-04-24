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
| List folder contents | `GET /open-apis/drive/v1/files` | `FeishuClient.ensureFolder()` / duplicate-name checks |
| Create folder | Feishu Drive create folder | `FeishuClient.ensureFolder()` |
| Upload file | Feishu Drive multipart upload | `UploadManager.uploadAsRegularFile()` |
| Delete file | Feishu Drive delete file | `UploadManager.deleteExistingFiles()` |
| Get doc metadata | Feishu DocX document get | `FeishuDocClient.updateDocument()` / document recovery |
| List child blocks | Feishu DocX children list | `FeishuDocClient.updateDocument()` |
| Delete child blocks | Feishu DocX batch delete | `FeishuDocClient.updateDocument()` |
| Create online doc | Feishu DocX create / children / descendant block APIs | `UploadManager.uploadAsDocument()` through `FeishuDocClient` |
| Update online doc in place | Feishu DocX get / delete children / children / descendant block APIs | `UploadManager.uploadAsDocument()` through `FeishuDocClient.updateDocument()` |

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

`FeishuClient.listFolderItems()` must follow Feishu Drive pagination before caching folder inventory. The files list endpoint accepts `page_size` up to `200`; when a response returns `has_more = true`, the client must pass `next_page_token` as the next `page_token` and keep accumulating items. Cached folder inventory must represent the full current folder page sequence for that sync run, not just the first page.

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
   - persist the returned Drive file token as `remote.type = "file"`
5. Record successful uploads back into `StateTracker`.

This remains a delete-and-reupload strategy for regular files, not an in-place update strategy.
Document mode is now identity-preserving across runs: the same local `relPath` reuses its stored remote `docId` whenever possible.
Regular file mode is skip-safe across runs: unchanged files may be skipped only after state contains a persisted remote file token.

## Remote Matching Rules

- Duplicate-name detection is scoped to one Feishu parent folder and one basename.
- In document mode, the primary remote identity is the persisted `remote.token` (`document_id`) from sync state.
- Same-folder and same-title matching is now a recovery fallback, not the primary identity mechanism.
- The fallback title used in document mode is the Markdown filename without `.md`.
- Missing `remote.token` in document mode is a state-repair case, not a reason to skip an unchanged Markdown file.
- Missing `remote.token` for regular files is also a state-repair case; legacy local-only state must upload once to establish `remote.type = "file"`.
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
- Whole-file uploads are not replayed after a partial failure; the upload manager records the file failure and moves on.
- Request-level retry for transient Feishu API failures lives inside the client layer and is controlled by `retryAttempts` and `retryDelay`.
- One `RateLimiter` instance is created per sync run and shared by both `FeishuClient` and `FeishuDocClient`.
- The shared limiter must be concurrency-safe: concurrent callers may not observe the same slot and burst through together.
- Limit responses such as Feishu `code = 99991400`, HTTP `429`, or a `Retry-After` header must feed back into the shared limiter so later requests back off globally instead of only sleeping locally.
- Batch boundaries are used for progress and rate-limit degradation, but normal batches should not wait by default; cooldown is reserved for observed rate-limit feedback.

These are current plugin-runtime behaviors and should not be described as a legacy migration artifact anymore.

## Operational Consequences

- Re-uploading a changed file deletes all same-name remote files in the target folder first.
- Re-syncing a Markdown file in document mode now keeps the same remote document URL when the stored `docId` is still valid.
- Re-running document mode with unchanged local bytes but missing `remote.token` now repairs the remote identity instead of reporting the file as skipped.
- Re-running regular file sync with unchanged local bytes but missing `remote.token` now uploads once to repair legacy local-only state instead of reporting the file as skipped.
- Folder inventory cache is based on all Feishu pages for a folder, so duplicate detection and folder lookup can see items beyond the first 200 children.
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
- If chunked upload, remote deletion reconciliation, or finer-grained block patching is added, define the new contract here before changing runtime behavior.

## Manual Verification

- Start with an empty Feishu target folder and verify nested local folders are created in the right hierarchy.
- Upload a file twice after modifying it and verify the remote folder ends with one current copy, not duplicates.
- Place more than one same-name remote file in a target folder and verify the next upload deletes all matches before re-uploading.
- Test a file above `maxDirectUploadMB` and verify it is skipped without breaking the rest of the run.
- Set `markdownSyncMode=document` and verify Markdown files create online docs while non-Markdown files still upload normally.
- Re-run Markdown document sync after modifying the same file and verify the remote doc URL stays the same.
- Reload the plugin and verify a later Markdown edit still updates the same remote doc rather than creating a duplicate.
- Delete `remote.token` from one unchanged Markdown state entry and verify the next document-mode sync repairs it instead of skipping the file.
- Delete `remote.token` from one unchanged regular-file state entry and verify the next sync uploads it once and writes a `file` remote token.
- Seed a target folder with more than 200 remote children and verify same-name duplicate detection sees items after the first page.
- Seed a stale `Note.md` regular file beside the online doc and verify the next successful document-mode sync removes the stale regular file.
- Sync a standard Markdown table and verify Feishu renders a real table block whose cells still show content for empty and non-empty cells.
- Verify configured Feishu API request retries and concurrent upload limits behave as expected.
- Start a large sync with concurrent uploads enabled and verify the shared limiter still spaces Feishu requests instead of releasing multiple workers in the same moment.
- Force or observe a `99991400` / `429` rate-limit response and verify later requests back off through the shared limiter rather than immediately hammering again.

## Scenario: Paginated Folder Inventory And File Remote Identity Repair

### 1. Scope / Trigger

- Trigger: large remote folders can have more than one Feishu `drive/v1/files` page, and legacy regular-file state may contain only local `size` / `mtimeMs` without a remote token.

### 2. Signatures

```ts
export class FeishuClient {
  async listFolderItems(
    folderToken: string,
    options?: { forceRefresh?: boolean },
  ): Promise<FeishuFileItem[]>;
}

export interface RemoteFileRef {
  type: 'document' | 'file';
  token: string;
  title?: string;
  parentFolderToken?: string;
  url?: string;
}
```

### 3. Contracts

- `listFolderItems()` must request `page_size=200`, accumulate `data.files`, and continue while `data.has_more === true`.
- The next request must pass `data.next_page_token` as `page_token`; a `has_more` response without a new page token is an API contract failure and should fail the sync instead of caching partial inventory.
- The in-memory folder inventory cache stores the full accumulated page sequence for one folder token.
- Successful regular-file uploads must write `remote.type = "file"` and the returned Drive file token to sync state.
- Change detection must treat matching local `size` / `mtimeMs` plus missing or wrong `remote.type` as a repair case, not as a skip.

### 4. Validation & Error Matrix

| Case | Expected behavior |
|------|-------------------|
| Folder list has one page | cache and return that page |
| Folder list has multiple pages | request every page before duplicate detection uses the inventory |
| `has_more = true` but no new page token | throw instead of caching incomplete inventory |
| Legacy regular-file state has no `remote` | upload once and write `remote.type = "file"` |
| Regular-file upload fails | do not write or refresh local state |
| Later unchanged regular-file state has `remote.type = "file"` and token | skip without remote API verification |

### 5. Good / Base / Bad Cases

- Good: a folder with 253 remote children is listed across two pages before same-name deletion checks run.
- Base: the first post-upgrade sync may upload many unchanged regular files because their legacy state lacks remote file tokens.
- Bad: counting a regular file as skipped when local stats match but `state[relPath].remote` is absent.

### 6. Tests Required

- Mock `listFolderItems()` with `has_more = true` and assert both pages are requested and returned.
- Mock a malformed paginated response without `next_page_token` and assert the operation fails clearly.
- Remove `remote` from an unchanged regular-file state entry and assert the next sync uploads it instead of counting it as skipped.
- Run one more unchanged sync after the repair upload and assert the file is skipped because state now contains `remote.type = "file"`.

### 7. Wrong vs Correct

#### Wrong

```ts
const response = await listFirstPage(folderToken);
folderInventoryCache.set(folderToken, response.data.files);
```

#### Correct

```ts
while (hasMore) {
  const response = await listPage(folderToken, pageToken);
  items.push(...response.files);
  pageToken = response.nextPageToken;
}
```

## Scenario: Shared Rate Limit Guard For Feishu APIs

### 1. Scope / Trigger

- Trigger: large sync runs can hit Feishu `99991400` rate limits, and a naive timestamp-only limiter is not enough once multiple upload workers queue requests concurrently.

### 2. Signatures

- [`src/sync/rate-limiter.ts`](../../../src/sync/rate-limiter.ts)
  - `acquire()`
  - `noteRateLimit(options?)`
  - `noteSuccess()`
- [`src/sync/feishu-client.ts`](../../../src/sync/feishu-client.ts)
  - `fetchWithRetry(url, init?)`
- [`src/sync/feishu-doc-client.ts`](../../../src/sync/feishu-doc-client.ts)
  - `requestApi(init, action)`
- [`src/sync/sync-coordinator.ts`](../../../src/sync/sync-coordinator.ts)
  - `executeSync(config, run)`

### 3. Contracts

- One sync run creates one shared `RateLimiter` and injects it into both Feishu clients.
- Every outbound Feishu Drive / Doc request must call `await limiter.acquire()` before hitting `requestUrl(...)`.
- `acquire()` must serialize concurrent callers; it cannot rely on each caller reading the same `lastAcquireTime` independently.
- On successful requests, clients should call `limiter.noteSuccess()` to reset consecutive rate-limit escalation.
- On rate-limit responses, clients should call `limiter.noteRateLimit({ retryAfterMs })` so later requests inherit a shared backoff window.
- Clients must call `noteRateLimit()` even when the response happens on the final retry attempt; otherwise the failed request is visible to the user but invisible to later queued requests.
- Request-level retry remains a safety net, but rate-limit pacing is owned by the shared limiter.
- `UploadManager` must not add a second whole-file retry loop around Drive or DocX operations. Once client-level retries are exhausted, the file is recorded as failed and the run continues.

### 4. Validation & Error Matrix

| Case | Expected behavior |
|------|-------------------|
| Multiple upload workers call `acquire()` at once | requests are serialized and spaced by the limiter interval |
| Feishu returns `code = 99991400` | classify as rate-limit, push shared next-available time forward |
| Feishu returns HTTP `429` with `Retry-After` | classify as rate-limit and honor the header when extending backoff |
| Feishu rate-limits on the final request attempt | record the shared limiter penalty before surfacing the file/API failure |
| Non-rate-limit API failure | keep normal retry/failure behavior; do not silently classify as rate-limit |
| A delete-then-upload chain fails after request retries | record one file failure; do not replay the whole chain |
| Later request succeeds after a rate-limit spell | limiter resets consecutive escalation |

### 5. Good / Base / Bad Cases

- Good: concurrent sync work still looks like one globally paced Feishu request stream.
- Base: request-level retries still exist after the limiter, but they no longer create synchronized retry storms.
- Bad: each worker reads the same timestamp and fires together, a final-attempt rate-limit response is not shared, or upload-manager retries replay destructive chains.

### 6. Tests Required

- Queue several concurrent `acquire()` calls and assert their release times stay spaced.
- Exercise both Drive and DocX requests in one sync run and assert they share the same pacing boundary.
- Simulate a rate-limit response and assert the next request waits for the limiter backoff window.
- Simulate a final-attempt rate-limit response and assert `noteRateLimit()` still updates the shared limiter before the error is thrown.
- Simulate a request failure after delete/upload has started and assert `UploadManager` records a failed file without replaying the whole file operation.

### 7. Wrong vs Correct

#### Wrong

```ts
const now = Date.now();
const wait = minInterval - (now - lastAcquireTime);
if (wait > 0) {
  await sleep(wait);
}
lastAcquireTime = Date.now();
```

#### Correct

```ts
const slot = queue.then(async () => {
  while (nextAvailableAt > Date.now()) {
    await sleep(nextAvailableAt - Date.now());
  }
  nextAvailableAt = Date.now() + minInterval;
});
queue = slot.catch(() => {});
await slot;
```

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
- Text elements must use the official oneof-style payload such as `{ text_run: { ... } }`; do not send a legacy `type: 'text_run'` discriminator.
- Inline rich-text styles belong under `text_run.text_element_style`, not `text_run.style`.
- Code block language remains a top-level `code.language` field on the block payload, paired with `code.wrap` and `code.elements`.
- Current runtime behavior keeps Markdown fenced code blocks as real DocX code blocks but intentionally sends `code.language = 1` (`PlainText`) for stability instead of trying to infer per-language rendering.
- Standard Markdown tables now take the nested DocX path: create `Table = 31` and `TableCell = 32` blocks through `POST /documents/:document_id/blocks/:block_id/descendant`.
- Table blocks must keep both top-level `children` and `table.cells` aligned to the ordered list of table-cell block ids.
- Table-cell blocks must carry `table_cell: {}` and at least one child block; the current runtime always creates one text child per cell, even when the Markdown cell is empty.
- Table-cell text is intentionally plain text in Phase 2 first pass; cell content does not reuse the inline rich-text parser yet.
- Invalid or unsupported table candidates must fall back to normal text-block parsing instead of sending a partial or guessed table schema.
- Block type constants must follow the current official DocX contract (`Code = 14`, `Quote = 15`, `Todo = 17`, `Divider = 22`, `Table = 31`, `TableCell = 32`)
- In-place document updates clear the root page children and recreate the Markdown-derived block list inside the same `document_id`

### 4. Validation & Error Matrix

| Case | Expected behavior |
|------|-------------------|
| Missing `docx:document` or `docx:document:write_only` scope | doc creation or block creation fails clearly |
| Document create succeeds but block append fails | surface as sync failure, do not mark upload state as successful |
| Stored `remote.token` points to a deleted doc | fall back to same-folder title recovery or fresh creation |
| Stored `remote.token` is valid | update the existing remote doc in place and keep the same doc URL |
| Markdown includes a standard table (`header + separator + rows`) | use the descendant-create path and render a real DocX table |
| Markdown includes a malformed table candidate | do not send `Table`/`TableCell`; fall back to normal text blocks |
| Non-Markdown file | stay on regular file-upload path |
| `markdownSyncMode=file` | Markdown stays on regular file-upload path |

### 5. Good / Base / Bad Cases

- Good: Markdown mode is a deliberate config choice and reuses the same coordinator and state flow.
- Base: one document client owns DocX API details.
- Bad: duplicate Markdown upload logic in UI code, direct block-payload construction inside command handlers, or primary identity rules that depend only on title instead of persisted remote document ids.

### 6. Tests Required

- Create a document with text blocks, headings, lists, and code blocks.
- Create a document whose Markdown includes bold, italic, highlight, inline code, and Obsidian wikilinks, then confirm the rendered blocks use `text_element_style`.
- Create fenced code blocks with and without language labels and confirm they still render as code blocks, even though the current runtime intentionally displays them as `PlainText`.
- Create a document whose Markdown includes a standard table and confirm the write path uses nested `Table` / `TableCell` blocks rather than plain text paragraphs.
- Include an empty Markdown table cell and confirm the generated DocX payload still gives that cell one empty text child.
- Include a malformed table candidate with pipe characters but no valid separator row and confirm it stays on the plain text path.
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
    elements: [{ text_run: { content: 'Title' } }],
  },
}
```

#### Correct

```ts
{
  block_type: 2,
  text: {
    elements: [{
      text_run: { content: 'text' },
    }],
  },
}

{
  block_type: 3,
  heading1: {
    elements: [{ text_run: { content: 'Title' } }],
  },
}

{
  block_type: 2,
  text: {
    elements: [{
      text_run: {
        content: 'Wiki',
        text_element_style: { text_color: 5, bold: true },
      },
    }],
    style: {},
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
    type: 'document' | 'file';
    token: string;
    title?: string;
    parentFolderToken?: string;
    url?: string;
  };
}
```

### 3. Contracts

- Primary identity for a Markdown document is `state[relPath].remote.token`.
- Primary skip identity for a regular Drive file is `state[relPath].remote.token` with `remote.type = "file"`.
- Update order is:
  1. try persisted `remote.token`
  2. if missing or stale, try same remote folder + same document title recovery
  3. if recovery fails, create a new document
- If `size` and `mtimeMs` still match but `remote.token` is missing, the coordinator must still send the file through upload/recovery instead of skipping it.
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
| Markdown `size` and `mtimeMs` match but `remote.token` is missing | do not skip; run recovery/create and write a fresh `remote.token` on success |
| Regular file `size` and `mtimeMs` match but `remote.token` is missing | do not skip; upload once and write `remote.type = "file"` on success |
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
