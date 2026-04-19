# Settings and Secrets

> Purpose: map the standalone JSON config contract into a safe plugin settings experience without normalizing secrets into version-controlled files.

---

## Current Repo Reality

`config.example.json` defines these fields today:

- `vaultPath`
- `feishuRootFolderToken`
- `appId`
- `appSecret`
- `redirectUri`
- `userAccessToken`
- `refreshToken`
- `exclude`
- `maxDirectUploadMB`

`auth.js` writes tokens back into local config after browser authorization, and `.gitignore` excludes `config.json` and `state.json`.

That means the current system already distinguishes between:

- User-edited setup data
- Secret values and tokens
- Runtime sync state

The plugin should preserve that distinction even if the storage mechanism changes.

---

## Settings Contract For The Future Plugin

| Current Key | Plugin Treatment | UI Rule |
|-------------|------------------|---------|
| `vaultPath` | Derived from the active Obsidian vault in normal operation | Show as read-only context or advanced diagnostic data; do not require users to paste a local path for the common case |
| `feishuRootFolderToken` | Required setting | Editable text input with presence validation |
| `appId` | Required setting | Editable text input with presence validation |
| `appSecret` | Secret setting | Masked input; never echo back in notices or logs |
| `redirectUri` | Required auth setting, usually loopback | Default to the plugin-supported localhost callback and validate format before save |
| `userAccessToken` | Derived runtime secret | Do not expose as a normal editable field; surface connection state instead |
| `refreshToken` | Derived runtime secret | Do not ask the user to type it in the standard flow; provide reconnect/clear actions instead |
| `exclude` | User-managed sync rule list | Multiline list or repeated rows using normalized slash-separated relative paths |
| `maxDirectUploadMB` | Required sync threshold | Numeric field with minimum validation and clear help text |

`state.json` is not a user setting. It represents sync bookkeeping and should stay outside the main settings form.

---

## Storage Rules

### Normal Settings

Persist non-secret configuration in plugin-local data, not in repo-tracked files.

Examples:

- Feishu root folder token
- exclude list
- upload size threshold
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
- Until then, persist them only in local plugin data on the user's machine.

### Sync State

Store incremental sync state separately from editable settings.

The state contract should preserve the standalone semantics from `sync.js`:

- key: normalized relative path
- values: `size`, `mtimeMs`, `uploadedAt`

This state should be replaceable or importable without editing the settings form manually.

---

## Validation Rules

Validate before save or before the first side effect:

- `feishuRootFolderToken`, `appId`, and `appSecret` must be non-empty.
- `redirectUri` must be a valid URL and must match the callback mechanism the plugin actually starts.
- `exclude` entries must be normalized relative paths, not absolute paths.
- `maxDirectUploadMB` must be a positive number.
- Token fields should be treated as managed values; invalid or missing tokens should route the user to reconnect instead of encouraging manual secret editing.

If validation fails, show inline or command-local errors with field names and next steps.

---

## Editing UX Rules

- Prefer a "Connect to Feishu" action over asking users to paste tokens manually.
- Show whether the plugin is currently authorized without revealing the token values.
- Provide a "Clear authorization" or "Reconnect" action that wipes managed tokens safely.
- Explain that the active vault defines the sync source unless an advanced override is explicitly designed later.
- Keep advanced settings collapsed or clearly marked when they are not needed for first-run success.

---

## Migration Rules

These are forward-looking rules for the standalone-to-plugin transition:

- If old `config.json` and `state.json` data can be imported, make it an explicit one-time migration step.
- Import should preserve existing refresh token and incremental sync state when safe.
- Do not silently overwrite or delete the old standalone files.
- Any field removed from the plugin UI must have a documented replacement path.

---

## Forbidden Patterns

- Storing secrets in `.trellis/`, repo docs, or version-controlled examples
- Making `userAccessToken` a normal editable settings field
- Requiring a manual `vaultPath` input for the common in-vault plugin flow
- Mixing sync bookkeeping state into the same model the settings tab edits
- Logging raw Feishu token responses in user-visible UI
