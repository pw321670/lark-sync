# Obsidian Boundaries

> Purpose: define what belongs in Obsidian-facing plugin code versus the sync/runtime layers so the plugin stays maintainable.

---

## Current Repo Reality

- The repository has a complete Obsidian plugin implementation in `src/main.ts`, `src/settings/`, `src/oauth/*`, `src/sync/*`, and `src/ui/*`.
- The sync runtime is already plugin-native and receives vault access through injected callbacks.
- Boundary discipline still matters: future work should follow the current ownership split instead of reintroducing mixed layers.

---

## Ownership Split

| Concern | Obsidian-facing layer owns | Sync/runtime layers own |
|--------|-----------------------------|-------------------------|
| Plugin lifecycle | `onload`, `onunload`, command registration, settings tab registration | Nothing |
| User feedback | Notices, ribbon state, summary views | Structured progress events and result objects |
| Settings UX | Rendering controls and wiring save/load actions | Validation rules and normalized config shape |
| Vault context | Resolving the active vault and injecting file enumeration / reads | Operating on normalized file descriptors and content |
| OAuth browser handoff | Starting auth from UI | Auth URL building, callback handling, exchange, refresh |
| Feishu API calls | Nothing UI-specific | HTTP request behavior, retries, and domain rules |
| Sync state persistence | Choosing the local persistence mechanism | Defining the state schema and when it updates |
| Logging | Deciding what users see | Emitting structured errors/results without UI assumptions |

---

## Boundary Rules

### Obsidian Layer Rules

- May import `obsidian` APIs.
- May translate progress into notices or ribbon states.
- May resolve the active vault and inject callbacks into sync code.
- Must not embed Feishu API request details directly in command handlers or settings sections.

### Sync / OAuth Rules

- Must not import `Notice`, ribbon helpers, or settings DOM code.
- Must not depend on repository-root config/state files.
- Must not read from command palette state or workspace UI state.

### Adapter Rules

- Keep environment details at the edge.
- If desktop-only filesystem access is required, inject it through a callback or a small real adapter.
- Keep wrappers only when they hold a reusable contract, not when they just rename one call.

---

## What Should Stay Shared

These behaviors should live in shared runtime modules, not in UI code:

- include/exclude matching
- normalized relative path rules
- token refresh flow
- folder discovery and creation
- delete-before-upload replacement behavior
- state comparison using `size` and `mtimeMs`
- sync summary calculation

---

## What Should Stay Obsidian-Specific

- command names and enablement
- settings tab layout
- notice copy and ribbon visuals
- command routing from user intent to runtime calls
- desktop/mobile capability gating

These details can change without redefining the sync contract.

---

## Anti-Drift Rules

- One sync runtime, many UI surfaces. Do not fork logic for settings-driven sync, command-driven sync, and future automation.
- One config normalization path. Do not validate the same setting differently in each UI surface.
- One progress vocabulary. UI surfaces should render the same underlying phases.
- One persistence contract for incremental state. Changing storage technology is fine; changing semantics without documentation is not.

---

## Forbidden Patterns

- importing `obsidian` from low-level Feishu API helpers
- calling Feishu endpoints directly from the settings tab
- letting UI components mutate sync-state shape ad hoc
- copying sync logic into commands instead of extracting it once
- reintroducing removed repository-root runtime files as a second source of truth
