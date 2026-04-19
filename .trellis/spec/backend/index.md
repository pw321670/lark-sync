# Backend Spec: Sync Core And Feishu Integration

This backend layer documents the current plugin runtime that scans an Obsidian vault and syncs selected files into Feishu Drive or Feishu Docs.

## Current Runtime Snapshot

- Current source of truth:
  - [`src/oauth`](../../../src/oauth): Feishu OAuth flow, token exchange, token refresh, and auth storage.
  - [`src/sync`](../../../src/sync): vault scanning, state tracking, folder creation, upload orchestration, and Feishu API clients.
  - [`src/main.ts`](../../../src/main.ts): plugin shell that validates config, refreshes access tokens before sync, and starts the coordinator.
  - [`config/config.example.json`](../../../config/config.example.json): compatibility baseline for user-visible settings concepts.
- Runtime assumptions:
  - The live sync runtime is the Obsidian desktop plugin, not a standalone Node script.
  - Vault access comes from Obsidian APIs injected into the sync layer.
  - Config and auth live in plugin data.
  - Incremental file state is handled by `StateTracker` and currently persists through plugin data across reloads.
  - In document mode, sync state now persists the last known remote `docId` per normalized `relPath`.
  - Markdown document updates reuse the stored remote document when possible and only fall back to same-folder title recovery or fresh creation when the stored remote document is gone.

## Guides

| Guide | Purpose |
|-------|---------|
| [Module Boundaries](./module-boundaries.md) | Keep current `src/` ownership clean and avoid speculative layers. |
| [Auth And Token Lifecycle](./auth-and-token-lifecycle.md) | Preserve the OAuth, refresh-token, and secret-handling contract. |
| [Filesystem And State](./filesystem-and-state.md) | Preserve vault scanning, path normalization, include/exclude semantics, and incremental state behavior. |
| [Feishu Drive Sync](./feishu-drive-sync.md) | Preserve folder discovery, file/doc upload behavior, and Feishu API assumptions. |
| [Quality And Safety](./quality-and-safety.md) | Capture current logging, failure, and manual verification rules. |

## Pre-Development Checklist

- Always read [Quality And Safety](./quality-and-safety.md).
- If you will touch OAuth, refresh tokens, secret storage, or callback handling, read [Auth And Token Lifecycle](./auth-and-token-lifecycle.md).
- If you will touch vault scanning, relative paths, filters, or sync state, read [Filesystem And State](./filesystem-and-state.md).
- If you will touch Feishu folder discovery, upload, delete, doc creation, or retry logic, read [Feishu Drive Sync](./feishu-drive-sync.md).
- If the change spans config, filesystem, and remote API behavior together, also read [`../guides/cross-layer-thinking-guide.md`](../guides/cross-layer-thinking-guide.md).
- If you are simplifying or extracting code, also read [`../guides/code-reuse-thinking-guide.md`](../guides/code-reuse-thinking-guide.md).

## Scope Rules

- Document the current plugin runtime first. Do not keep describing removed standalone behavior as an extra baseline.
- Preserve the semantic meaning of the current config fields unless a compatibility layer is documented.
- Preserve normalized relative-path behavior across Windows and POSIX environments.
- Treat Feishu auth, Drive, and Doc APIs as external boundaries. Contract changes belong in this backend spec.

## When To Update This Directory

Update these docs whenever any of the following changes:

- `config/config.example.json` field meanings or default expectations.
- OAuth scopes, callback handling, token storage, or refresh semantics.
- Path normalization, include/exclude matching, or incremental state semantics.
- Feishu API endpoints, retry behavior, pagination handling, upload strategy, or document-mode behavior.
