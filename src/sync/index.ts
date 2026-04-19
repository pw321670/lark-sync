/**
 * 同步引擎模块导出
 *
 * 本模块提供完整的文件同步功能，支持：
 * - 文件扫描和变化检测
 * - 异步同步流程（不使用 Web Worker，适用于 Obsidian 插件环境）
 * - 增量上传管理和并发控制
 * - 进度跟踪和通知
 * - 错误处理和恢复
 */

// ========================================================================
// 类型导出
// ========================================================================

export * from './types';

// ========================================================================
// 文件扫描器
// ========================================================================

export { FileScanner } from './file-scanner';
export type {
  ScanOptions,
  ScanResult,
} from './file-scanner';

export {
  formatFileSize,
  formatDuration,
} from './file-scanner';

// ========================================================================
// Vault 扫描器 (Obsidian API)
// ========================================================================

export { VaultScanner } from './scanner';
export type {
  VaultScanOptions,
  VaultScanResult,
} from './scanner';

export {
  formatScanSummary,
} from './scanner';

// ========================================================================
// 文件过滤器
// ========================================================================

export { FileFilter, createFileFilter, filterFiles, shouldExcludePath } from './filter';
export type {
  FileFilterConfig,
  FileFilterResult,
} from './filter';

export {
  DEFAULT_EXCLUDE_PATTERNS,
  createDefaultFilter,
  createIncludeFilter,
} from './filter';

// ========================================================================
// 进度跟踪器
// ========================================================================

export { ProgressTracker, createProgressTracker } from './progress';
export type {
  ProgressPhase,
  ProgressEventType,
  ProgressEventData,
  ProgressEventListener,
  ProgressTrackerConfig,
} from './progress';

export {
  calculatePercentage,
  formatProgressBar,
  formatProgressSummary,
} from './progress';

// ========================================================================
// 飞书客户端
// ========================================================================

export { FeishuClient } from './feishu-client';
export type {
  FeishuClientConfig,
} from './feishu-client';

// ========================================================================
// 飞书 API 客户端
// ========================================================================

export { FeishuApiClient } from './feishu-api';
export type {
  FeishuApiClientConfig,
  UploadFileOptions,
  UploadFileResult,
  CreateFolderOptions,
  CreateFolderResult,
  SearchFilesOptions,
  SearchFilesResult,
  FileMetadata,
  FeishuApiResponse,
  FeishuApiError,
  FeishuApiErrorCode,
} from './feishu-api';

// ========================================================================
// 上传管理器
// ========================================================================

export { UploadManager, NodeFileReader } from './upload-manager';
export type {
  UploadOptions,
  UploadResult,
  FileReader,
} from './upload-manager';

// ========================================================================
// 状态跟踪器
// ========================================================================

export {
  StateTracker,
  SessionManager,
} from './state-tracker';
export type {
  StateStore,
  FileSystemStoreConfig,
  StateTrackerOptions,
  SyncSessionState,
} from './state-tracker';

// ========================================================================
// 同步协调器
// ========================================================================

export { SyncCoordinator } from './sync-coordinator';
export type {
  CoordinatorOptions,
  ProgressListener,
  CompletionListener,
  ErrorListener,
  StatusListener,
  LogListener,
  VaultAdapter,
} from './sync-coordinator';

// ============================================================================
// Obsidian 适配器
// ============================================================================

export {
  ObsidianVaultAdapter,
  ObsidianFileReader,
  buildSyncConfig,
  toUiSyncSummary,
} from './obsidian-adapter';

export type {
  ObsidianApp,
  SyncConfigBuilderOptions,
} from './obsidian-adapter';
