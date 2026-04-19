# Sync Safety Guide

> Purpose: protect user content and user trust when changing sync behavior.

---

## Why This Guide Exists

This project performs remote side effects:
- creates folders in Feishu
- deletes remote files with matching names
- uploads local files
- refreshes and persists credentials
- records incremental sync state locally

Small mistakes here can create data loss, confusing duplicates, or false success messages.

---

## High-Risk Change Areas

Treat these as safety-critical:

- anything that changes `deleteFileByToken()` call sites
- any new retry loop around remote operations
- any change to the meaning of `state.json`
- any change to exclude matching or relative-path keys
- any new background or automatic sync trigger in the plugin layer

---

## Safety Rules

### 1. Be explicit about destructive operations

If a flow deletes and reuploads a remote file:
- document why that is necessary
- surface the behavior clearly in logs or UI
- never make it silent when user expectations depend on "update in place"

### 2. Do not mark state early

Only write success state after the remote side effect has succeeded.

For this repo, that means `state[relPath]` should remain coupled to successful upload completion, not just to local file inspection.

### 3. Preserve path identity

The same local file must resolve to the same normalized key before and after refactors.

If you change normalization or exclude rules:
- verify existing state keys still match
- verify folder mapping still lands in the same remote path

### 4. Separate user trust from transport success

A plugin notice such as "sync complete" must reflect the real outcome:
- success
- partial success
- blocked by auth/config
- failed remote operations

---

## Review Matrix

| Change Type | Minimum Review Question |
|-------------|--------------------------|
| Config field change | Will old config files still load safely? |
| Token flow change | Can refresh failure leave stale or empty credentials behind? |
| Exclude/path change | Will the same file still map to the same state key and folder path? |
| Upload/delete change | Can this produce duplicates or accidental remote deletion? |
| Plugin auto-sync change | Can this trigger side effects without a clear user action? |

---

## Manual Test Cases

Before shipping safety-sensitive changes, manually check:

- valid auth and normal upload flow
- expired or invalid refresh token
- excluded file or folder remains excluded
- unchanged file remains skipped
- modified file is re-synced exactly once
- remote failure does not get recorded as local success

---

## Release Rule

Prefer one conservative behavior that is well explained over a clever behavior that is hard to verify.
