import { normalizeExcludeEntries } from './path-utils';
import type { RemoteFileRef, SyncStateMap } from '../sync/types';

export type SyncMode = 'manual' | 'auto' | 'scheduled';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type FileMatchMode = 'exclude' | 'include';
export type MarkdownSyncMode = 'file' | 'document';

export interface FeishuSyncConfig {
  feishuRootFolderToken: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
  fileMatchMode: FileMatchMode;
  exclude: string[];
  maxDirectUploadMB: number;
  syncMode: SyncMode;
  scheduledSyncInterval: number;
  concurrentUploads: number;
  retryAttempts: number;
  retryDelay: number;
  logLevel: LogLevel;
  markdownSyncMode: MarkdownSyncMode;
}

export interface FeishuAuthState {
  userAccessToken: string;
  refreshToken: string;
  connectedAt: string | null;
  expiresAt: string | null;
  grantedScopes: string[];
}

export type SyncRunStatus = 'idle' | 'preview' | 'blocked' | 'success' | 'partial' | 'failed';

export interface SyncSummary {
  status: SyncRunStatus;
  message: string;
  scannedAt: string;
  filesDiscovered: number;
  excludedCount: number;
  oversizedCount: number;
  candidateCount: number;
  uploadedCount: number;
  skippedUnchangedCount: number;
  failedPath: string | null;
}

export interface PluginData {
  config: FeishuSyncConfig;
  auth: FeishuAuthState;
  lastSync: SyncSummary | null;
  syncState: SyncStateMap;
}

export interface ConfigValidationResult {
  isValid: boolean;
  missingFields: string[];
  errors: string[];
  warnings: string[];
}

export const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:3333/callback';

export const DEFAULT_PLUGIN_DATA: PluginData = {
  config: {
    feishuRootFolderToken: '',
    appId: '',
    appSecret: '',
    redirectUri: DEFAULT_REDIRECT_URI,
    fileMatchMode: 'exclude',
    exclude: ['.trash', '.obsidian/workspace.json', '.obsidian/workspaces.json'],
    maxDirectUploadMB: 20,
    syncMode: 'manual',
    scheduledSyncInterval: 30,
    concurrentUploads: 3,
    retryAttempts: 3,
    retryDelay: 1000,
    logLevel: 'info',
    markdownSyncMode: 'document',
  },
  auth: {
    userAccessToken: '',
    refreshToken: '',
    connectedAt: null,
    expiresAt: null,
    grantedScopes: [],
  },
  lastSync: null,
  syncState: {},
};

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function hasOwn(record: Record<string, unknown> | undefined, key: string): boolean {
  return !!record && Object.prototype.hasOwnProperty.call(record, key);
}

function pickByPresence<T>(primary: T, fallback: T, hasPrimary: boolean): T {
  return hasPrimary ? primary : fallback;
}

function mergeFileStateMaps(
  primary: SyncStateMap,
  fallback: SyncStateMap,
  primaryRawState?: Record<string, unknown>,
): SyncStateMap {
  const merged: SyncStateMap = { ...fallback };

  for (const [relPath, primaryEntry] of Object.entries(primary)) {
    const fallbackEntry = fallback[relPath];
    if (!fallbackEntry) {
      merged[relPath] = primaryEntry;
      continue;
    }

    const rawEntry = getRecord(primaryRawState?.[relPath]);
    merged[relPath] = {
      size: pickByPresence(primaryEntry.size, fallbackEntry.size, hasOwn(rawEntry, 'size')),
      mtimeMs: pickByPresence(primaryEntry.mtimeMs, fallbackEntry.mtimeMs, hasOwn(rawEntry, 'mtimeMs')),
      uploadedAt: pickByPresence(
        primaryEntry.uploadedAt,
        fallbackEntry.uploadedAt,
        hasOwn(rawEntry, 'uploadedAt'),
      ),
      remote: pickByPresence(
        primaryEntry.remote,
        fallbackEntry.remote,
        hasOwn(rawEntry, 'remote'),
      ),
    };
  }

  return merged;
}

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function getPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function getRemoteFileRef(value: unknown): RemoteFileRef | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const input = value as Partial<RemoteFileRef>;
  if (input.type !== 'document') {
    return undefined;
  }

  const token = getString(input.token);
  if (!token) {
    return undefined;
  }

  const title = getString(input.title);
  const parentFolderToken = getString(input.parentFolderToken);
  const url = getString(input.url);

  return {
    type: 'document',
    token,
    ...(title ? { title } : {}),
    ...(parentFolderToken ? { parentFolderToken } : {}),
    ...(url ? { url } : {}),
  };
}

export function mergePluginData(raw: unknown): PluginData {
  const base = DEFAULT_PLUGIN_DATA;
  if (!raw || typeof raw !== 'object') {
    return base;
  }

  const input = raw as Partial<PluginData>;
  const inputConfig =
    input.config && typeof input.config === 'object'
      ? (input.config as Partial<FeishuSyncConfig>)
      : {};
  const inputAuth =
    input.auth && typeof input.auth === 'object'
      ? (input.auth as Partial<FeishuAuthState>)
      : {};
  const inputLastSync = input.lastSync && typeof input.lastSync === 'object' ? input.lastSync : null;
  const inputSyncState =
    input.syncState && typeof input.syncState === 'object'
      ? (input.syncState as SyncStateMap)
      : base.syncState;

  return {
    config: {
      feishuRootFolderToken: getString(
        inputConfig.feishuRootFolderToken,
        base.config.feishuRootFolderToken,
      ),
      appId: getString(inputConfig.appId, base.config.appId),
      appSecret: getString(inputConfig.appSecret, base.config.appSecret),
      redirectUri: getString(inputConfig.redirectUri, base.config.redirectUri),
      fileMatchMode:
        inputConfig.fileMatchMode === 'exclude' || inputConfig.fileMatchMode === 'include'
          ? inputConfig.fileMatchMode
          : base.config.fileMatchMode,
      exclude: normalizeExcludeEntries(
        Array.isArray(inputConfig.exclude) ? inputConfig.exclude : base.config.exclude,
      ),
      maxDirectUploadMB: getPositiveNumber(
        inputConfig.maxDirectUploadMB,
        base.config.maxDirectUploadMB,
      ),
      syncMode:
        inputConfig.syncMode === 'manual' ||
        inputConfig.syncMode === 'auto' ||
        inputConfig.syncMode === 'scheduled'
          ? inputConfig.syncMode
          : base.config.syncMode,
      scheduledSyncInterval: getPositiveNumber(
        inputConfig.scheduledSyncInterval,
        base.config.scheduledSyncInterval,
      ),
      concurrentUploads: Math.min(
        Math.max(getPositiveNumber(inputConfig.concurrentUploads, base.config.concurrentUploads), 1),
        10,
      ),
      retryAttempts: Math.min(
        Math.max(getPositiveNumber(inputConfig.retryAttempts, base.config.retryAttempts), 0),
        10,
      ),
      retryDelay: Math.min(
        Math.max(getPositiveNumber(inputConfig.retryDelay, base.config.retryDelay), 100),
        60_000,
      ),
      logLevel:
        inputConfig.logLevel === 'error' ||
        inputConfig.logLevel === 'warn' ||
        inputConfig.logLevel === 'info' ||
        inputConfig.logLevel === 'debug'
          ? inputConfig.logLevel
          : base.config.logLevel,
      markdownSyncMode:
        inputConfig.markdownSyncMode === 'file' || inputConfig.markdownSyncMode === 'document'
          ? inputConfig.markdownSyncMode
          : base.config.markdownSyncMode,
    },
    auth: {
      userAccessToken: getString(inputAuth.userAccessToken, base.auth.userAccessToken),
      refreshToken: getString(inputAuth.refreshToken, base.auth.refreshToken),
      connectedAt:
        inputAuth.connectedAt === null ? null : getString(inputAuth.connectedAt, '') || null,
      expiresAt: inputAuth.expiresAt === null ? null : getString(inputAuth.expiresAt, '') || null,
      grantedScopes: Array.isArray(inputAuth.grantedScopes) ? inputAuth.grantedScopes : base.auth.grantedScopes,
    },
    lastSync: inputLastSync
      ? {
          status: (inputLastSync.status as SyncRunStatus) ?? 'idle',
          message: getString(inputLastSync.message),
          scannedAt: getString(inputLastSync.scannedAt),
          filesDiscovered: getPositiveNumber(inputLastSync.filesDiscovered, 0),
          excludedCount: getPositiveNumber(inputLastSync.excludedCount, 0),
          oversizedCount: getPositiveNumber(inputLastSync.oversizedCount, 0),
          candidateCount: getPositiveNumber(inputLastSync.candidateCount, 0),
          uploadedCount: getPositiveNumber(inputLastSync.uploadedCount, 0),
          skippedUnchangedCount: getPositiveNumber(inputLastSync.skippedUnchangedCount, 0),
          failedPath:
            inputLastSync.failedPath === null ? null : getString(inputLastSync.failedPath),
        }
      : null,
    syncState: Object.fromEntries(
      Object.entries(inputSyncState).flatMap(([relPath, entry]) => {
        if (!entry || typeof entry !== 'object') {
          return [];
        }

        return [
          [
            relPath,
            {
              size: getPositiveNumber((entry as { size?: unknown }).size, 0),
              mtimeMs: getPositiveNumber((entry as { mtimeMs?: unknown }).mtimeMs, 0),
              uploadedAt: getString((entry as { uploadedAt?: unknown }).uploadedAt),
              remote: getRemoteFileRef((entry as { remote?: unknown }).remote),
            },
          ],
        ];
      }),
    ),
  };
}

export function mergePluginDataWithFallback(primaryRaw: unknown, fallbackRaw: unknown): PluginData {
  const primary = mergePluginData(primaryRaw);
  const fallback = mergePluginData(fallbackRaw);

  const primaryRoot = getRecord(primaryRaw);
  const primaryConfig = getRecord(primaryRoot?.config);
  const primaryAuth = getRecord(primaryRoot?.auth);
  const primarySyncState = getRecord(primaryRoot?.syncState);

  return {
    config: {
      feishuRootFolderToken: pickByPresence(
        primary.config.feishuRootFolderToken,
        fallback.config.feishuRootFolderToken,
        hasOwn(primaryConfig, 'feishuRootFolderToken'),
      ),
      appId: pickByPresence(primary.config.appId, fallback.config.appId, hasOwn(primaryConfig, 'appId')),
      appSecret: pickByPresence(
        primary.config.appSecret,
        fallback.config.appSecret,
        hasOwn(primaryConfig, 'appSecret'),
      ),
      redirectUri: pickByPresence(
        primary.config.redirectUri,
        fallback.config.redirectUri,
        hasOwn(primaryConfig, 'redirectUri'),
      ),
      fileMatchMode: pickByPresence(
        primary.config.fileMatchMode,
        fallback.config.fileMatchMode,
        hasOwn(primaryConfig, 'fileMatchMode'),
      ),
      exclude: pickByPresence(primary.config.exclude, fallback.config.exclude, hasOwn(primaryConfig, 'exclude')),
      maxDirectUploadMB: pickByPresence(
        primary.config.maxDirectUploadMB,
        fallback.config.maxDirectUploadMB,
        hasOwn(primaryConfig, 'maxDirectUploadMB'),
      ),
      syncMode: pickByPresence(
        primary.config.syncMode,
        fallback.config.syncMode,
        hasOwn(primaryConfig, 'syncMode'),
      ),
      scheduledSyncInterval: pickByPresence(
        primary.config.scheduledSyncInterval,
        fallback.config.scheduledSyncInterval,
        hasOwn(primaryConfig, 'scheduledSyncInterval'),
      ),
      concurrentUploads: pickByPresence(
        primary.config.concurrentUploads,
        fallback.config.concurrentUploads,
        hasOwn(primaryConfig, 'concurrentUploads'),
      ),
      retryAttempts: pickByPresence(
        primary.config.retryAttempts,
        fallback.config.retryAttempts,
        hasOwn(primaryConfig, 'retryAttempts'),
      ),
      retryDelay: pickByPresence(
        primary.config.retryDelay,
        fallback.config.retryDelay,
        hasOwn(primaryConfig, 'retryDelay'),
      ),
      logLevel: pickByPresence(
        primary.config.logLevel,
        fallback.config.logLevel,
        hasOwn(primaryConfig, 'logLevel'),
      ),
      markdownSyncMode: pickByPresence(
        primary.config.markdownSyncMode,
        fallback.config.markdownSyncMode,
        hasOwn(primaryConfig, 'markdownSyncMode'),
      ),
    },
    auth: {
      userAccessToken: pickByPresence(
        primary.auth.userAccessToken,
        fallback.auth.userAccessToken,
        hasOwn(primaryAuth, 'userAccessToken'),
      ),
      refreshToken: pickByPresence(
        primary.auth.refreshToken,
        fallback.auth.refreshToken,
        hasOwn(primaryAuth, 'refreshToken'),
      ),
      connectedAt: pickByPresence(
        primary.auth.connectedAt,
        fallback.auth.connectedAt,
        hasOwn(primaryAuth, 'connectedAt'),
      ),
      expiresAt: pickByPresence(
        primary.auth.expiresAt,
        fallback.auth.expiresAt,
        hasOwn(primaryAuth, 'expiresAt'),
      ),
      grantedScopes: pickByPresence(
        primary.auth.grantedScopes,
        fallback.auth.grantedScopes,
        hasOwn(primaryAuth, 'grantedScopes'),
      ),
    },
    lastSync: pickByPresence(primary.lastSync, fallback.lastSync, hasOwn(primaryRoot, 'lastSync')),
    syncState: mergeFileStateMaps(primary.syncState, fallback.syncState, primarySyncState),
  };
}

export function getMissingConfigFields(config: FeishuSyncConfig): string[] {
  const missing: string[] = [];

  if (!config.feishuRootFolderToken.trim()) {
    missing.push('feishuRootFolderToken');
  }
  if (!config.appId.trim()) {
    missing.push('appId');
  }
  if (!config.appSecret.trim()) {
    missing.push('appSecret');
  }
  if (!config.redirectUri.trim()) {
    missing.push('redirectUri');
  }

  return missing;
}

export function validateConfig(config: FeishuSyncConfig): ConfigValidationResult {
  const result: ConfigValidationResult = {
    isValid: true,
    missingFields: [],
    errors: [],
    warnings: [],
  };

  const missing = getMissingConfigFields(config);
  result.missingFields = missing;

  if (missing.length > 0) {
    result.isValid = false;
    result.errors.push(`Missing required fields: ${missing.join(', ')}`);
  }

  if (config.appId && !config.appId.startsWith('cli_')) {
    result.warnings.push("App ID should typically start with 'cli_'");
  }

  if (config.redirectUri) {
    try {
      new URL(config.redirectUri);
    } catch {
      result.errors.push('Redirect URI is not a valid URL');
      result.isValid = false;
    }
  }

  if (config.maxDirectUploadMB < 1) {
    result.warnings.push('Max direct upload size is very small (less than 1MB)');
  }

  if (config.syncMode === 'scheduled' && config.scheduledSyncInterval < 5) {
    result.warnings.push('Scheduled sync interval is very short (less than 5 minutes)');
  }

  if (config.concurrentUploads > 5) {
    result.warnings.push('High concurrent uploads may cause rate limiting');
  }

  return result;
}
