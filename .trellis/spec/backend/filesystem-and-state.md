# Filesystem And State

This document defines how the sync runtime discovers vault content, filters paths, and tracks incremental sync state in `state.json`.

## Source Anchors

- [`sync.js`](../../../sync.js)
  - `normalizeRelPath()`
  - `shouldExclude()`
  - `walkDir()`
  - `main()` state loading, change detection, and final `state.json` write
- [`config.example.json`](../../../config.example.json)
  - `vaultPath`
  - `exclude`
  - `maxDirectUploadMB`
- [`.gitignore`](../../../.gitignore): `state.json` is local-only runtime state

## Path Contract

Every path that leaves the local filesystem traversal and enters sync logic must be:

- relative to `config.vaultPath`
- normalized with `/` separators via `normalizeRelPath()`
- reused consistently for exclude checks, state keys, folder lookups, and logs

This cross-platform normalization is mandatory. A path like `Folder\\Note.md` on Windows must become `Folder/Note.md` before any matching or persistence happens.

## Exclude Semantics

`shouldExclude(relPath, excludeList)` matches on normalized relative paths using two rules:

- exact match: `normalized === item`
- subtree match: `normalized.startsWith(item + "/")`

Examples based on the current contract in `config.example.json`:

- `.trash` excludes `.trash` and everything below `.trash/...`
- `.obsidian/workspace.json` excludes only that file
- `.obsidian/workspaces.json` excludes only that file

There is no globbing, regex support, or case normalization beyond `/` separator normalization.

## Vault Scan Semantics

`walkDir(rootDir, currentDir, excludeList, result)` performs a synchronous recursive walk:

- directories are emitted as `{ type: "dir", absPath, relPath }`
- files are emitted as `{ type: "file", absPath, relPath }`
- excluded directories are skipped before recursion continues
- excluded files are skipped before they enter the result set

`sync.js main()` then splits the result into:

- `dirs`, sorted lexicographically by `relPath`
- `files`, sorted lexicographically by `relPath`

Folder creation depends on this stable sorting because parent directories must be processed before child directories and files.

## State Schema

`state.json` is optional input and a local output artifact. If the file does not exist, the runtime uses `{}`.

Current persisted shape:

```json
{
  "Folder/Note.md": {
    "size": 1234,
    "mtimeMs": 1711111111111,
    "uploadedAt": "2026-04-19T03:00:00.000Z"
  }
}
```

Rules:

- the key is the normalized vault-relative file path
- `size` comes from `fs.statSync(file.absPath).size`
- `mtimeMs` comes from `fs.statSync(file.absPath).mtimeMs`
- `uploadedAt` is written with `new Date().toISOString()` after a successful upload

## Change Detection

A file is treated as unchanged only when all of the following are true:

- a previous state entry exists for `state[relPath]`
- `prev.size === stat.size`
- `prev.mtimeMs === stat.mtimeMs`

If those checks pass, the file is skipped without any remote API calls.

## Current State Limitations

- `state.json` is written once at the end of the run, not after each uploaded file.
- Deleted local files are not pruned from Feishu Drive or from `state.json`.
- Files larger than `config.maxDirectUploadMB` are skipped and do not receive a fresh state entry for that run.
- Folder tokens are not persisted across runs; they are rebuilt in memory every sync.

These limitations are part of the current runtime behavior and must be changed deliberately, not accidentally.

## Migration Rules

- Do not switch state keys to absolute paths, platform-native separators, or remote file tokens.
- If `state.json` gains new fields, keep existing keys readable or define a migration step.
- If the filesystem layer moves into an Obsidian plugin host, preserve the normalized relative-path contract even if file access stops using Node's `fs`.
- Keep exclude matching centralized so traversal, sync, and UI previews cannot drift apart.

## Manual Verification

- Add nested directories and verify they appear in sorted, parent-first order during sync.
- Add an excluded directory such as `.trash` and verify neither the directory nor its descendants are uploaded.
- Re-run sync without changing a file and verify it is skipped based on `size` and `mtimeMs`.
- Modify a file's contents and verify its `state.json` entry receives a new `uploadedAt`.
- Test on Windows-style paths and verify the stored state keys still use `/`.
