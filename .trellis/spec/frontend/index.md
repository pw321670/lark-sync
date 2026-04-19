# Frontend / Obsidian Plugin Guidelines

> Scope: the current Obsidian plugin layer and every user-facing interaction around Feishu authorization, sync, and result reporting.

---

## Current Repo Reality

- The plugin shell exists in `src/main.ts`, `src/settings/`, `src/oauth/*`, `src/sync/*`, and `src/ui/*`.
- The active user entrypoints are:
  - a left-ribbon sync button,
  - command palette commands,
  - a settings tab,
  - Notice-based completion and error feedback.
- `config/config.example.json` remains the compatibility source of truth for required settings concepts, even though the plugin stores them in plugin data.

This directory is descriptive and operational:

- **Current reality** sections describe the code that exists today.
- **Forward-looking rules** constrain future plugin work so it does not drift away from the current sync contract.

---

## Pre-Development Checklist

Read these files before changing any user-facing plugin code or sync UX:

- [Plugin Architecture](./plugin-architecture.md)
- [Obsidian Boundaries](./obsidian-boundaries.md)

Then read the task-specific docs:

- If you touch settings, auth fields, or persistence: [Settings and Secrets](./settings-and-secrets.md)
- If you touch commands, notices, progress, or error UX: [Commands and Status UX](./commands-and-status-ux.md)
- Before release or compatibility-sensitive changes: [Quality and Compatibility](./quality-and-compatibility.md)

Always read shared guides too:

- `../guides/cross-layer-thinking-guide.md`
- `../guides/code-reuse-thinking-guide.md`

---

## Guide Map

| Guide | Purpose |
|-------|---------|
| [Plugin Architecture](./plugin-architecture.md) | Defines the current plugin shell, lifecycle ownership, and where sync behavior must live |
| [Settings and Secrets](./settings-and-secrets.md) | Maps config concepts into plugin settings, secret handling, validation, and persistence rules |
| [Commands and Status UX](./commands-and-status-ux.md) | Defines command palette actions, progress phases, summary reporting, and safe error surfaces for long-running sync |
| [Obsidian Boundaries](./obsidian-boundaries.md) | Draws the line between Obsidian-facing code and the sync/runtime layers |
| [Quality and Compatibility](./quality-and-compatibility.md) | Captures manual test expectations and desktop-first compatibility constraints |

---

## Source Contracts To Preserve

These files define the current plugin behavior:

- `src/main.ts`
  - validates config,
  - refreshes token before sync,
  - opens settings,
  - stores the last sync summary
- `src/settings/*`
  - renders settings,
  - manages authorization actions,
  - explains sync-related config
- `src/ui/*`
  - owns ribbon state, notices, and command registration
- `src/sync/*`
  - owns scanning, folder creation, upload orchestration, and sync results
- `config/config.example.json`
  - defines the settings concepts the plugin must still represent

Any intentional behavior change from those contracts should be documented in this directory before implementation.
