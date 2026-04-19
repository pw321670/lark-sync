# Obsidian Feishu Codebase Simplification Pass

## Goal

Review the external "over-design" feedback against the current plugin codebase, then execute a targeted simplification pass that removes proven complexity without breaking the current Obsidian plugin flow, OAuth lifecycle, or Feishu sync behavior.

## What I Already Know

- The external review is directionally correct that the codebase still has meaningful simplification room.
- The review is also too line-count-driven in places and proposes a few cuts that should be staged or narrowed instead of applied blindly.
- Current measured hotspots in the repo:
  - `src/sync/sync-coordinator.ts`: 490 lines
  - `src/oauth/token-manager.ts`: 205 lines
  - `src/utils/contracts.ts`: 278 lines
  - `src/settings/sections.ts`: 306 lines
  - `src/settings/actions.ts`: 120 lines
- `SyncCoordinator` currently carries:
  - five listener types (`progress`, `completion`, `error`, `status`, `log`)
  - session object + state/status bookkeeping
  - pause/resume/cancel support
  - explicit wait loops for paused state
- `main.ts` currently uses:
  - `onComplete`
  - `onError`
  - `pauseSync`
  - `resumeSync`
  - `cancelSync`
- `TokenManager` currently carries:
  - refresh single-flight guard (`refreshPromise`)
  - retry loop
  - timeout wrapper
  - `validateCurrentToken`
  - `getAuthStatus`
  - `forceRefresh`
- `FeishuOAuth` currently still depends on `validateCurrentToken()` and `forceRefresh()`, so those methods are not yet dead code.
- Settings were already split structurally, but the total UI/control surface is still larger than needed for a personal plugin.
- `ObsidianVaultAdapter` and `ObsidianFileReader` are thin wrappers over the actual Obsidian APIs and are reasonable candidates for collapse.

## Review Outcome

### Accept

- Simplify `SyncCoordinator` substantially.
- Remove low-value listeners from `SyncCoordinator` (`status`, `log`).
- Re-evaluate whether pause/resume should exist at all in this plugin.
- Collapse Obsidian-specific adapter wrappers unless they still provide concrete value after simplification.
- Reduce the settings surface, especially low-value maintenance features for a personal plugin.
- Trim `contracts.ts` so it no longer acts as a dumping ground for all config, validation, export/import, and legacy bridge helpers.

### Partially Accept

- Simplify `TokenManager`, but do not remove protection that still solves a real problem.
  - Keep: timeout handling, basic retry, single-flight refresh guard if concurrent calls remain possible.
  - Reassess: `validateCurrentToken`, `getAuthStatus`, `forceRefresh` based on actual remaining call sites.
- Simplify settings descriptions, but keep enough guidance for the required Feishu fields and sync rules.
- Consider `p-limit` only if it makes the upload path materially clearer; avoid dependency churn just to save lines.

### Reject / Defer

- Do not optimize to an arbitrary target like "1350 total lines" or "2.7x legacy".
- Do not use legacy line count as the primary design bar; legacy code is the behavioral anchor, not the architecture budget.
- Do not remove retries just because the legacy script was shorter.
- Do not perform a ground-up rewrite of sync and OAuth in one pass if a staged reduction can get most of the benefit with less risk.

## Requirements

- The simplification pass must be behavior-preserving for the currently working plugin flow.
- The first pass must focus on deleting or collapsing features that are high-complexity and low-value today.
- The first pass must not add new product behavior.
- The first pass must keep the current OAuth lifecycle working in Obsidian desktop runtime.
- The first pass must keep the current sync behavior working:
  - discover files from the active vault
  - filter by rules
  - detect changes
  - ensure Feishu folders
  - upload changed files
- The first pass must keep current manual sync UX working from the ribbon button and commands.

### Scope For The First Approved Pass

- Simplify `SyncCoordinator` API and internal state model.
- Remove `status` and `log` listeners.
- Decide whether `pauseSync` and `resumeSync` stay or are removed end-to-end.
- Remove or inline `ObsidianVaultAdapter` and `ObsidianFileReader` if they no longer justify themselves.
- Shrink `TokenManager` by removing truly low-value surface area and simplifying control flow.
- Reduce settings complexity, with special attention to config import/export/reset.
- Break `contracts.ts` into clearer concerns or delete low-value helpers from it.

## Acceptance Criteria

- [x] There is a written decision on each external suggestion: accept, partial accept, reject, or defer.
- [x] `SyncCoordinator` no longer exposes unused listener types.
- [x] If pause/resume is removed, all related commands, notifications, and coordinator code are removed together.
- [x] Obsidian vault access no longer uses wrapper classes unless a retained wrapper has a documented reason.
- [x] `TokenManager` is smaller and easier to follow, without regressing refresh behavior.
- [x] The settings UI keeps required config and auth actions, but unnecessary maintenance controls are removed or demoted.
- [x] `contracts.ts` no longer mixes unrelated responsibilities without a reason.
- [x] `npm run build` still passes.
- [x] Manual plugin test paths remain intact: authorize, test connection, sync, clear auth.

## Definition Of Done

- The approved simplification scope is implemented without behavior regression in the current plugin flow.
- Typecheck/build passes.
- Specs are updated where cross-layer contracts changed.
- The resulting code removes concepts, not just shuffles them around.
- Any removed UX affordance is intentional and documented in the task notes / PRD.

## Technical Approach

### Recommended Strategy: Targeted Reduction, Not Rewrite

Use a staged simplification pass with explicit deletion targets.

#### Stage 1: Remove Low-Value Surface Area

- Remove `status` and `log` listeners from `SyncCoordinator`.
- Remove pause/resume if we decide it is not worth keeping.
- Remove related command wiring and notification branches in `main.ts` and `ui/`.
- Remove settings import/export if the user confirms they are not needed for this personal plugin workflow.

#### Stage 2: Collapse Obsidian-Specific Indirection

- Replace `ObsidianVaultAdapter` and `ObsidianFileReader` with direct Obsidian API usage inside the sync integration layer, or collapse them into one very small helper local to plugin wiring.

#### Stage 3: Simplify Core Runtime Modules

- Reduce `SyncCoordinator` to the smallest state model that still supports current UX.
- Revisit whether `startSync()` should remain fire-and-forget with callbacks or become a simpler promise-returning flow.
- Reduce `TokenManager` surface based on actual caller needs after coordinator/settings cleanup.

#### Stage 4: Reduce Config/Settings Footprint

- Remove or demote low-value maintenance settings.
- Separate runtime contracts from UI import/export helpers.
- Keep only the validation rules that protect real user failure modes.

## Decision (ADR-lite)

**Context**

The current codebase has already moved from scaffold to working plugin, but some parts still reflect earlier "future-proof" design choices that are not yet paying for themselves. An external review correctly identified major complexity hotspots, but its proposed solution is too aggressive in a few places and uses line counts as a proxy for quality.

**Decision**

Proceed with a targeted simplification pass that removes clearly unjustified complexity first, while preserving working behavior and avoiding a full rewrite.

**Consequences**

- Lower implementation risk than a full architecture reset.
- We should get most of the readability and maintainability benefit in one pass.
- Some abstractions may survive the first pass if they still serve a real boundary after other deletions.
- We avoid chasing arbitrary line-count goals and instead optimize for fewer concepts and clearer control flow.

## Out Of Scope

- Rebuilding the sync engine around Web Workers in this task.
- Re-architecting the plugin for marketplace distribution.
- Introducing a new dependency purely for code-golf reasons.
- Matching the legacy script's line count.
- Broad product feature additions.

## Technical Notes

### Current Files Most Likely To Change

- `src/main.ts`
- `src/sync/sync-coordinator.ts`
- `src/sync/obsidian-adapter.ts`
- `src/sync/index.ts`
- `src/oauth/token-manager.ts`
- `src/oauth/feishu-oauth.ts`
- `src/settings/sections.ts`
- `src/settings/actions.ts`
- `src/utils/contracts.ts`

### Known Review Questions To Resolve Before Implementation

- Should config import/export stay for your personal workflow, or can it be removed now?
- Should reset-to-defaults stay as a convenience action, or be removed with import/export?
- Do we want to keep cancel-only sync control, or keep pause/resume too?

### Practical Success Metric

Success is not "smallest possible code". Success is:

- fewer moving parts
- fewer concepts to hold in working memory
- fewer low-value abstractions
- same or better plugin reliability
