# Obsidian Boundaries

> Purpose: define what belongs in Obsidian-facing plugin code versus the shared Feishu sync core so the migration stays maintainable.

---

## Current Repo Reality

- The repository currently couples filesystem work, Feishu API calls, token handling, and logging inside two Node scripts.
- No Obsidian runtime code exists yet.

That makes boundary discipline more important, not less: the first plugin implementation will set the pattern future work inherits.

---

## Ownership Split

| Concern | Obsidian-facing layer owns | Shared core owns |
|--------|-----------------------------|------------------|
| Plugin lifecycle | `onload`, `onunload`, command registration, settings tab registration | Nothing |
| User feedback | Notices, status bar, modals, summary views | Structured progress events and result objects |
| Settings UX | Rendering controls and wiring save/load actions | Validation rules and normalized config shape |
| Vault context | Resolving the active vault and mapping it into an adapter | Operating on normalized file descriptors or streams |
| OAuth browser handoff | Opening the browser and owning any plugin-specific callback adapter | Building auth requests and exchanging/refreshing tokens |
| Feishu API calls | Nothing UI-specific | HTTP request behavior, response handling, retries, and domain rules |
| Sync state persistence | Choosing the local persistence mechanism | Defining the state schema and when it updates |
| Logging | Deciding what users see | Emitting structured events without UI assumptions |

---

## Boundary Rules

### Obsidian Layer Rules

- May import `obsidian` APIs.
- May translate progress into notices, status bars, or modals.
- May resolve the active vault path or file access adapter.
- Must not embed Feishu API request details directly in command handlers.

### Shared Core Rules

- Must not import `obsidian`.
- Must not call `Notice`, `Modal`, or status bar APIs.
- Must not assume repo-root `config.json` or `state.json` file locations.
- Must not read from command palette state or workspace UI state.

### Adapter Rules

- Keep environment details at the edge.
- If desktop-only filesystem access is required, isolate that requirement behind a vault/filesystem adapter.
- If auth still depends on a localhost callback server, expose it as an adapter rather than hard-coding it into the plugin shell.

---

## What To Extract Before Building UI

The following behavior should become shared, testable modules before complex plugin UX is added:

- exclude-path matching
- normalized relative path rules
- token refresh flow
- folder discovery and creation behavior
- delete-before-upload replacement behavior
- state comparison using `size` and `mtimeMs`
- sync summary calculation

If these rules stay buried inside the future UI layer, every new command or automation feature will risk behavior drift.

---

## What Should Stay Obsidian-Specific

- command names and when they are enabled
- settings tab layout
- status bar wording
- modal design
- command routing from user intent to application service calls
- desktop/mobile capability gating

These details can change without redefining the sync contract.

---

## Anti-Drift Rules

- One sync core, many UI surfaces. Do not fork logic for settings-driven sync, command-driven sync, and future automation.
- One config normalization path. Do not validate the same setting differently in each UI surface.
- One progress vocabulary. UI surfaces should render the same underlying phases, not invent separate phase names per feature.
- One persistence contract for incremental state. Changing storage technology is fine; changing semantics without documentation is not.

---

## Forbidden Patterns

- Importing `obsidian` from Feishu API helpers
- Calling Feishu endpoints directly from the settings tab
- Letting UI components mutate sync state shape ad hoc
- Reading or writing repo-root standalone files from multiple new plugin modules
- Copying logic from `auth.js` or `sync.js` into commands instead of extracting it once
