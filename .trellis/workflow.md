# Development Workflow

> Project-specific Trellis workflow for the Obsidian-to-Feishu sync/plugin repository.

---

## Table of Contents

1. [Quick Start (Do This First)](#quick-start-do-this-first)
2. [Project Context](#project-context)
3. [Spec Map](#spec-map)
4. [Task Workflow](#task-workflow)
5. [Validation Checklist](#validation-checklist)
6. [Session End](#session-end)
7. [File Descriptions](#file-descriptions)
8. [Best Practices](#best-practices)

---

## Quick Start (Do This First)

### Step 0: Initialize Developer Identity

```bash
python ./.trellis/scripts/get_developer.py
python ./.trellis/scripts/init_developer.py <your-name>
```

### Step 1: Load Current Context

```bash
python ./.trellis/scripts/get_context.py
python ./.trellis/scripts/get_context.py --mode packages
```

### Step 2: Read The Right Specs Before Coding

Use the spec directories by concern, not by the old generic names:

| If your change is about... | Read first |
|----------------------------|------------|
| Feishu auth, token refresh, filesystem traversal, state, sync logic | `.trellis/spec/backend/index.md` |
| Obsidian plugin lifecycle, commands, settings, notices, user-facing UX | `.trellis/spec/frontend/index.md` |
| Script-to-plugin extraction, cross-boundary changes, sync safety | `.trellis/spec/guides/index.md` |

### Step 3: Read Specific Guideline Files

The index files are entry points. Read the topic docs listed there before editing code.

For this repo, many tasks should read both:
- backend spec, because the current behavior lives in `auth.js` and `sync.js`
- frontend spec, because the target product is an Obsidian plugin

---

## Project Context

This repository is not a normal fullstack app.

Current state:
- standalone Node.js prototype
- core behavior lives in `auth.js` and `sync.js`
- config contract lives in `config.example.json`
- runtime state is persisted in `config.json` and `state.json`

Target state:
- an Obsidian plugin for publishing or syncing content into Feishu
- the plugin should reuse the current sync behavior where possible
- shell-specific code should move to boundaries, while reusable sync logic gets extracted

Working rule:
- preserve behavior first
- improve structure second
- only change sync semantics when the new behavior is explicit and tested

---

## Spec Map

### Backend spec means sync core and Feishu integration

Read backend spec when working on:
- OAuth and token lifecycle
- path normalization and exclude rules
- vault scanning
- Feishu folder and file operations
- local config or sync state persistence

### Frontend spec means the future Obsidian plugin layer

Read frontend spec when working on:
- plugin entrypoint and lifecycle
- settings tab and config editing
- command palette actions
- sync progress, notices, and error UX
- deciding what stays in plugin code versus shared services

### Shared guides catch migration and safety issues

Always read shared guides when:
- extracting code out of `auth.js` or `sync.js`
- changing any contract that crosses config, sync state, remote APIs, and UI
- introducing automatic sync or destructive remote behavior

---

## Task Workflow

### 1. Create or continue a task

```bash
python ./.trellis/scripts/task.py list
python ./.trellis/scripts/task.py create "<title>" --slug <name>
python ./.trellis/scripts/task.py start <task-dir>
```

If there is already an active task, continue it unless the work is clearly unrelated.

### 2. Research current behavior before editing

For this repo, start from the current anchors:
- `auth.js`
- `sync.js`
- `config.example.json`
- relevant Trellis spec files

If the task is plugin-facing, also define:
- what behavior already exists in the standalone scripts
- what the plugin layer is allowed to own
- what must be extracted into shared logic

### 3. Configure task context

```bash
python ./.trellis/scripts/task.py init-context <task-dir> <backend|frontend|fullstack|docs>
python ./.trellis/scripts/task.py add-context <task-dir> implement <path> "<reason>"
```

Recommended mapping:
- use `backend` for sync-core changes
- use `frontend` for plugin-shell changes
- use `fullstack` when a change spans both extraction and plugin UX
- use `docs` for Trellis/spec maintenance

### 4. Implement in the smallest safe boundary

Prefer this sequence:

1. extract shared deterministic logic
2. keep side effects at the shell edge
3. wire the plugin or script entrypoint to the shared logic

Avoid:
- duplicating sync logic in both standalone and plugin layers
- changing config/state schema without documenting compatibility
- hiding destructive sync behavior behind vague success messages

### 5. Update specs when conventions change

If a task changes how the project should be developed in the future:
- update the relevant spec file
- update shared guides if a new failure mode was discovered
- keep `trellis-local` current when workflow behavior changes

---

## Validation Checklist

Before marking work ready:

- [ ] Relevant spec files were read before editing
- [ ] No duplicate implementation was introduced during extraction
- [ ] Config and state compatibility were considered
- [ ] User-facing status matches real sync outcomes
- [ ] Manual validation covers at least one happy path and one failure path

Project-specific manual checks commonly needed:
- auth flow still completes and persists tokens
- unchanged files are skipped
- changed files re-sync correctly
- excludes still work
- remote failures are surfaced clearly

---

## Session End

When work is done:

```bash
python ./.trellis/scripts/task.py finish
python ./.trellis/scripts/add_session.py --title "..." --commit "..."
```

Before commit:
- run the relevant checks for the current change
- test the affected sync path or plugin UX manually
- update specs if you learned a new rule

AI should not create commits unless the user explicitly asks for it.

---

## File Descriptions

### Current source anchors

- `auth.js`: OAuth bootstrap and token persistence
- `sync.js`: sync engine prototype and Feishu Drive integration
- `config.example.json`: configuration contract for future settings UI
- `state.json`: local incremental sync snapshot

### Trellis paths

- `.trellis/spec/backend/`: sync-core and Feishu integration guidance
- `.trellis/spec/frontend/`: Obsidian plugin layer guidance
- `.trellis/spec/guides/`: migration, boundary, and sync-safety thinking guides
- `.trellis/tasks/`: task tracking and context files
- `.trellis/workspace/`: developer journals

---

## Best Practices

### Do

- read source-of-truth files before refactoring
- preserve runtime behavior while extracting structure
- keep plugin code thin and shared sync code deterministic
- surface partial failures honestly
- update specs when you establish a new pattern

### Do Not

- duplicate logic from `auth.js` or `sync.js`
- silently change config keys or state semantics
- hide delete-and-reupload behavior
- treat this repo as a generic frontend/backend app
- commit code without manual validation of the affected path
