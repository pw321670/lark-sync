# Feishu Rate Limit Stabilization

## Goal

Reduce large-sync failures caused by Feishu `99991400` / HTTP `429` without making the sync runtime unnecessarily slow or hard to reason about.

## Problem

The previous direction helped, but it grew too many layers:

- a shared request limiter
- request-level retry
- whole-file retry
- batch cooldowns even when Feishu did not rate-limit
- document/file lanes
- status-bar batch wording

The important parts are the shared limiter, request-level backoff, reduced remote `list` traffic, and clear progress. Whole-file replay and unconditional batch sleeps add complexity and can increase remote side effects.

## Goals

- Keep one shared, concurrency-safe Feishu request limiter per sync run.
- Feed all `99991400`, HTTP `429`, `Retry-After`, and `x-ogw-ratelimit-reset` signals back into that limiter.
- Keep Markdown document uploads serial because each document update is a multi-request DocX chain.
- Keep regular-file concurrency configurable through the existing setting.
- Use batches for progress and for rate-limit degradation, not as unconditional delays.
- Avoid replaying a full file upload after a partial remote failure.
- Cache remote folder inventory for the current sync run to reduce repeated `list` calls.
- Keep the status bar clear about upload progress and real rate-limit cooldowns.

## Non-goals

- Do not add a user-facing rate-limit tuning panel.
- Do not persist folder inventory across plugin restarts.
- Do not try to maximize throughput.
- Do not introduce a second retry policy outside the Feishu clients.
- Do not replay whole document updates after a partial DocX mutation failure.

## External Constraints

Official Feishu docs establish these relevant constraints:

- DocX block write APIs are limited to roughly `3 req/s` per app and also have single-document edit limits.
- Drive upload and create-folder APIs have higher limits, around `5 QPS`.
- Feishu can report rate limiting through HTTP `429`, business code `99991400`, `Retry-After`, or `x-ogw-ratelimit-reset`.

References:

- https://open.feishu.cn/document/server-docs/api-call-guide/frequency-control
- https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document-block/create
- https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/upload_all
- https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/create_folder

## Final Strategy

### Shared Request Limiter

- One `RateLimiter` is created per sync run.
- Both `FeishuClient` and `FeishuDocClient` must use it.
- Every outbound Feishu request calls `acquire()` before `requestUrl()`.
- Every observed rate-limit response calls `noteRateLimit()`, even if that response happens on the final retry attempt.

### Retry Ownership

- Feishu clients own request-level retry and backoff.
- `UploadManager` does not replay the whole file upload chain after failure.
- If a file-level operation fails after the client exhausts request retries, the file is recorded as failed and sync continues.

This avoids repeating destructive or partially completed chains such as delete-then-upload or delete-doc-blocks-then-create-blocks.

### Execution Lanes

- Markdown online documents run through the document lane.
- Document lane concurrency is always `1`.
- Regular files run through the file lane.
- Regular-file concurrency follows the existing `concurrentUploads` setting.
- Document lane runs before the regular-file lane in the first implementation.

### Batches

- Document batch size: `10`.
- Regular-file batch size: `25`.
- Normal batches do not wait by default.
- Batch boundaries remain useful for progress reporting and for switching to degraded mode after a real rate-limit signal.

### Adaptive Cooldown

When Feishu rate-limits a batch:

- Honor `x-ogw-ratelimit-reset` or `Retry-After` when present.
- Otherwise use the limiter's penalty window.
- Degrade the next document batch to a `30s` cooldown.
- Degrade the next regular-file batch to concurrency `1` and a `15s` cooldown.
- Status bar must show `rate limited, retry in Ns`.

### Remote Folder Inventory Cache

- Cache scope is one sync run only.
- Cache key is Feishu `folderToken`.
- `listFolderItems()` reads from cache after the first fetch.
- Folder creation, file upload, document creation/update, and delete operations update the cache when possible.
- Same-folder document recovery skips obvious regular-file matches before probing DocX metadata.

## UX Requirements

The status bar should show:

- current lane: `docs` or `files`
- batch number where available
- processed/total file count
- uploaded/skipped/failed counts
- `rate limited, retry in Ns` only for real rate-limit cooldowns

Normal batch transitions should not imply an error or retry.

## Acceptance Criteria

- [x] Large syncs no longer replay full file/document operations after request retries are exhausted.
- [x] Normal batch boundaries do not add fixed waiting time.
- [x] `99991400` / HTTP `429` feed back into the shared limiter even on the last retry attempt.
- [x] Folder creation uses the same request retry and rate-limit feedback path as other Drive requests.
- [x] Markdown document uploads remain serial.
- [x] Regular-file concurrency respects `concurrentUploads`.
- [x] Same-folder document recovery avoids DocX probes for regular Drive files.
- [x] Status bar distinguishes normal progress from real rate-limit cooldown.
- [x] Build passes.

## Manual Verification

- Run a sync against a large vault and confirm normal batches advance without `next batch` waits.
- Force or observe a `99991400` / `429` and confirm the status bar says `rate limited, retry in Ns`.
- Confirm regular-file concurrency setting still affects regular uploads.
- Confirm Markdown files still sync as online documents in document mode.
- Confirm a failed file is reported as failed instead of replaying a whole upload chain multiple times.

## Remaining Follow-ups

- Resolved by `.trellis/tasks/04-24-sync-completeness-pagination`: `listFolderItems()` now paginates folder inventory beyond the first 200 items.
- Resolved by `.trellis/tasks/04-24-sync-completeness-pagination`: successful regular-file uploads now persist `remote.type = "file"` and the returned Drive file token.
- Still deferred: expose advanced rate-limit parameters only if real users need them after this simpler strategy ships.

## Implementation Result

- `SyncCoordinator` keeps separate document/file lanes, runs Markdown online document uploads serially, and lets regular-file concurrency follow `concurrentUploads`.
- Normal batch cooldowns are `0`; cooldown UI is reserved for real observed rate-limit feedback.
- `FeishuClient` and `FeishuDocClient` share one per-run `RateLimiter` and feed final-attempt rate-limit responses back into it.
- `UploadManager` no longer owns a whole-file retry loop, so delete/upload and DocX mutation chains are not replayed after request retries are exhausted.
- Folder creation uses the same `fetchWithRetry()` path as other Drive requests.
- Build passed after this PRD was aligned with the current implementation.
