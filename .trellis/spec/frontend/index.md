# Frontend / Obsidian Plugin Guidelines

> Scope: the future Obsidian plugin layer and every user-facing interaction that wraps the current standalone Feishu sync scripts.

---

## Current Repo Reality

- The plugin shell now exists in `src/main.ts`, `src/settings.ts`, `src/oauth/*`, `src/sync/*`, and `src/ui/*`.
- The active user entrypoints are:
  - a left-ribbon sync button,
  - command palette commands,
  - a settings tab,
  - Notice-based completion and error feedback.
- `legacy/auth.js` and `legacy/sync.js` are still the behavioral baseline for auth and sync semantics.
- `config/config.example.json` remains the migration source of truth for required settings fields, even though the plugin stores them differently now.

This directory is therefore both descriptive and operational:

- **Current reality** sections describe the code that exists today.
- **Forward-looking rules** constrain the remaining migration work so the plugin does not drift away from the legacy sync contract.

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
