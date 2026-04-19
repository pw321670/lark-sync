# Bootstrap project-specific Trellis specs and workflow

## Goal
Replace the default Trellis bootstrap templates with project-specific guidance for a repository that is moving from standalone Node.js scripts into an Obsidian plugin for publishing or syncing content to Feishu.

## Requirements
- Replace the default backend spec with sync-core and Feishu-integration guidance
- Replace the default frontend spec with Obsidian plugin shell guidance
- Rewrite shared guides around migration, boundary ownership, and sync safety
- Update Trellis workflow documentation so future sessions understand this repo correctly
- Record the Trellis customizations in a project-local `trellis-local` skill

## Acceptance Criteria
- [ ] `.trellis/spec/backend/` is fully project-specific
- [ ] `.trellis/spec/frontend/` is fully project-specific
- [ ] `.trellis/spec/guides/` contains project-specific thinking guides
- [ ] `.trellis/workflow.md` matches this repository's actual development flow
- [ ] project-local Trellis customization record exists

## Task Decomposition
- Child task: `04-19-backend-spec`
- Child task: `04-19-frontend-plugin-spec`
- Child task: `04-19-trellis-workflow-customization`

## Technical Notes
- Current source anchors: `auth.js`, `sync.js`, `config.example.json`
- Current Trellis constraints: Codex session-start hook is available; full MCP-based bootstrap tooling is not configured in this repo
