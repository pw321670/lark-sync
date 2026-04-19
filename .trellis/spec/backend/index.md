# Backend Spec: Sync Core And Feishu Integration

This backend layer documents the current standalone Node.js runtime that syncs an Obsidian vault into Feishu Drive, plus the constraints for extracting that runtime into a reusable sync core for an Obsidian plugin.

## Current Runtime Snapshot

- Legacy anchors:
  - [`legacy/auth.js`](../../../legacy/auth.js): local OAuth callback server, browser launch, token exchange, JSON config persistence.
  - [`legacy/sync.js`](../../../legacy/sync.js): token refresh, recursive vault scan, exclude matching, folder creation, delete-and-reupload sync, `state.json` persistence.
- Current plugin-side extraction:
  - [`src/oauth`](../../../src/oauth): Feishu OAuth flow, token refresh orchestration, plugin-backed auth storage.
  - [`src/sync`](../../../src/sync): Obsidian vault adapter, sync coordinator, upload manager, and Feishu Drive client.
  - [`src/main.ts`](../../../src/main.ts): the plugin shell that validates config, refreshes access tokens before sync, and starts the coordinator.
  - [`config/config.example.json`](../../../config/config.example.json): compatibility baseline for required settings concepts.
- Runtime assumptions:
  - The project now has an Obsidian plugin build (`package.json`, `build/esbuild.config.mjs`, `build/tsconfig.json`).
  - The live sync runtime is desktop-first and uses Obsidian APIs for vault access.
  - The plugin still carries some prototype-era behavior, especially around sync-state persistence, which remains intentionally simpler than the legacy standalone `state.json` flow.

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
