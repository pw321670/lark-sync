# Auth And Token Lifecycle

This document defines the current credential and token contract across `auth.js`, `sync.js`, and `config.example.json`. Any future plugin extraction must preserve this lifecycle or provide an explicit compatibility layer.

## Source Anchors

- [`config.example.json`](../../../config.example.json): declares `appId`, `appSecret`, `redirectUri`, `userAccessToken`, and `refreshToken`.
- [`auth.js`](../../../auth.js): performs the initial OAuth code exchange and writes tokens into `config.json`.
- [`sync.js`](../../../sync.js): refreshes the token at sync start and writes the rotated token pair back into `config.json`.
- [`.gitignore`](../../../.gitignore): keeps `config.json` out of version control.

## Stable Config Contract

| Field | Used by | Meaning |
|-------|---------|---------|
| `appId` | `auth.js`, `sync.js` | Feishu app identifier used for both authorization-code and refresh-token exchange |
| `appSecret` | `auth.js`, `sync.js` | Feishu app secret; local secret, never committed |
| `redirectUri` | `auth.js` | Full callback URL used to derive the local server port and validate callback path |
| `userAccessToken` | `auth.js`, `sync.js` | Cached access token written after auth or refresh; not trusted as durable input |
| `refreshToken` | `auth.js`, `sync.js` | Durable credential used to mint fresh access tokens before every sync run |

`config.example.json` is the public contract. Future settings UIs may change storage format, but they must still supply the same semantic fields to the backend core.

## Initial OAuth Flow

`auth.js main()` performs the current bootstrap sequence:

1. Read `config.json`.
2. Parse `redirectUri` with `new URL()` and derive the local callback port from it.
3. Build the Feishu authorization URL with the current scope set:
   - `offline_access`
   - `drive:drive`
   - `drive:drive:readonly`
   - `space:document:retrieve`
4. Start an `http.createServer()` listener on `127.0.0.1`.
5. Accept only requests whose path matches the configured callback path.
6. Require the `code` query parameter.
7. Exchange the code through `getUserAccessToken()` against `https://open.feishu.cn/open-apis/authen/v2/oauth/token`.
8. Read tokens from either `data.access_token` / `data.refresh_token` or the top-level fallback fields.
9. Write `userAccessToken` and `refreshToken` into `config.json`.

## Refresh Flow Before Sync

`sync.js main()` treats the refresh token as the real session bootstrap credential:

1. Read `config.json`.
2. Fail fast if `refreshToken` is missing.
3. Call `refreshUserAccessToken()` with `grant_type=refresh_token`.
4. Accept both nested and top-level token fields in the Feishu response.
5. Overwrite `config.userAccessToken` and `config.refreshToken`.
6. Persist `config.json` before any folder listing or file upload occurs.

Current rule: every sync run refreshes first. Do not build new behavior that depends on a previously cached access token remaining valid.

## Secret Handling Boundaries

- `config.example.json` must stay secret-free.
- `config.json` must stay local-only and gitignored.
- `appSecret`, `userAccessToken`, and `refreshToken` are backend secrets, not UI state.
- The reusable sync core should accept credentials as data and return refreshed credentials as data. It should not decide where those secrets are stored.

## Current Prototype Risks To Preserve Or Remove Deliberately

- `auth.js` currently logs the full `tokenData` payload for debugging before persisting tokens.
- `auth.js` currently calls `saveJson(CONFIG_PATH, config)` twice in succession.
- `sync.js` returns the raw refresh response in `refreshUserAccessToken().raw`, even though the current caller only uses normalized tokens.

These are current facts, not desired long-term behavior. Do not carry them into a reusable core unless there is a specific reason.

## Failure Contract

| Condition | Current behavior |
|-----------|------------------|
| OAuth exchange returns `code !== 0` | Throw `Error` and fail the auth run |
| Refresh exchange returns `code !== 0` | Throw `Error` and fail the sync run before any Drive calls |
| Token response lacks `access_token` | Throw `Error` even if the HTTP request succeeded |
| Callback request uses the wrong path | Return HTTP 404 |
| Callback request omits `code` | Return HTTP 400 |

The current runtime is fail-fast. New abstractions may wrap errors, but they must not silently continue with missing or partial credentials.

## Migration Rules

- Keep browser launch and callback hosting outside the reusable core.
- Preserve the ability to derive the callback port from the configured `redirectUri`.
- Preserve refresh-token rotation semantics. If Feishu returns a new refresh token, it becomes the new source of truth immediately.
- If token storage moves away from `config.json`, define the persistence boundary explicitly and keep a migration path for existing users.

## Manual Verification

- Run `node auth.js` with valid local config and confirm that `config.json` gains both `userAccessToken` and `refreshToken`.
- Re-run `node sync.js` and confirm that `config.json` is updated again with a fresh token pair before sync proceeds.
- Verify that the callback listener only accepts the configured path and rejects missing `code`.
- Verify that no committed file ever contains live values for `appSecret`, `userAccessToken`, or `refreshToken`.
