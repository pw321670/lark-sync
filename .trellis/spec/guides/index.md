# Project Thinking Guides

> Purpose: catch the sync, auth, and plugin-boundary risks that are easy to miss in this Obsidian-to-Feishu project.

---

## Project Context

This repository is an Obsidian plugin:

- **Current state**: active plugin implementation in `src/main.ts`, `src/settings/`, `src/oauth/`, `src/sync/`, and `src/ui/`
- **Settings contract**: compatibility fields still come from `config/config.example.json`
- **Architecture**: one plugin runtime path owns auth, sync, and user-facing UX

Most mistakes in this repo happen at boundaries:

- settings/auth/sync contracts drifting apart
- path normalization changing in one layer only
- Feishu side effects happening without enough safeguards
- sync state being updated without matching the runtime semantics
- UI reporting success when the sync runtime did something else

---

## Available Guides

| Guide | Purpose | When to Use |
|-------|---------|-------------|
| [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md) | Prevent duplicate logic and speculative abstractions | When simplifying modules or extracting shared helpers |
| [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md) | Map data flow across settings, auth, filesystem, sync state, and Feishu APIs | When a change touches more than one boundary |
| [Sync Safety Guide](./sync-safety-guide.md) | Prevent destructive or misleading sync behavior | When a change can affect uploads, deletes, retries, or user trust |

---

## Quick Triggers

Read a guide before coding when any of the following is true:

- You are changing `config/config.example.json` semantics or plugin config mapping
- You are modifying path normalization, include/exclude logic, or relative-path keys
- You are changing Feishu folder creation, upload, delete, doc creation, or retry behavior
- You are adding plugin settings, commands, notices, or long-running sync UX
- You are simplifying or extracting logic across `src/oauth/*`, `src/sync/*`, and `src/ui/*`

---

## Project-Specific Search Rule

Before changing any external contract, search for all usages first:

```bash
rg "fieldName|functionName|endpointFragment" .
```

Especially search for:

- config keys
- auth fields
- state fields
- path normalization helpers
- Feishu endpoint URLs
- user-facing status messages

---

## Core Principle

Protect behavior first, then improve structure.
