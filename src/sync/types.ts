/**
 * 同步引擎核心类型定义
 */

// ============================================================================
// 配置类型
// ============================================================================

export interface SyncConfig {
  /** 保险库路径 */
  vaultPath: string;
  /** 飞书根目录 token */
  feishuRootFolderToken: string;
  /** 用户访问令牌 */
  userAccessToken: string;
  /** 应用 ID */
  appId: string;
  /** 应用密钥 */
  appSecret: string;
  /** 刷新令牌 */
  refreshToken: string;
  /** 文件匹配模式 */
  fileMatchMode: 'exclude' | 'include';
  /** 匹配规则列表（排除或白名单） */
  matchList: string[];
  /** 直接上传最大文件大小（MB） */
  maxDirectUploadMB: number;
  /** 并发上传数 */
  concurrentUploads?: number;
  /** 重试次数 */
  retryAttempts?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
}

// ============================================================================
// 文件系统类型
// ============================================================================

export type FileSystemEntryType = 'dir' | 'file';

export interface FileSystemEntry {
  /** 类型 */
  type: FileSystemEntryType;
  /** 绝对路径 */
  absPath: string;
  /** 相对路径（标准化，使用 /） */
  relPath: string;
}

export interface FileEntry extends FileSystemEntry {
  type: 'file';
  /** 文件大小 */
  size: number;
  /** 修改时间（毫秒） */
  mtimeMs: number;
}

export interface DirEntry extends FileSystemEntry {
  type: 'dir';
}

// ============================================================================
// 同步状态类型
// ============================================================================

export type SyncStatus = 'idle' | 'scanning' | 'syncing' | 'paused' | 'completed' | 'error';

export interface FileState {
  /** 文件大小 */
  size: number;
  /** 修改时间（毫秒） */
  mtimeMs: number;
  /** 上传时间 */
  uploadedAt: string;
}

export type SyncStateMap = Record<string, FileState>;

export interface SyncProgress {
  /** 当前状态 */
  status: SyncStatus;
  /** 当前处理的文件 */
  currentFile: string | null;
  /** 已处理文件数 */
  processedCount: number;
  /** 总文件数 */
  totalCount: number;
  /** 扫描到的文件数 */
  filesDiscovered?: number;
  /** 候选上传文件数 */
  candidateCount?: number;
  /** 已上传文件数 */
  uploadedCount: number;
  /** 跳过文件数 */
  skippedCount: number;
  /** 失败文件数 */
  failedCount: number;
  /** 进度百分比 (0-100) */
  percentage: number;
  /** 上传速度（字节/秒） */
  speed: number;
  /** 开始时间 */
  startTime: number | null;
  /** 预估剩余时间（毫秒） */
  estimatedTimeRemaining: number | null;
}

export interface SyncResult {
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
  /** 扫描到的文件数 */
  filesDiscovered: number;
  /** 排除的文件数 */
  excludedCount: number;
  /** 超大文件数 */
  oversizedCount: number;
  /** 候选上传文件数 */
  candidateCount: number;
  /** 实际上传文件数 */
  uploadedCount: number;
  /** 跳过未变化文件数 */
  skippedCount: number;
  /** 失败文件数 */
  failedCount: number;
  /** 失败文件列表 */
  failedFiles: Array<{ path: string; error: string }>;
  /** 总上传字节数 */
  totalBytesUploaded: number;
  /** 总耗时（毫秒） */
  duration: number;
}

// ============================================================================
// 飞书 API 类型
// ============================================================================

export interface FeishuFileItem {
  /** 类型：file 或 folder */
  type: string;
  /** 文件名 */
  name: string;
  /** 文件 token */
  token: string;
}

export interface FeishuApiResponse<T = unknown> {
  /** 错误码，0 表示成功 */
  code: number;
  /** 错误信息 */
  msg?: string;
  /** 返回数据 */
  data?: T;
}

export interface RefreshTokenResponse {
  access_token?: string;
  refresh_token?: string;
}

export interface UploadFileResponse {
  fileToken?: string;
}

// ============================================================================
// Worker 通信类型
// ============================================================================

export type WorkerCommandType =
  | 'start-sync'
  | 'pause-sync'
  | 'resume-sync'
  | 'cancel-sync'
  | 'check-status';

export type WorkerMessageType =
  | 'sync-progress'
  | 'sync-complete'
  | 'sync-error'
  | 'sync-status'
  | 'sync-log';

export interface WorkerCommand {
  type: WorkerCommandType;
  config?: SyncConfig;
  id?: string;
}

export interface WorkerMessage<T = unknown> {
  type: WorkerMessageType;
  data?: T;
  id?: string;
}

// ============================================================================
// 错误类型
// ============================================================================

export class SyncError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

export interface ErrorInfo {
  code: string;
  message: string;
  details?: unknown;
}

// ============================================================================
// 日志类型
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
}
