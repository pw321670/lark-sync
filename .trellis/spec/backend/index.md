# Backend Spec: Sync Core And Feishu Integration

This backend layer documents the current standalone Node.js runtime that syncs an Obsidian vault into Feishu Drive, plus the constraints for extracting that runtime into a reusable sync core for an Obsidian plugin.

## Current Runtime Snapshot

- Source anchors:
  - [`auth.js`](../../../auth.js): local OAuth callback server, browser launch, token exchange, `config.json` persistence.
  - [`sync.js`](../../../sync.js): token refresh, recursive vault scan, exclude matching, folder creation, delete-and-reupload sync, `state.json` persistence.
  - [`config.example.json`](../../../config.example.json): stable configuration contract that future settings UIs must preserve or map explicitly.
  - [`README.md`](../../../README.md): direct `node auth.js` and `node sync.js` execution model on Node.js 18+.
  - [`.gitignore`](../../../.gitignore): `config.json` and `state.json` are local-only runtime files.
- Runtime assumptions:
  - There is no `package.json`, build system, or framework bootstrap in the repository root today.
  - The scripts rely on Node.js 18+ globals such as `fetch`, `Blob`, and `FormData`.
  - State is file-based and mutable: `config.json` stores credentials and runtime settings; `state.json` stores per-file incremental sync state.
  - The current backend is fail-fast and imperative rather than modular or service-oriented.

## Guides

| Guide | Purpose |
|-------|---------|
| [Module Boundaries](./module-boundaries.md) | Split the prototype scripts into reusable sync-core modules without changing behavior by accident. |
| [Auth And Token Lifecycle](./auth-and-token-lifecycle.md) | Preserve the OAuth, refresh-token, and config-persistence contract. |
| [Filesystem And State](./filesystem-and-state.md) | Preserve vault scanning, path normalization, exclude semantics, and `state.json` behavior. |
| [Feishu Drive Sync](./feishu-drive-sync.md) | Preserve folder discovery, delete-and-reupload behavior, and API assumptions. |
| [Quality And Safety](./quality-and-safety.md) | Capture current logging, failure, migration, and manual verification rules. |

## Pre-Development Checklist

- Always read [Quality And Safety](./quality-and-safety.md).
- If you will move logic out of `auth.js` or `sync.js`, read [Module Boundaries](./module-boundaries.md).
- If you will touch OAuth, refresh tokens, `config.json`, or secret handling, read [Auth And Token Lifecycle](./auth-and-token-lifecycle.md).
- If you will touch vault scanning, relative paths, excludes, or `state.json`, read [Filesystem And State](./filesystem-and-state.md).
- If you will touch Feishu folder discovery, file listing, upload, delete, or retry logic, read [Feishu Drive Sync](./feishu-drive-sync.md).
- If the change spans config, filesystem, and remote API behavior together, also read [`../guides/cross-layer-thinking-guide.md`](../guides/cross-layer-thinking-guide.md).
- If you are extracting shared helpers from duplicated script code, also read [`../guides/code-reuse-thinking-guide.md`](../guides/code-reuse-thinking-guide.md).

## Scope Rules

- Document the current runtime first. Do not describe an ideal architecture without anchoring it to the existing scripts.
- Preserve the `config.example.json` field contract unless a compatibility layer is documented.
- Preserve normalized relative path behavior across Windows and POSIX environments.
- Treat Feishu auth and Drive APIs as external boundaries. Contract changes belong in this backend spec.

## When To Update This Directory

Update these docs whenever any of the following changes:

- `config.example.json` field names, meanings, or default expectations.
- `auth.js` OAuth scopes, callback handling, or token persistence behavior.
- `sync.js` path normalization, exclude matching, `state.json` schema, or sync ordering.
- Feishu API endpoints, retry behavior, pagination handling, or upload strategy.
