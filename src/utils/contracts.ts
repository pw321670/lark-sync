import { normalizeExcludeEntries } from "./path-utils";

export type SyncMode = 'manual' | 'auto' | 'scheduled';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type FileMatchMode = 'exclude' | 'include';

export interface FeishuSyncConfig {
  // 飞书应用配置
  feishuRootFolderToken: string;
  appId: string;
  appSecret: string;
  redirectUri: string;

  // 同步策略配置
  fileMatchMode: 'exclude' | 'include'; // 文件匹配模式：排除 vs 白名单
  exclude: string[]; // 根据模式，含义不同：排除模式=排除列表，白名单模式=包含列表
  maxDirectUploadMB: number;
  syncMode: SyncMode;
  scheduledSyncInterval: number; // 分钟

  // 高级配置
  concurrentUploads: number;
  retryAttempts: number;
  retryDelay: number; // 毫秒
  logLevel: LogLevel;
}

export interface FeishuAuthState {
  userAccessToken: string;
  refreshToken: string;
  connectedAt: string | null;
  expiresAt: string | null;
}

export type SyncRunStatus = "idle" | "preview" | "blocked" | "success" | "failed";

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

export const DEFAULT_REDIRECT_URI = "http://127.0.0.1:3333/callback";

export const DEFAULT_PLUGIN_DATA: PluginData = {
  config: {
    // 飞书应用配置
    feishuRootFolderToken: "",
    appId: "",
    appSecret: "",
    redirectUri: DEFAULT_REDIRECT_URI,

    // 同步策略配置
    fileMatchMode: "exclude", // 默认使用排除模式
    exclude: [
      ".trash",
      ".obsidian/workspace.json",
      ".obsidian/workspaces.json"
    ],
    maxDirectUploadMB: 20,
    syncMode: "manual",
    scheduledSyncInterval: 30,

    // 高级配置
    concurrentUploads: 3,
    retryAttempts: 3,
    retryDelay: 1000,
    logLevel: "info"
  },
  auth: {
    userAccessToken: "",
    refreshToken: "",
    connectedAt: null,
    expiresAt: null
  },
  lastSync: null
};

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function getPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function mergePluginData(raw: unknown): PluginData {
  const base = DEFAULT_PLUGIN_DATA;
  if (!raw || typeof raw !== "object") {
    return base;
  }

  const input = raw as Partial<PluginData>;
  const inputConfig = (input.config && typeof input.config === "object" ? input.config : {}) as Partial<FeishuSyncConfig>;
  const inputAuth = (input.auth && typeof input.auth === "object" ? input.auth : {}) as Partial<FeishuAuthState>;
  const inputLastSync = input.lastSync && typeof input.lastSync === "object" ? input.lastSync : null;

  return {
    config: {
      // 飞书应用配置
      feishuRootFolderToken: getString(inputConfig.feishuRootFolderToken, base.config.feishuRootFolderToken),
      appId: getString(inputConfig.appId, base.config.appId),
      appSecret: getString(inputConfig.appSecret, base.config.appSecret),
      redirectUri: getString(inputConfig.redirectUri, base.config.redirectUri),

      // 同步策略配置
      fileMatchMode: (inputConfig.fileMatchMode === "exclude" || inputConfig.fileMatchMode === "include")
        ? inputConfig.fileMatchMode
        : base.config.fileMatchMode,
      exclude: normalizeExcludeEntries(Array.isArray(inputConfig.exclude) ? inputConfig.exclude : base.config.exclude),
      maxDirectUploadMB: getPositiveNumber(inputConfig.maxDirectUploadMB, base.config.maxDirectUploadMB),
      syncMode: (inputConfig.syncMode === "manual" || inputConfig.syncMode === "auto" || inputConfig.syncMode === "scheduled")
        ? inputConfig.syncMode
        : base.config.syncMode,
      scheduledSyncInterval: getPositiveNumber(inputConfig.scheduledSyncInterval, base.config.scheduledSyncInterval),

      // 高级配置
      concurrentUploads: Math.min(Math.max(getPositiveNumber(inputConfig.concurrentUploads, base.config.concurrentUploads), 1), 10),
      retryAttempts: Math.min(Math.max(getPositiveNumber(inputConfig.retryAttempts, base.config.retryAttempts), 0), 10),
      retryDelay: Math.min(Math.max(getPositiveNumber(inputConfig.retryDelay, base.config.retryDelay), 100), 60000),
      logLevel: (inputConfig.logLevel === "error" || inputConfig.logLevel === "warn" || inputConfig.logLevel === "info" || inputConfig.logLevel === "debug")
        ? inputConfig.logLevel
        : base.config.logLevel
    },
    auth: {
      userAccessToken: getString(inputAuth.userAccessToken, base.auth.userAccessToken),
      refreshToken: getString(inputAuth.refreshToken, base.auth.refreshToken),
      connectedAt: inputAuth.connectedAt === null ? null : getString(inputAuth.connectedAt, "") || null,
      expiresAt: inputAuth.expiresAt === null ? null : getString(inputAuth.expiresAt, "") || null
    },
    lastSync: inputLastSync
      ? {
          status: (inputLastSync.status as SyncRunStatus) ?? "idle",
          message: getString(inputLastSync.message),
          scannedAt: getString(inputLastSync.scannedAt),
          filesDiscovered: getPositiveNumber(inputLastSync.filesDiscovered, 0),
          excludedCount: getPositiveNumber(inputLastSync.excludedCount, 0),
          oversizedCount: getPositiveNumber(inputLastSync.oversizedCount, 0),
          candidateCount: getPositiveNumber(inputLastSync.candidateCount, 0),
          uploadedCount: getPositiveNumber(inputLastSync.uploadedCount, 0),
          skippedUnchangedCount: getPositiveNumber(inputLastSync.skippedUnchangedCount, 0),
          failedPath: inputLastSync.failedPath === null ? null : getString(inputLastSync.failedPath)
        }
      : null
  };
}

export function getMissingConfigFields(config: FeishuSyncConfig): string[] {
  const missing: string[] = [];

  if (!config.feishuRootFolderToken.trim()) {
    missing.push("feishuRootFolderToken");
  }
  if (!config.appId.trim()) {
    missing.push("appId");
  }
  if (!config.appSecret.trim()) {
    missing.push("appSecret");
  }
  if (!config.redirectUri.trim()) {
    missing.push("redirectUri");
  }

  return missing;
}

/**
 * 配置验证结果
 */
export interface ConfigValidationResult {
  isValid: boolean;
  missingFields: string[];
  errors: string[];
  warnings: string[];
}

/**
 * 验证配置完整性和正确性
 */
export function validateConfig(config: FeishuSyncConfig): ConfigValidationResult {
  const result: ConfigValidationResult = {
    isValid: true,
    missingFields: [],
    errors: [],
    warnings: []
  };

  // 检查必填字段
  const missing = getMissingConfigFields(config);
  result.missingFields = missing;

  if (missing.length > 0) {
    result.isValid = false;
    result.errors.push(`Missing required fields: ${missing.join(", ")}`);
  }

  // 验证 App ID 格式（cli_xxxxxxxxx）
  if (config.appId && !config.appId.startsWith("cli_")) {
    result.warnings.push("App ID should typically start with 'cli_'");
  }

  // 验证 Redirect URI 格式
  if (config.redirectUri) {
    try {
      new URL(config.redirectUri);
    } catch {
      result.errors.push("Redirect URI is not a valid URL");
      result.isValid = false;
    }
  }

  // 验证文件大小限制
  if (config.maxDirectUploadMB < 1) {
    result.warnings.push("Max direct upload size is very small (less than 1MB)");
  }

  // 验证同步间隔
  if (config.syncMode === "scheduled" && config.scheduledSyncInterval < 5) {
    result.warnings.push("Scheduled sync interval is very short (less than 5 minutes)");
  }

  // 验证并发上传数量
  if (config.concurrentUploads > 5) {
    result.warnings.push("High concurrent uploads may cause rate limiting");
  }

  return result;
}

/**
 * 配置导入导出数据结构
 */
export interface ConfigExport {
  version: string;
  exportedAt: string;
  config: Partial<FeishuSyncConfig>;
}

/**
 * 导出配置为 JSON
 */
export function exportConfig(config: FeishuSyncConfig): string {
  const exportData: ConfigExport = {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    config: {
      // 飞书应用配置
      appId: config.appId,
      appSecret: config.appSecret,
      feishuRootFolderToken: config.feishuRootFolderToken,
      redirectUri: config.redirectUri,

      // 同步策略配置
      exclude: config.exclude,
      maxDirectUploadMB: config.maxDirectUploadMB,
      syncMode: config.syncMode,
      scheduledSyncInterval: config.scheduledSyncInterval,

      // 高级配置
      concurrentUploads: config.concurrentUploads,
      retryAttempts: config.retryAttempts,
      retryDelay: config.retryDelay,
      logLevel: config.logLevel
    }
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * 从 JSON 导入配置
 */
export function importConfig(jsonString: string): { success: boolean; config?: Partial<FeishuSyncConfig>; error?: string } {
  try {
    const data = JSON.parse(jsonString) as ConfigExport;

    if (!data.config || typeof data.config !== "object") {
      return { success: false, error: "Invalid config format: missing config object" };
    }

    return { success: true, config: data.config };
  } catch (e) {
    return { success: false, error: `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
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
    maxDirectUploadMB: data.config.maxDirectUploadMB
  };
}
