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

export interface FileState {
  size: number;
  mtimeMs: number;
  uploadedAt: string;
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
