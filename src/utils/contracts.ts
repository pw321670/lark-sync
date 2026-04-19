import { normalizeExcludeEntries } from './path-utils';

export type SyncMode = 'manual' | 'auto' | 'scheduled';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type FileMatchMode = 'exclude' | 'include';

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
}

export interface FeishuAuthState {
  userAccessToken: string;
  refreshToken: string;
  connectedAt: string | null;
  expiresAt: string | null;
}

export type SyncRunStatus = 'idle' | 'preview' | 'blocked' | 'success' | 'failed';

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
}

export interface LegacyStandaloneConfig {
  vaultPath: string;
  feishuRootFolderToken: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
  userAccessToken: string;
  refreshToken: string;
  exclude: string[];
  maxDirectUploadMB: number;
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
  },
  auth: {
    userAccessToken: '',
    refreshToken: '',
    connectedAt: null,
    expiresAt: null,
  },
  lastSync: null,
};

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function getPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
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
    },
    auth: {
      userAccessToken: getString(inputAuth.userAccessToken, base.auth.userAccessToken),
      refreshToken: getString(inputAuth.refreshToken, base.auth.refreshToken),
      connectedAt:
        inputAuth.connectedAt === null ? null : getString(inputAuth.connectedAt, '') || null,
      expiresAt: inputAuth.expiresAt === null ? null : getString(inputAuth.expiresAt, '') || null,
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

export function toLegacyConfig(data: PluginData, vaultPath: string): LegacyStandaloneConfig {
  return {
    vaultPath,
    feishuRootFolderToken: data.config.feishuRootFolderToken,
    appId: data.config.appId,
    appSecret: data.config.appSecret,
    redirectUri: data.config.redirectUri,
    userAccessToken: data.auth.userAccessToken,
    refreshToken: data.auth.refreshToken,
    exclude: normalizeExcludeEntries(data.config.exclude),
    maxDirectUploadMB: data.config.maxDirectUploadMB,
  };
}
