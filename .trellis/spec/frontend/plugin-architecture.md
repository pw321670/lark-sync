# Plugin Architecture

> Purpose: define the future Obsidian plugin shape that wraps the current standalone auth and sync behavior without re-implementing it in UI code.

---

## Current Repo Reality

- There is no plugin entrypoint yet.
- `auth.js` is a standalone authorization script built around a browser redirect and a temporary local HTTP server.
- `sync.js` is a standalone sync runner that owns token refresh, vault scan, Feishu folder creation, upload decisions, and local state persistence.

Those scripts are the migration baseline. The plugin should absorb them by extraction, not by hand-rewriting equivalent behavior in multiple places.

---

## Forward-Looking Target Shape

When plugin code is added, keep the architecture split below.

### 1. Obsidian Plugin Shell

Owns only Obsidian-facing concerns:

- Plugin entrypoint and lifecycle hooks such as `onload` and `onunload`
- Command registration
- Settings tab registration
- Status bar items, notices, and other user-visible surfaces
- Loading and saving plugin-local settings/state
- Launching the browser or external auth flow through an adapter

This layer is expected to be a thin coordinator, not the place where sync logic lives.

### 2. Application Services

Owns use-case orchestration:

- `connectToFeishu`
- `runVaultSync`
- `clearAuthorization`
- `getLastSyncSummary`

These services coordinate adapters, enforce single-run rules, and translate core progress into structured UI events.

### 3. Shared Sync Core

Owns behavior that should stay usable outside Obsidian if needed:

- Config validation rules derived from `config.example.json`
- OAuth request building and token exchange/refresh contracts
- Relative path normalization and exclude matching
- Recursive sync planning
- Feishu folder lookup/creation and upload strategy
- Incremental state comparison using file size and `mtimeMs`
- Final sync summary shape

The shared core should be importable without `obsidian` runtime dependencies.

### 4. Infrastructure Adapters

Wrap environment-specific details behind interfaces:

- Vault file enumeration and file reads
- Browser open / external link handling
- Temporary callback server for loopback OAuth
- Feishu HTTP client
- Token storage and sync-state storage
- Time, logging, and progress emission

---

## Lifecycle Rules

### `onload`

- Load plugin settings and persisted sync state.
- Create service instances once.
- Register commands and settings UI.
- Register passive UI such as a status bar item only if it reflects real runtime state.
- Do not start authorization or sync automatically on startup.

### Command Execution

- Validate required settings before side effects.
- Refuse concurrent sync runs.
- If authorization is missing, route through the auth flow instead of attempting a broken sync.
- Emit structured progress updates for the UI; do not rely on raw `console.log` output as the primary UX.

### Temporary Auth Lifecycle

- Start the local callback listener only for the auth session.
- Close it after success, timeout, or user cancellation.
- Never keep a localhost server running for the lifetime of the plugin.

### `onunload`

- Tear down transient listeners or status UI.
- Ensure no orphaned auth server remains.
- Leave persisted settings/state in a readable, migration-safe format.

---

## Extraction Plan From The Standalone Scripts

Extract behavior from the current scripts into reusable services before building rich UI around it.

### Extract from `auth.js`

- Config read/write assumptions around `appId`, `appSecret`, `redirectUri`, `userAccessToken`, and `refreshToken`
- OAuth scope list
- Authorization URL building
- Token exchange logic
- Callback-path validation

### Extract from `sync.js`

- `normalizeRelPath`
- Exclude matching semantics
- Recursive walk behavior
- Refresh-token flow
- Feishu folder listing and ensure-folder behavior
- Same-name delete-before-upload behavior
- Large-file skip threshold behavior
- Incremental state rules keyed by normalized relative path

### Keep Out of the Shared Core

- `Notice`, status bar, modal, and command palette code
- Direct reads or writes of repo-root `config.json` and `state.json`
- Plugin lifecycle bookkeeping
- Obsidian API objects such as `Plugin`, `Vault`, and `Workspace`

---

## Recommended File Ownership

This is a forward-looking structure, not a claim that these files already exist:

```text
plugin entrypoint
  -> registers commands/settings/status
  -> calls application services

application services
  -> call shared sync core
  -> depend on adapters for storage, browser, filesystem, and Feishu HTTP

shared sync core
  -> contains migration-critical logic extracted from auth.js and sync.js
  -> emits structured progress and result objects
```

If a new plugin file needs both Obsidian APIs and Feishu sync logic, split it until each part has a single owner.

---

## Forbidden Patterns

- Rewriting sync behavior separately in each command handler
- Mixing `obsidian` imports into the extracted sync core
- Reading repo-root `config.json` directly from the future plugin at runtime
- Treating the plugin settings tab as the source of business logic
- Starting long-running sync from `onload`
