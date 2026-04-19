# Module Boundaries

The backend no longer needs to preserve a removed standalone script layer. The current job is to keep the plugin runtime modules in `src/` clean, thin, and single-purpose.

## Source Anchors

- [`src/main.ts`](../../../src/main.ts): plugin shell and runtime orchestration boundary
- [`src/oauth/feishu-oauth.ts`](../../../src/oauth/feishu-oauth.ts): authorization-code flow and callback server
- [`src/oauth/token-manager.ts`](../../../src/oauth/token-manager.ts): token refresh and single-flight guard
- [`src/oauth/auth-storage.ts`](../../../src/oauth/auth-storage.ts): storage adapter for auth state
- [`src/sync/sync-coordinator.ts`](../../../src/sync/sync-coordinator.ts): sync orchestration
- [`src/sync/upload-manager.ts`](../../../src/sync/upload-manager.ts): upload retries, duplicate-name deletion, and concurrency
- [`src/sync/feishu-client.ts`](../../../src/sync/feishu-client.ts): Drive API boundary
- [`src/sync/feishu-doc-client.ts`](../../../src/sync/feishu-doc-client.ts): DocX API boundary
- [`src/sync/state-tracker.ts`](../../../src/sync/state-tracker.ts): sync-state contract

## Current Split

| Module area | Responsibility |
|-------------|----------------|
| `src/main.ts` | plugin lifecycle, settings persistence, command wiring, auth gating, sync gating |
| `src/oauth/*` | auth URL building, callback server lifecycle, code exchange, refresh-token lifecycle |
| `src/sync/sync-coordinator.ts` | scan, filter, change detection, folder-map creation, final sync result |
| `src/sync/upload-manager.ts` | concurrent upload scheduling, retry loop, file-vs-document branch |
| `src/sync/feishu-client.ts` | raw Feishu Drive requests and response shaping |
| `src/sync/feishu-doc-client.ts` | raw Feishu DocX requests and payload shaping |
| `src/sync/state-tracker.ts` | state schema, load/save boundary, update timing |
| `src/utils/*` | config defaults, validation, preview logic, and small shared helpers |

## Boundary Rules

- Keep host-specific side effects out of reusable sync modules.
  - `obsidian` imports, notices, ribbon wiring, and command registration stay in the plugin shell and UI modules.
  - The sync layer should receive vault reads, config, and auth as injected data.
- Keep path normalization centralized.
  - Include/exclude matching, state keys, and parent-folder lookup must all use the same normalized path representation.
- Keep Feishu API shapes behind client boundaries.
  - The coordinator should not depend on raw Feishu response envelopes or endpoint details.
- Keep storage boundaries explicit.
  - OAuth code should not decide how plugin data is serialized.
  - Sync-state code should not leak into settings editing.

## Simplification Rules

- Do not add a wrapper class when a direct callback is enough.
- Do not keep speculative modules in `src/` "for later" if they are not on the live execution path.
- Do not duplicate sync behavior in command handlers, settings actions, and UI helpers.
- Do not keep a second implementation alive after extraction or cleanup.

## Recommended Direction

When refactoring backend code:

1. Preserve one live runtime path from `src/main.ts` into `src/oauth/*` and `src/sync/*`.
2. Remove duplicate or wrapper-only modules before adding new abstractions.
3. Promote a boundary into an explicit interface only when there is a real second implementation or a real shared contract.

## Regression Checks For Boundary Work

- `npm run build` must still pass after any cleanup.
- Sync start must still:
  - validate config,
  - validate or refresh token,
  - scan files with normalized vault-relative paths,
  - create missing folders before uploading,
  - delete same-name remote files before re-upload,
  - persist current sync summary and runtime state.
- Search imports and confirm removed abstractions no longer remain in the live path.

## Boundary Decision: Remote Identity Recovery Stays In Upload Layer

**Context**: true incremental doc sync needed both persisted remote identity and a recovery fallback when the stored remote doc disappears.

**Decision**:

- `SyncCoordinator` owns local scan/filter/change-detection and final state persistence.
- `UploadManager` owns document-vs-file branching and recovery order:
  - persisted `docId`
  - same-folder title recovery
  - fresh create
- `FeishuDocClient` owns DocX endpoint orchestration and typed DocX error shaping.

**Why**:

- Recovery depends on both local state and remote API behavior; it is too remote-aware for the coordinator, but too policy-heavy for the raw DocX client.
- Keeping this in `UploadManager` prevents title-recovery rules from leaking into UI code, settings actions, or the coordinator.

**Example**:

```ts
const uploadResult = await uploadManager.uploadFiles(
  changedFiles,
  folderMap,
  previousStates,
  options,
);
```

`UploadManager` may call either:

```ts
await feishuDocClient.updateDocument(previousToken, markdownText);
```

or:

```ts
const recoveredToken = await recoverExistingDocumentToken(parentFolderToken, docTitle);
```

but `SyncCoordinator` should not reimplement that branching itself.

## Scenario: Active Module Set After Cleanup

### 1. Scope / Trigger

- Trigger: the plugin-side sync implementation had grown duplicate scanner, worker, progress, and alternate API layers that were not on the live execution path.

### 2. Signatures

- Active modules:
  - `src/sync/obsidian-adapter.ts`
  - `src/sync/sync-coordinator.ts`
  - `src/sync/upload-manager.ts`
  - `src/sync/feishu-client.ts`
  - `src/sync/feishu-doc-client.ts`
  - `src/sync/state-tracker.ts`

### 3. Contracts

- One runtime path should exist for vault scan, upload orchestration, and result reporting.
- Experimental or future-facing modules must not remain under `src/` if they are not wired into the current plugin.

### 4. Validation & Error Matrix

| Case | Expected behavior |
|------|-------------------|
| A module is not imported from the live entry path | delete it or move it out of the runtime tree |
| UI helper duplicates another runtime surface | keep the active one and remove the duplicate |
| A new abstraction layer only wraps a single call with no new contract | inline or remove it |

### 5. Good / Base / Bad Cases

- Good: one thin sync stack with clear ownership.
- Base: helper modules exist only when they hold a distinct contract.
- Bad: keep speculative modules in `src/` "for later" while they continue to bloat the current codebase.

### 6. Tests Required

- `npm run build` after deletion of unused modules.
- Verify active imports no longer reference removed files.
- Verify ribbon sync, settings, and end-to-end sync still build from the reduced tree.

### 7. Wrong vs Correct

#### Wrong

- keep multiple scanner/filter/worker implementations in the active source tree when only one path is executed

#### Correct

- reduce the runtime tree to the modules that are actually reachable from `src/main.ts`
