---
name: trellis-local
description: |
  Project-specific Trellis customizations for the sync-obsidian-feishu repository.
  This skill records how the vanilla Trellis workflow was adapted for an
  Obsidian-to-Feishu sync/plugin project.
---

# Trellis Local - sync-obsidian-feishu

## Base Version

- Trellis version: 0.4.0
- Date initialized: 2026-04-19

## Portability Decision

Vanilla `trellis-meta` examples place the local customization skill under `.claude/skills/trellis-local/`.

This project stores the canonical local customization record under:
- `.agents/skills/trellis-local/SKILL.md`

Reason:
- the repo already uses `.agents/skills/` as the shared cross-agent skill layer
- Codex can use `.agents/skills/` directly
- the customization should remain portable across agent CLIs instead of being Claude-only

If a future Claude-specific mirror is needed, it should point back to this file as the canonical source.

## Customizations

### Specs Customized

#### Backend spec redefined

- Path: `.trellis/spec/backend/`
- Meaning: sync core, auth lifecycle, filesystem/state contracts, Feishu Drive integration
- Why: the repo is currently a standalone Node.js sync prototype, not a generic backend service

#### Frontend spec redefined

- Path: `.trellis/spec/frontend/`
- Meaning: future Obsidian plugin shell, settings, commands, status UX, and shell/core boundaries
- Why: there is no existing UI layer yet, but future work will be plugin-facing

#### Shared guides rewritten for project risk

- Path: `.trellis/spec/guides/`
- Focus: script-to-plugin extraction, cross-layer contracts, and sync safety
- Why: the default guides were too generic for a side-effect-heavy sync project

### Workflow Changes

#### `.trellis/workflow.md`

- Rewritten to describe the repo as a migration from standalone scripts to an Obsidian plugin
- Added a spec map explaining the project meaning of `backend` and `frontend`
- Added validation rules centered on sync correctness and user trust

#### `.trellis/config.yaml`

- Comments updated to reflect current project semantics and likely future package split
- No behavior-changing config was added yet

### Codex-Specific Notes

- Current Codex integration uses only `SessionStart` via `.codex/hooks.json`
- Because Codex in this repo does not have the same hook coverage as Claude Code, the workflow and spec indexes must carry more of the project context up front
- Task context files should still be used for focused work, but the index docs remain the primary always-on guidance

## Changelog

### 2026-04-19

- Reframed Trellis spec layers around sync core and plugin shell concerns
- Added project-specific migration and sync-safety guidance
- Rewrote the main Trellis workflow to fit this repository
