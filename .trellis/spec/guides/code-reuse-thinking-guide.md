# Code Reuse Thinking Guide

> Purpose: avoid creating a second implementation while simplifying or extending this Obsidian plugin.

---

## The Real Duplication Risk Here

This repo tends to grow in two directions at once:

- add or refine plugin UX
- add or refine auth/sync runtime behavior

The highest-risk mistake is duplicating logic across `src/main.ts`, `src/settings/*`, `src/ui/*`, and `src/sync/*` instead of keeping one trusted runtime path.

---

## Search Before You Extract

Use search before introducing a new helper:

```bash
rg "normalize|matchList|getAccessToken|ensureFolder|upload|summary|notice" src
```

If a helper already exists, prefer:

- moving it into a better-owned module
- renaming it with a clearer boundary
- adapting callers to the extracted version

Do not keep both old and new implementations without a deliberate compatibility reason.

---

## Reuse Targets In The Current Codebase

These are the first candidates for shared extraction or reuse:

- config normalization and validation
- token refresh and auth request code
- path normalization and include/exclude matching
- sync summary shaping
- folder ensure/list logic against Feishu
- upload/delete/doc orchestration

If you touch one of these, ask whether the new caller should use the same function rather than a new version.

---

## Preferred Shape

Use this direction of travel:

- shell-specific code stays at the edge
  - plugin edge: command registration, settings tab, notices, ribbon state
- runtime modules handle deterministic behavior
  - config validation
  - auth refresh
  - path normalization
  - folder/file mapping
  - Feishu API sequencing
  - state updates

This keeps the plugin thin and prevents behavior drift.

---

## Common Anti-Patterns

### Anti-pattern 1: Copying a runtime function into a UI layer

Bad:

- `src/sync/*` keeps one upload flow
- settings action or command handler creates a second upload flow

Better:

- keep one runtime upload service
- UI code calls it through a public plugin/runtime method

### Anti-pattern 2: Repeating config field knowledge

Bad:

- config defaults live in one place
- UI labels and validation rules guess the same shape elsewhere

Better:

- one canonical config contract
- UI and runtime read from the same semantic field set

### Anti-pattern 3: Parallel status vocabularies

Bad:

- runtime result says one thing
- notice copy implies a different outcome

Better:

- shared result objects
- edge layers format them for UI

---

## Extraction Checklist

- [ ] I searched for an existing helper before creating a new one
- [ ] The new boundary reduces duplication instead of moving it around
- [ ] UI code and runtime code can still share behavior after this change
- [ ] I did not leave stale copies of logic behind

---

## Surface-Area Reduction Before Abstraction

When the codebase feels bloated, do this before inventing another abstraction:

- ask whether the module, command, or UI surface is on the live execution path today
- remove duplicate implementations before trying to unify them
- inline wrappers that only rename one host API call
- delete speculative controls such as pause/resume or extra status surfaces until the core flow really supports them

This project benefited more from deleting unused surfaces than from adding a "better" abstraction over them.

Quick check:

- [ ] If I remove this file/class/command, does any real user flow break?
- [ ] Does this abstraction have more than one caller or more than one implementation?
- [ ] Am I preserving one trusted path, or keeping two half-overlapping ones alive?
