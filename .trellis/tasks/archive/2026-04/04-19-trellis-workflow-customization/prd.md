# Customize shared guides and Trellis workflow

## Goal
Adapt Trellis workflow docs and shared guides so future sessions understand this project as an Obsidian-to-Feishu plugin migration project, not a generic frontend/backend template.

## Context
The repo was initialized with vanilla Trellis defaults:
- `.trellis/spec/backend/*` and `.trellis/spec/frontend/*` are generic templates
- `.trellis/spec/guides/*` are generic thinking guides
- `.trellis/workflow.md` describes a generic frontend/backend workflow
- There is no project-local `trellis-local` customization skill yet

Codex-specific constraints discovered in the repo:
- `.codex/hooks.json` only wires `SessionStart`
- `.codex/hooks/session-start.py` injects workflow and spec indexes, so the quality of those index docs matters a lot
- Codex does not have the same hook coverage as Claude Code in this repo, so project-specific guidance must be front-loaded into workflow and indexes

## Tools Available
Use local repository analysis and Trellis source inspection:
- `.trellis/workflow.md`
- `.trellis/config.yaml`
- `.codex/hooks.json`
- `.codex/hooks/session-start.py`
- `.claude/settings.json`
- current task files under `.trellis/tasks/`

## Files to Fill or Update
- `.trellis/spec/guides/index.md`
  - Replace the generic guide index with project-specific thinking triggers
- `.trellis/spec/guides/cross-layer-thinking-guide.md`
  - Rewrite around config -> vault scan -> state -> Feishu API -> plugin UX boundaries
- `.trellis/spec/guides/sync-safety-guide.md`
  - Add a new guide for destructive sync risks, retry semantics, and migration safety
- `.trellis/workflow.md`
  - Rewrite project examples and must-read sections around this repo's real development flow
- `.trellis/config.yaml`
  - Update comments and any helpful defaults/documentation so the config matches this project's Trellis usage
- `.agents/skills/trellis-local/SKILL.md`
  - Record the project-specific Trellis customizations in a portable project-local skill

## Important Rules
- Modify workflow/guides/customization files only
- Do not change source code behavior in `auth.js` or `sync.js`
- Keep Trellis compatible with Codex's existing session-start hook
- Prefer portable customizations that work even without full Claude-style hook support

## Acceptance Criteria
- [ ] Shared guides speak directly to this project's sync and plugin-migration risks
- [ ] `workflow.md` explains how to use Trellis in this repo specifically
- [ ] A project-local `trellis-local` skill exists and records the customizations made
- [ ] The resulting setup still works with the current Codex session-start injection model

## Technical Notes
- Trellis version in repo: `0.4.0`
- Meta-skill reference mentions `.claude/skills/trellis-local`, but this project already shares reusable skills through `.agents/skills/`; document the portability decision explicitly
