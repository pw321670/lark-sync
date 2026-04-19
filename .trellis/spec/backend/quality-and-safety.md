# Quality And Safety

This project is a small, direct Node.js prototype. The quality bar today is correctness of the local sync flow, explicit documentation of known limits, and safe handling of secrets and local state while the codebase is still script-based.

## Source Anchors

- [`README.md`](../../../README.md): direct Node.js 18+ execution model
- [`auth.js`](../../../auth.js): auth logging, callback lifecycle, top-level fail-fast exit
- [`sync.js`](../../../sync.js): sync logging, fail-fast errors, sequential remote operations
- [`config.example.json`](../../../config.example.json): stable runtime contract
- [`.gitignore`](../../../.gitignore): local-only sensitive/runtime files

## Current Quality Profile

- There is no package manager metadata, build system, lint command, typecheck command, or automated test suite in the repo today.
- The runtime is synchronous for local file I/O and sequential for remote operations.
- Errors are surfaced as thrown `Error` objects and handled by a top-level `.catch(...)` that logs and exits.
- Manual verification is the main release gate right now.

## Logging Expectations

Keep logs useful for an operator running `node auth.js` or `node sync.js` locally:

- log major phases, counts, folder names, relative file paths, and retry attempts
- log enough context to locate the failing folder or file
- do not log `appSecret`, `userAccessToken`, or `refreshToken`

Known prototype debt:

- `auth.js` currently logs the raw OAuth token payload before writing `config.json`
- `sync.js` logs remote folder and file tokens during some operations
- `createFolder()` logs raw response bodies for debugging

Those logs describe current behavior, but they should be treated as temporary debugging output, not a standard to preserve in extracted core modules.

## Failure Handling Rules

- Fail fast on malformed or missing local config/state JSON.
- Fail fast on Feishu responses whose `code` is not `0`.
- Fail fast when required local prerequisites are missing, such as `refreshToken` or a parent folder token.
- Do not silently continue after a failed delete or upload. Partial remote changes are preferable to pretending a sync succeeded.

## Safety Boundaries

- `config.example.json` is safe to commit; `config.json` is not.
- `state.json` is disposable runtime state and must stay local-only.
- The reusable sync core must not call `process.exit()` directly. Exit behavior belongs in the CLI layer.
- Browser launch, callback hosting, filesystem paths, and raw Node globals are adapter concerns, not long-term core concerns.

## Migration Constraints

- Preserve the meaning of the current config keys or add a documented compatibility layer.
- Preserve normalized relative-path behavior and `state.json` semantics unless a migration plan is documented.
- Do not assume Node.js 18 globals will exist inside an Obsidian plugin host. Abstract transport and binary upload dependencies behind interfaces.
- When moving code into reusable modules, remove prototype-only debug logging instead of duplicating it.

## Manual Regression Checklist

- Copy `config.example.json` to `config.json`, fill valid values, and confirm no secrets are ever written back into tracked files.
- Run `node auth.js` and confirm the browser flow completes, the callback path is enforced, and `config.json` gains token values.
- Run `node sync.js` against a small vault and confirm folder creation happens before uploads.
- Re-run `node sync.js` without edits and confirm unchanged files are skipped via `state.json`.
- Modify an existing file and confirm it is deleted remotely, re-uploaded, and updated in `state.json`.
- Add an excluded path and confirm it never reaches the remote target.
- Add a file above `maxDirectUploadMB` and confirm the run continues while that file is skipped.

## Known Gaps To Revisit Deliberately

- no automated linting, typing, or tests
- no pagination handling for folder listing beyond `page_size=200`
- no retry logic for upload or delete operations
- no reconciliation for local deletions
- no incremental checkpoint write during a long sync run
- duplicate `saveJson()` call in `auth.js`
