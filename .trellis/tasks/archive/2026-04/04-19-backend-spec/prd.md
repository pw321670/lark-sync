# Fill backend spec for standalone sync core

## Goal
Replace the default backend Trellis templates with project-specific guidance for the current Node.js sync runtime that will later be extracted into an Obsidian plugin-friendly sync core.

## Context
This repository is currently a standalone Node.js prototype for one-way sync from an Obsidian vault into Feishu Drive.

The current runtime behavior lives in:
- `auth.js`: local OAuth callback server, browser launch, token exchange, token persistence into `config.json`
- `sync.js`: refresh token flow, recursive vault scan, exclude filtering, folder creation, Feishu file listing, delete-and-reupload sync strategy, state persistence into `state.json`
- `config.example.json`: the stable configuration contract that future plugin settings must preserve

Important architectural facts discovered from the codebase:
- There is no package manager metadata or build system yet; scripts run directly on Node 18+ globals such as `fetch`, `Blob`, and `FormData`
- Sync logic is stateful and file-based: `config.json` stores credentials and runtime settings, `state.json` stores per-file incremental sync state
- Path handling is cross-platform and normalized to `/` before matching excludes or storing state keys
- Folder creation and file upload are tightly coupled to Feishu Drive APIs and currently use retry + delete-and-recreate behavior
- Error handling is mostly fail-fast with thrown `Error` objects and console logging

## Tools Available
This repository does not currently have GitNexus, ABCoder, or Codex MCP servers configured.

Use local repository analysis instead:
- Read `auth.js`, `sync.js`, `config.example.json`, `README.md`, and Trellis files directly
- Use shell search to discover patterns and function names
- Write specs with concrete references to the current codebase

## Files to Fill
- `.trellis/spec/backend/index.md`
  - Reframe `backend` as "sync core and Feishu integration"
  - Point to the real file set below instead of template docs
- `.trellis/spec/backend/module-boundaries.md`
  - Describe how runtime concerns should be split as the standalone scripts evolve into reusable modules
  - Use current functions in `auth.js` and `sync.js` as anchors
- `.trellis/spec/backend/auth-and-token-lifecycle.md`
  - Cover OAuth, refresh token rotation, config persistence, and secret handling boundaries
- `.trellis/spec/backend/filesystem-and-state.md`
  - Cover vault scanning, exclude matching, normalized relative paths, and `state.json` semantics
- `.trellis/spec/backend/feishu-drive-sync.md`
  - Cover folder discovery/creation, list/delete/upload sequence, retry behavior, and current API assumptions
- `.trellis/spec/backend/quality-and-safety.md`
  - Cover logging expectations, failure handling, migration constraints, and manual verification steps

## Important Rules

### Spec files are not fixed
- Delete template files that do not apply
- Create the new file set listed above
- Update `index.md` to reflect the final backend spec layout

### Parallel agents: stay in your lane
- ONLY modify files under `.trellis/spec/backend/`
- DO NOT modify source code, guides, task files, or workflow docs
- DO NOT run git commands
- You may read any repo file for analysis

## Acceptance Criteria
- [ ] Backend templates are fully replaced with project-specific docs
- [ ] Every doc references the actual current code paths
- [ ] Migration guidance for extracting a reusable sync core is documented
- [ ] No placeholder or generic template text remains
- [ ] `index.md` matches the final backend file set

## Technical Notes
- Runtime today: direct Node.js scripts
- Runtime target: reusable sync engine callable from an Obsidian plugin
- External boundary: Feishu auth + drive APIs
- Persistent local files: `config.json`, `config.example.json`, `state.json`
