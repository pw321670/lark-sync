export interface SyncConfig {
  feishuRootFolderToken: string;
  userAccessToken: string;
  fileMatchMode: 'exclude' | 'include';
  matchList: string[];
  maxDirectUploadMB: number;
  concurrentUploads?: number;
  retryAttempts?: number;
  retryDelay?: number;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  markdownSyncMode?: 'file' | 'document';
}

export interface FileEntry {
  relPath: string;
  size: number;
  mtimeMs: number;
}

export interface RemoteFileRef {
  type: 'document';
  token: string;
  title?: string;
  parentFolderToken?: string;
  url?: string;
}

export interface FileState {
  size: number;
  mtimeMs: number;
  uploadedAt: string;
  remote?: RemoteFileRef;
}

export type SyncStateMap = Record<string, FileState>;

export interface SyncResult {
  success: boolean;
  error?: string;
  filesDiscovered: number;
  excludedCount: number;
  oversizedCount: number;
  candidateCount: number;
  uploadedCount: number;
  skippedCount: number;
  failedCount: number;
  failedFiles: Array<{ path: string; error: string }>;
  totalBytesUploaded: number;
  duration: number;
}

export type SyncPhase =
  | 'scanning'
  | 'ensuring-folders'
  | 'uploading'
  | 'cooldown'
  | 'writing-state'
  | 'completed';

export type SyncChannel = 'documents' | 'files';

export interface SyncProgress {
  phase: SyncPhase;
  channel?: SyncChannel;
  filesDiscovered: number;
  candidateCount: number;
  excludedCount: number;
  oversizedCount: number;
  skippedCount: number;
  uploadedCount: number;
  failedCount: number;
  processedCount: number;
  totalCount: number;
  currentPath?: string;
  batchIndex?: number;
  batchCount?: number;
  cooldownRemainingMs?: number;
  cooldownReason?: 'batch' | 'rate-limit';
}

export interface FeishuFileItem {
  type: string;
  name: string;
  token: string;
}

export interface FeishuApiResponse<T = unknown> {
  code: number;
  msg?: string;
  data?: T;
}

export interface UploadFileResponse {
  fileToken?: string;
  file_token?: string;
  token?: string;
}
