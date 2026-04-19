# Frontend / Obsidian Plugin Guidelines

> Scope: the future Obsidian plugin layer and every user-facing interaction that wraps the current standalone Feishu sync scripts.

---

## Current Repo Reality

- There is no plugin code, settings tab, command registration, or React UI in the repository yet.
- `auth.js` and `sync.js` are the current behavioral contract for authorization and sync.
- `config.example.json` is the source of truth for which settings must exist, even if the future plugin stores them differently.
- `README.md` and `.gitignore` confirm the current operator flow: copy config, authorize once, run sync, keep secrets and sync state out of version control.

This directory is therefore partly descriptive and partly forward-looking:

- **Current reality** sections capture behavior that must not be broken during migration.
- **Forward-looking rules** define how the plugin layer should be designed when implementation begins.

---

## Pre-Development Checklist

Read these files before changing any future Obsidian plugin code or user-facing sync behavior:

- [Plugin Architecture](./plugin-architecture.md)
- [Obsidian Boundaries](./obsidian-boundaries.md)

Then read the task-specific docs:

- If you touch settings, auth fields, or persistence: [Settings and Secrets](./settings-and-secrets.md)
- If you touch commands, notices, progress, or error UX: [Commands and Status UX](./commands-and-status-ux.md)
- Before release, migration, or platform changes: [Quality and Compatibility](./quality-and-compatibility.md)

Always read shared guides too:

- `../guides/cross-layer-thinking-guide.md`
- `../guides/code-reuse-thinking-guide.md`

---

## Guide Map

| Guide | Purpose |
|-------|---------|
| [Plugin Architecture](./plugin-architecture.md) | Defines the future plugin entrypoint, lifecycle ownership, and which logic must be extracted from the standalone scripts |
| [Settings and Secrets](./settings-and-secrets.md) | Maps `config.example.json` fields into plugin settings, secret handling, validation, and persistence rules |
| [Commands and Status UX](./commands-and-status-ux.md) | Defines command palette actions, progress phases, summary reporting, and safe error surfaces for long-running sync |
| [Obsidian Boundaries](./obsidian-boundaries.md) | Draws the line between Obsidian-facing code and the shared sync core so migration does not duplicate behavior |
| [Quality and Compatibility](./quality-and-compatibility.md) | Captures migration-safe rules, manual test expectations, and desktop-first compatibility constraints |

---

## Source Contracts To Preserve

These files are the runtime contract until plugin code exists:

- `auth.js`
  - Builds the Feishu OAuth URL
  - Opens the browser
  - Listens on a local callback server
  - Writes `userAccessToken` and `refreshToken`
- `sync.js`
  - Refreshes the access token before sync
  - Walks the vault recursively
  - Applies exclude-path matching with normalized `/` separators
  - Creates missing Feishu folders
  - Skips unchanged files using persisted state
  - Deletes same-name files before uploading replacements
- `config.example.json`
  - Defines the settings surface the plugin must still represent
- `.gitignore`
  - Confirms credentials and sync state are local-only artifacts

Any intentional behavior change from those contracts should be documented in this directory before implementation.
