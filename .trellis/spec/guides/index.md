# Project Thinking Guides

> Purpose: catch the migration and sync risks that are easy to miss in this Obsidian-to-Feishu project.

---

## Project Context

This repository is in a transition state:
- Today it is a standalone Node.js sync prototype driven by `auth.js` and `sync.js`
- The next stage is an Obsidian plugin that reuses the current auth and sync behavior instead of rewriting it from scratch

Most mistakes in this repo will happen at boundaries:
- config fields moving from JSON files into plugin settings
- filesystem paths being normalized differently across modules
- sync state being updated without preserving current semantics
- Feishu API side effects being triggered without enough safeguards

---

## Available Guides

| Guide | Purpose | When to Use |
|-------|---------|-------------|
| [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md) | Prevent duplicate logic during script-to-plugin extraction | When moving logic into shared modules or plugin services |
| [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md) | Map data flow across settings, filesystem, sync state, and Feishu APIs | When a change touches more than one boundary |
| [Sync Safety Guide](./sync-safety-guide.md) | Prevent destructive or misleading sync behavior | When a change can affect uploads, deletes, retries, or user trust |

---

## Quick Triggers

Read a guide before coding when any of the following is true:

- You are changing `config.example.json`, `config.json`, or `state.json` semantics
- You are modifying path normalization, exclude logic, or relative-path keys
- You are changing Feishu folder creation, upload, delete, or retry behavior
- You are adding plugin settings, commands, notices, or long-running sync UX
- You are extracting logic from `auth.js` or `sync.js` into reusable modules

---

## Project-Specific Search Rule

Before changing any external contract, search for all usages first:

```bash
rg "fieldName|functionName|endpointFragment" .
```

Especially search for:
- config keys
- state fields
- path normalization helpers
- Feishu endpoint URLs
- user-facing status messages

---

## Core Principle

Protect behavior first, then improve structure.
