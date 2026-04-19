# Auth And Token Lifecycle

This document defines the current credential and token contract across the plugin runtime in `src/oauth/`, `src/main.ts`, and `config/config.example.json`.

## Source Anchors

- [`config/config.example.json`](../../../config/config.example.json): compatibility baseline for `appId`, `appSecret`, `redirectUri`, `userAccessToken`, and `refreshToken`.
- [`src/oauth/feishu-oauth.ts`](../../../src/oauth/feishu-oauth.ts): current OAuth authorization-code flow, loopback callback server, and auth URL construction.
- [`src/oauth/token-manager.ts`](../../../src/oauth/token-manager.ts): token refresh orchestration and persistence of rotated tokens.
- [`src/oauth/auth-storage.ts`](../../../src/oauth/auth-storage.ts): storage boundary between OAuth code and plugin data.
- [`src/main.ts`](../../../src/main.ts): plugin-level config validation, OAuth rebinding, and sync gating.

## Stable Config Contract

| Field | Used by | Meaning |
|-------|---------|---------|
| `appId` | plugin OAuth layer | Feishu app identifier for both authorization-code and refresh-token exchange |
| `appSecret` | plugin OAuth layer | Feishu app secret; local secret, never committed |
| `redirectUri` | plugin OAuth layer | Full callback URL used to derive the local server port and validate callback path |
| `userAccessToken` | plugin auth storage | Cached access token written after auth or refresh; not trusted as durable input |
| `refreshToken` | plugin auth storage | Durable credential used to mint fresh access tokens before sync runs |

`config/config.example.json` is the public compatibility contract. The plugin stores data differently, but it must still provide the same semantic fields to the OAuth layer.

## Initial OAuth Flow

The current plugin authorization flow is:

1. User saves `appId`, `appSecret`, and `redirectUri` in plugin settings.
2. `src/main.ts` recreates the OAuth helper so later operations use the latest config.
3. `FeishuOAuth.authorize()` starts a temporary localhost callback server derived from `redirectUri`.
4. The plugin opens the Feishu authorization URL with these scopes:
   - `offline_access`
   - `drive:drive`
   - `drive:drive:readonly`
   - `docx:document`
   - `docx:document:write_only`
5. The callback server accepts only the configured callback path and requires either a `code` or an explicit OAuth error.
6. The plugin exchanges the code through `POST https://open.feishu.cn/open-apis/authen/v2/oauth/token`.
7. The returned `userAccessToken`, `refreshToken`, expiry, and granted scopes are written into plugin auth storage.

## Refresh Flow Before Sync

`src/main.ts` treats refresh-token validation as a required pre-sync gate:

1. Validate required config fields.
2. Block sync immediately if `refreshToken` is missing.
3. Call `FeishuOAuth.getAccessToken()`.
4. `TokenManager.getValidAccessToken()` reads stored auth state.
5. If the token is still valid, return it directly.
6. If the token is missing or expired, refresh through `POST https://open.feishu.cn/open-apis/authen/v2/oauth/token` with `grant_type=refresh_token`.
7. If Feishu rotates the refresh token, persist the new pair immediately before sync continues.

Current rule: every sync run must enter through plugin-level token validation. Do not build new behavior that assumes a stale cached access token is still safe to use.

## Secret Handling Boundaries

- `config/config.example.json` must stay secret-free.
- `appSecret`, `userAccessToken`, and `refreshToken` are backend secrets, not normal UI fields.
- Secrets may live in local plugin data today, but they must never be committed or echoed into user-facing logs/notices.
- The OAuth layer should accept credentials as data and return refreshed credentials as data. It should not decide how repository files are written.

## Current Runtime Facts

- `AuthStorage` reads and writes against the latest in-memory plugin auth object through a getter, not a captured snapshot.
- `TokenManager` uses Obsidian `requestUrl`, not browser `fetch`, for refresh requests inside the plugin runtime.
- `TokenManager` keeps a single in-flight refresh promise so concurrent entrypoints do not issue duplicate refresh requests.
- The callback server is temporary and should exist only for an active authorization session.

## Failure Contract

| Condition | Current behavior |
|-----------|------------------|
| OAuth exchange returns `code !== 0` | return failure and surface an auth error |
| Refresh exchange returns `code !== 0` | fail sync start before any Drive calls |
| Token response lacks `access_token` | treat as failure even if the HTTP request succeeded |
| Callback request uses the wrong path | return HTTP 404 |
| Callback request omits `code` and does not include an OAuth error | return HTTP 400 |
| No stored `refreshToken` | block sync and ask the user to authorize |

The current runtime is fail-fast. New abstractions may wrap errors, but they must not silently continue with missing or partial credentials.

## Migration Rules

- Keep browser launch and callback hosting outside the sync coordinator.
- Preserve the ability to derive the callback port and path from the configured `redirectUri`.
- Preserve refresh-token rotation semantics. If Feishu returns a new refresh token, it becomes the stored source of truth immediately.
- If token storage moves away from plugin data, define the persistence boundary explicitly and keep the same semantic fields.

## Manual Verification

- Save valid OAuth config in the settings tab and run authorization once.
- Verify the callback listener only accepts the configured path and rejects missing `code`.
- Expire or clear the stored access token, then start sync and confirm the plugin refreshes before any Feishu Drive request.
- Trigger two token checks against an expired token and verify they converge on one refresh result.
- Verify that no committed file contains live values for `appSecret`, `userAccessToken`, or `refreshToken`.

## Scenario: Obsidian Plugin Token Refresh Transport

### 1. Scope / Trigger

- Trigger: token refresh runs inside the Obsidian desktop plugin runtime, where browser `fetch()` from `app://obsidian.md` can fail CORS preflight.

### 2. Signatures

- [`src/oauth/token-manager.ts`](../../../src/oauth/token-manager.ts)
  - `getValidAccessToken(clientId, clientSecret)`
  - `refreshAccessToken(refreshToken, clientId, clientSecret)`
- [`src/main.ts`](../../../src/main.ts)
  - `verifyFeishuConnection()`
  - `startSync()`

### 3. Contracts

- Token refresh in plugin runtime must use Obsidian `requestUrl`, not browser `fetch`.
- Refresh requests must post to `https://open.feishu.cn/open-apis/authen/v2/oauth/token`.
- Request body must include:
  - `grant_type=refresh_token`
  - `client_id`
  - `client_secret`
  - `refresh_token`
- If Feishu rotates the refresh token, the new value becomes the stored source of truth immediately.
- Token refresh may keep a single-flight in-memory guard when more than one plugin entrypoint can request a token at the same time.

### 4. Validation & Error Matrix

| Case | Expected behavior |
|------|-------------------|
| Token still valid | return stored access token without network refresh |
| Token expired | refresh through `requestUrl`, persist updated token pair, then continue |
| Two callers ask for refresh during the same expiry window | share one in-flight refresh result instead of issuing duplicate refresh requests |
| Refresh returns HTTP 4xx/5xx | fail sync start with a surfaced error |
| Refresh payload lacks `access_token` | treat as failure, do not continue upload |
| No stored `refreshToken` | block sync and ask the user to authorize |

### 5. Good / Base / Bad Cases

- Good: sync button calls a plugin-level token validation step before building sync config.
- Base: access token refresh remains local-plugin state and is persisted in plugin data.
- Bad: refresh logic depends on browser CORS behavior, issues duplicate concurrent refreshes, or silently falls back to stale tokens.

### 6. Tests Required

- Expire the stored token, start sync, and verify the plugin refreshes through `requestUrl` before upload starts.
- Remove `refreshToken` and verify sync stops before any Feishu Drive request is made.
- Trigger two token checks against an expired token and verify they converge on one refresh result.
- Simulate an HTTP refresh failure and verify the surfaced error mentions token refresh instead of a generic sync failure.

### 7. Wrong vs Correct

#### Wrong

```ts
await fetch('https://open.feishu.cn/open-apis/authen/v2/refresh_token', {
  method: 'POST',
  body: JSON.stringify({ grant_type: 'refresh_token', refresh_token }),
});
```

#### Correct

```ts
await requestUrl({
  url: 'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
  method: 'POST',
  body: JSON.stringify({
    grant_type: 'refresh_token',
    client_id,
    client_secret,
    refresh_token,
  }),
});
```
