# Scaffold first Obsidian plugin shell

## Goal
Add the first Obsidian plugin scaffold to this repository so future work can move from standalone Node.js scripts toward a desktop-first Obsidian plugin without losing the current sync contracts.

## Requirements
- Add the standard Obsidian plugin project files needed to build a plugin
- Add a TypeScript plugin entrypoint that loads settings, registers commands, and exposes a visible status surface
- Define plugin settings that map to the current `config.example.json` contract
- Add shared TypeScript modules for migration-safe settings and path logic
- Preserve existing `auth.js` and `sync.js` as current runtime anchors; do not rewrite the full sync engine yet
- Update top-level docs only where needed to explain the transition

## Acceptance Criteria
- [ ] Repo contains a buildable Obsidian plugin scaffold (`manifest.json`, `package.json`, `tsconfig.json`, build config, `src/`)
- [ ] Plugin code compiles to `main.js`
- [ ] Plugin shell loads persisted settings, registers at least one sync-related command, and creates a status bar item
- [ ] Settings interface covers the fields represented in `config.example.json`
- [ ] Shared modules do not duplicate the existing path/config contracts unnecessarily
- [ ] Existing standalone scripts remain untouched in behavior

## Technical Notes
- Current anchors: `auth.js`, `sync.js`, `config.example.json`
- Relevant specs: backend sync-core guidance, frontend plugin guidance, and shared migration/safety guides
- Initial scope is scaffolding and migration boundaries, not full auth/sync feature parity inside the plugin
