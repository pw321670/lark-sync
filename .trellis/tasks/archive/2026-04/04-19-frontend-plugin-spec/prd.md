# Fill frontend spec for Obsidian plugin migration

## Goal
Replace the default frontend Trellis templates with project-specific guidance for the Obsidian plugin layer that will wrap the current standalone sync scripts.

## Context
This codebase does not yet contain plugin UI files, React components, or a settings tab. The frontend spec therefore needs to define the conventions for the next phase of the project: turning the standalone sync prototype into an Obsidian plugin.

The spec must stay grounded in current repo reality:
- `config.example.json` defines the fields that the future plugin settings UI must surface
- `auth.js` defines the current OAuth flow and browser-based authorization steps
- `sync.js` defines the long-running sync flow whose progress, errors, and final summary will need to be surfaced through Obsidian commands and notices

Important design direction from the user:
- The repo's next stage is an Obsidian plugin for publishing/syncing content to Feishu
- Future work will build on the current standalone implementation, not replace its behavior blindly

## Tools Available
This repository does not currently have GitNexus, ABCoder, or Codex MCP servers configured.

Use local repository analysis instead:
- Read `auth.js`, `sync.js`, `config.example.json`, `README.md`, and Trellis files directly
- Derive future plugin conventions from the current runtime contracts
- Be explicit when guidance is a forward-looking rule rather than a current code example

## Files to Fill
- `.trellis/spec/frontend/index.md`
  - Reframe `frontend` as "Obsidian plugin layer and user-facing interactions"
  - Point to the real file set below instead of template docs
- `.trellis/spec/frontend/plugin-architecture.md`
  - Describe the future plugin entrypoint, lifecycle hooks, service boundaries, and which code should be extracted from the standalone scripts
- `.trellis/spec/frontend/settings-and-secrets.md`
  - Define how plugin settings should map to `config.example.json` fields and how secrets should be edited, stored, and validated
- `.trellis/spec/frontend/commands-and-status-ux.md`
  - Define command palette actions, sync status feedback, progress reporting, and error surfaces for long-running sync
- `.trellis/spec/frontend/obsidian-boundaries.md`
  - Define what belongs in Obsidian-facing code versus the shared sync core
- `.trellis/spec/frontend/quality-and-compatibility.md`
  - Define migration-safe rules, manual tests, and compatibility expectations for desktop-first plugin work

## Important Rules

### Spec files are not fixed
- Delete template files that do not apply
- Create the new file set listed above
- Update `index.md` to reflect the final frontend spec layout

### Parallel agents: stay in your lane
- ONLY modify files under `.trellis/spec/frontend/`
- DO NOT modify source code, guides, task files, or workflow docs
- DO NOT run git commands
- You may read any repo file for analysis

## Acceptance Criteria
- [ ] Frontend templates are fully replaced with plugin-specific docs
- [ ] The docs clearly separate current reality from forward-looking plugin rules
- [ ] Settings, commands, and Obsidian boundary decisions are documented
- [ ] No placeholder or generic template text remains
- [ ] `index.md` matches the final frontend file set

## Technical Notes
- Current runtime has no frontend code yet
- Future target is an Obsidian plugin, likely desktop-first
- Plugin UX must preserve the current auth and sync contracts while improving usability
