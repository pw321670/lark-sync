import type { FeishuSyncConfig, FeishuAuthState } from '../utils/contracts';
import type { SyncResult } from './types';
import type { SyncSummary as UiSyncSummary } from '../ui/notification-manager';

export interface SyncConfigBuilderOptions {
  config: FeishuSyncConfig;
  auth: FeishuAuthState;
}

export function buildSyncConfig(options: SyncConfigBuilderOptions) {
  const { config, auth } = options;

  return {
    feishuRootFolderToken: config.feishuRootFolderToken,
    userAccessToken: auth.userAccessToken,
    fileMatchMode: config.fileMatchMode,
    matchList: config.exclude,
    maxDirectUploadMB: config.maxDirectUploadMB,
    concurrentUploads: config.concurrentUploads,
    retryAttempts: config.retryAttempts,
    retryDelay: config.retryDelay,
    logLevel: config.logLevel,
    markdownSyncMode: config.markdownSyncMode,
  };
}

export function toUiSyncSummary(result: SyncResult): UiSyncSummary {
  const status = !result.success ? 'failed' : result.failedCount > 0 ? 'partial' : 'success';

  return {
    status,
    startTime: result.duration ? Date.now() - result.duration : undefined,
    endTime: Date.now(),
    filesScanned: result.filesDiscovered,
    uploadedCount: result.uploadedCount,
    skippedCount: result.skippedCount,
    failedCount: result.failedCount,
    firstFailedPath: result.failedFiles[0]?.path,
    errorMessage: result.error,
  };
}
