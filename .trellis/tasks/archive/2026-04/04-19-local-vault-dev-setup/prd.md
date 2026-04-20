# Set up local vault development architecture

## Goal
Turn the repository into a smoother local-development setup for an Obsidian plugin that is tested against the user's vault at `<vault-path>`.

## Requirements
- Verify the current repository path and test vault path
- Add a safe local development workflow for linking the repository into a vault plugin directory
- Keep the plugin repository as the single source of truth for code and build output
- Avoid manual copy-based install steps during normal development
- Document the exact local development flow in the project README
- Connect the project to the test vault using the plugin `id`

## Acceptance Criteria
- [ ] The repository has helper scripts for local vault linking/status
- [ ] The README documents the recommended local dev flow for this project
- [ ] `<vault-path>/.obsidian/plugins/sync-obsidian-feishu` exists and points at the repository
- [ ] The setup preserves the current plugin scaffold and build process

## Technical Notes
- Repository path: `<repo-path>`
- Test vault path: `<vault-path>`
- Plugin id: `sync-obsidian-feishu`
