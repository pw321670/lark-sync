# Settings And Secrets

> Purpose: map the compatibility config contract into a safe plugin settings experience without normalizing secrets into version-controlled files.

---

## Current Repo Reality

`config/config.example.json` still defines the core settings concepts:

- `vaultPath`
- `feishuRootFolderToken`
- `appId`
- `appSecret`
- `redirectUri`
- `userAccessToken`
- `refreshToken`
- `exclude`
- `maxDirectUploadMB`

The plugin stores settings and auth in local plugin data, not in repository files. It still needs to preserve the same distinction between:

- user-edited setup data
- secret values and tokens
- runtime sync state

---

## Settings Contract For The Plugin

| Current Key | Plugin Treatment | UI Rule |
|-------------|------------------|---------|
| `vaultPath` | Derived from the active Obsidian vault in normal operation | Show as read-only context or diagnostics only |
| `feishuRootFolderToken` | Required setting | Editable text input with presence validation |
| `appId` | Required setting | Editable text input with presence validation |
| `appSecret` | Secret setting | Masked input; never echo back in notices or logs |
| `redirectUri` | Required auth setting | Default to the supported localhost callback and validate format before save |
| `userAccessToken` | Derived runtime secret | Do not expose as a normal editable field |
| `refreshToken` | Derived runtime secret | Do not ask the user to type it in the standard flow |
| `exclude` | User-managed path list | Multiline list or repeated rows using normalized slash-separated relative paths |
| `maxDirectUploadMB` | Required sync threshold | Numeric field with minimum validation and clear help text |
| `concurrentUploads` | Advanced throughput setting | Explain that it controls regular-file upload workers; Markdown online documents may still run serially for safety |
| `retryAttempts` | Advanced request-retry setting | Explain as maximum attempts for individual Feishu API requests, not whole-file upload replays |
| `retryDelay` | Advanced request-retry setting | Explain as wait time before retrying a failed Feishu API request |
| `markdownSyncMode` | User-managed Markdown representation setting | Default to document mode (`Create as online documents`), but allow switching back to regular file upload |

Sync state is not a user setting. It represents bookkeeping and should stay outside the main settings form.

---

## Storage Rules

### Normal Settings

Persist non-secret configuration in plugin-local data.

Examples:

- Feishu root folder token
- include/exclude mode and path list
- upload size threshold
- markdown sync representation mode
- retry/concurrency settings
- redirect URI if the implementation keeps it configurable

### Secrets

Treat these as secrets at every layer:

- `appSecret`
- `userAccessToken`
- `refreshToken`

Rules:

- Never commit them to the repository.
- Never print them in notices, logs, or error payloads.
- Never include them in exported debug output without explicit user opt-in and redaction.
- If a more secure secret store becomes available, prefer it over plain plugin data.

### Sync State

Store incremental sync state separately from editable settings.

Current semantic fields:

- key: normalized relative path
- values: `size`, `mtimeMs`, `uploadedAt`
- optional `remote` object for legacy entries, but successful current uploads should write it:
  - `type = "document"` with `token = remote document_id` for Markdown online documents
  - `type = "file"` with `token = remote Drive file token` for regular file uploads
  - `title`, `parentFolderToken`, `url` for recovery/debugging context

The settings UI must not expose sync-state editing. If a user needs a repair, runtime sync logic should repair missing remote identity by uploading/recovering through the sync path rather than asking the user to edit `syncState`.

---

## Validation Rules

Validate before save or before first side effect:

- `feishuRootFolderToken`, `appId`, and `appSecret` must be non-empty.
- `redirectUri` must be a valid URL and must match the callback mechanism the plugin actually starts.
- path-list entries must be normalized relative paths, not absolute paths.
- `maxDirectUploadMB` must be a positive number.
- token fields are managed values; invalid or missing tokens should route the user to reconnect rather than encouraging manual token editing.

---

## Editing UX Rules

- Prefer an "Authorize" action over asking users to paste tokens manually.
- Show whether the plugin is currently authorized without revealing token values.
- Provide "Clear authorization" or "Reconnect" style actions that wipe managed tokens safely.
- Explain that the active vault defines the sync source unless an advanced override is designed later.
- Keep advanced settings clearly marked.

---

## Migration Rules

- If a config concept is removed from the UI, document its replacement path.
- If settings storage changes, preserve the same semantic fields for the runtime layer.
- Do not silently merge editable settings and sync bookkeeping into one blob with no ownership boundary.

---

## Forbidden Patterns

- storing secrets in `.trellis/`, repo docs, or version-controlled examples
- making `userAccessToken` a normal editable settings field
- requiring a manual `vaultPath` input for the common plugin flow
- mixing sync bookkeeping state into the same model the settings tab edits
- logging raw Feishu token responses in user-visible UI

## Scenario: Current Plugin Data And OAuth Rebinding

### 1. Scope / Trigger

- Trigger: the plugin stores config and auth in Obsidian plugin data, and OAuth helpers must stay bound to the latest in-memory model.

### 2. Signatures

- `src/main.ts`
  - `updateConfig(patch)`
  - `clearAuthorization()`
  - `ensureValidAccessToken()`
- `src/oauth/auth-storage.ts`
  - `read()`
  - `write(data)`
  - `clear()`

### 3. Contracts

- `pluginData.config` is user-editable settings.
- `pluginData.auth` is managed runtime auth state.
- `AuthStorage` must read and write through a getter to the current `pluginData.auth` object, not a stale captured object.
- Config updates must recreate OAuth helpers so later token refreshes use the latest `appId`, `appSecret`, and `redirectUri`.

### 4. Validation & Error Matrix

| Case | Expected behavior |
|------|-------------------|
| User changes auth config | OAuth helper is reinitialized |
| User clears authorization | access token, refresh token, and expiry are all cleared |
| Sync starts with expired token | plugin refreshes token before passing auth into sync runtime |
| Missing auth | settings remain editable, but sync stays blocked |

### 5. Good / Base / Bad Cases

- Good: config and auth are distinct, and runtime-managed fields are not hand-edited in the settings form.
- Base: tokens still live in plugin data for now.
- Bad: capture `pluginData.auth` once, then keep mutating an object that is no longer the current saved auth state.

### 6. Tests Required

- Update auth config, then authorize or refresh token, and verify the latest settings are used.
- Clear authorization and verify all managed auth fields become empty/null.
- Start sync after token expiry and verify a refreshed access token is persisted before sync begins.

### 7. Wrong vs Correct

#### Wrong

- `new AuthStorage(this.pluginData.auth, ...)`

#### Correct

- `new AuthStorage(() => this.pluginData.auth, ...)`
