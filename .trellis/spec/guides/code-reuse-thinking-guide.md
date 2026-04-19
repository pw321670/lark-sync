# Code Reuse Thinking Guide

> Purpose: avoid creating a second implementation while extracting this standalone sync prototype into an Obsidian plugin.

---

## The Real Duplication Risk Here

This repo is likely to grow in two directions at once:
- keep the current standalone script behavior working
- add an Obsidian plugin layer on top of it

The highest-risk mistake is duplicating logic from `auth.js` or `sync.js` into plugin-specific code instead of extracting shared modules.

---

## Search Before You Extract

Use search before introducing a new helper:

```bash
rg "normalizeRelPath|shouldExclude|refreshUserAccessToken|ensureFolder|uploadSmallFile|readJson|saveJson" .
```

If a helper already exists, prefer:
- moving it into a shared module
- renaming it with a clearer boundary
- adapting callers to the extracted version

Do not keep both old and new implementations without a deliberate compatibility reason.

---

## Reuse Targets In The Current Codebase

These are the first candidates for shared extraction:

- JSON file helpers in `auth.js` and `sync.js`
- token refresh and auth request code
- path normalization and exclude matching
- recursive vault walking
- folder ensure/list logic against Feishu
- upload/delete orchestration

If you touch one of these, ask whether the plugin layer should call the same function later.

---

## Preferred Extraction Shape

Use this direction of travel:

- shell-specific code stays at the edge
  - standalone edge: browser launch, local HTTP callback, console logs
  - plugin edge: command registration, settings tab, notices, progress UI
- shared core handles deterministic sync behavior
  - config validation
  - path normalization
  - folder/file mapping
  - Feishu API sequencing
  - state updates

This keeps the future plugin thin and prevents behavior drift.

---

## Common Anti-Patterns

### Anti-pattern 1: Copying a function into the plugin layer

Bad:
- `sync.js` keeps one upload flow
- plugin command creates a second upload flow

Better:
- extract one upload service
- both standalone and plugin edges call it

### Anti-pattern 2: Repeating config field knowledge

Bad:
- config defaults live in one place
- UI labels and validation rules guess the same shape elsewhere

Better:
- one canonical config contract
- UI and runtime read from the same schema or mapping

### Anti-pattern 3: Parallel logging styles

Bad:
- console output says one thing
- plugin notices summarize a different outcome

Better:
- shared result objects
- edge layers format them for console or UI

---

## Extraction Checklist

- [ ] I searched for an existing helper before creating a new one
- [ ] The new boundary reduces duplication instead of moving it around
- [ ] Standalone and plugin paths can still share behavior after this change
- [ ] I did not leave stale copies of logic behind
