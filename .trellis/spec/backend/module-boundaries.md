# Module Boundaries

This project is still a two-script prototype, but the backend logic already falls into stable domains. Future extraction work should turn those domains into reusable modules while keeping `auth.js` and `sync.js` as thin runtime adapters.

## Source Anchors

- `auth.js`
  - `readJson()` / `saveJson()`: local JSON file access for `config.json`
  - `openBrowser()`: platform-specific browser launch
  - `getUserAccessToken()`: OAuth code exchange against Feishu
  - `main()`: callback server setup, scope construction, token persistence
- `sync.js`
  - `readJson()` / `saveJson()`: local JSON file access for `config.json` and `state.json`
  - `normalizeRelPath()`, `shouldExclude()`, `walkDir()`: vault traversal and path filtering
  - `refreshUserAccessToken()`: refresh-token exchange
  - `listFolderItems()`, `createFolder()`, `ensureFolder()`: folder discovery and creation
  - `uploadSmallFile()`, `findExistingFilesInFolder()`, `deleteFileByToken()`: file reconciliation and upload
  - `main()`: end-to-end orchestration

## Target Split

| Future module | Current anchors | Responsibility |
|---------------|-----------------|----------------|
| `cli/auth` | `auth.js main()`, `openBrowser()` | Browser launch, local callback server, terminal logging, process exit behavior |
| `cli/sync` | `sync.js main()` | Load local config/state, call sync core, print progress, exit non-zero on failure |
| `core/config-store` | duplicated `readJson()` / `saveJson()` in both scripts | Read and write `config.json` and `state.json` with a single implementation |
| `core/auth-client` | `getUserAccessToken()`, `refreshUserAccessToken()` | Talk to Feishu OAuth endpoints and normalize token payloads |
| `core/vault-scan` | `normalizeRelPath()`, `shouldExclude()`, `walkDir()` | Produce normalized, exclude-aware vault entries from a filesystem adapter |
| `core/state-store` | `STATE_PATH` read/write and `state[relPath]` updates | Manage the `state.json` schema and persistence timing |
| `core/drive-client` | `listFolderItems()`, `createFolder()`, `uploadSmallFile()`, `deleteFileByToken()` | Own raw Feishu Drive HTTP calls and response shaping |
| `core/sync-engine` | `ensureFolder()`, file loop in `sync.js main()` | Coordinate folder creation, change detection, delete-and-reupload behavior, and counters |

## Boundary Rules

- Keep host-specific side effects out of the reusable core.
  - `http.createServer`, `child_process.exec`, `process.exit`, and direct console UX belong in CLI adapters.
  - The reusable core should accept injected dependencies for filesystem access, HTTP transport, time, and logging.
- Keep path normalization centralized.
  - `normalizeRelPath()` is a core contract, not a UI detail.
  - Exclude matching, state keys, and parent-folder lookup must all use the same normalized path representation.
- Keep Feishu API shapes behind a client boundary.
  - The sync engine should not depend on raw Feishu response envelopes or `data.code` checks.
  - `listFolderItems()` already hints at this boundary by mapping remote items to `{ type, name, token, raw }`.
- Keep config compatibility explicit.
  - `config.example.json` is the compatibility baseline for future plugin settings.
  - If a plugin stores settings differently, add a mapping layer instead of changing core semantics silently.

## Migration Constraints

- Do not copy-paste `readJson()` / `saveJson()` into new modules again. The current duplication in `auth.js` and `sync.js` is prototype debt, not a pattern to preserve.
- Do not move `openBrowser()` or callback-server code into the sync core. Those behaviors depend on the current Node.js process model and will not map cleanly into an Obsidian plugin host.
- Do not let the sync core depend on `__dirname`, `CONFIG_PATH`, or `STATE_PATH`. Those paths should be chosen by the caller.
- Do not mix Drive API concerns with vault traversal. `walkDir()` should stay usable without any Feishu knowledge.

## Recommended Extraction Order

1. Extract shared JSON storage and path utilities without changing behavior.
2. Extract Feishu auth and Drive HTTP clients as data-only modules.
3. Extract the sync engine that consumes normalized vault entries, config values, and client interfaces.
4. Keep `auth.js` and `sync.js` as wrappers until the plugin host can replace them cleanly.

## Regression Checks For Boundary Work

- Running `node auth.js` must still update `config.json` with `userAccessToken` and `refreshToken`.
- Running `node sync.js` must still:
  - refresh the access token before Drive calls,
  - scan the vault with `/`-normalized relative paths,
  - create missing folders before uploading files,
  - delete same-name remote files before re-upload,
  - persist `state.json` with the same per-path fields.
