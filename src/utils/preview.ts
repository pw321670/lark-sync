import type { SyncSummary } from "./contracts";
import { normalizeExcludeEntries, normalizeRelPath, shouldExclude } from "./path-utils";

export interface VaultFileDescriptor {
  path: string;
  size: number;
}

export function buildSyncPreview(
  files: VaultFileDescriptor[],
  excludeList: string[],
  maxDirectUploadMB: number,
  now = new Date()
): SyncSummary {
  const normalizedExcludeList = normalizeExcludeEntries(excludeList);
  const maxBytes = maxDirectUploadMB * 1024 * 1024;

  let excludedCount = 0;
  let oversizedCount = 0;
  let candidateCount = 0;

  for (const file of files) {
    const relPath = normalizeRelPath(file.path);

    if (shouldExclude(relPath, normalizedExcludeList)) {
      excludedCount += 1;
      continue;
    }

    if (file.size > maxBytes) {
      oversizedCount += 1;
      continue;
    }

    candidateCount += 1;
  }

  return {
    status: "preview",
    message: `Previewed ${files.length} file(s) for Lark Sync.`,
    scannedAt: now.toISOString(),
    filesDiscovered: files.length,
    excludedCount,
    oversizedCount,
    candidateCount,
    uploadedCount: 0,
    skippedUnchangedCount: 0,
    failedPath: null
  };
}
