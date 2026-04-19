/**
 * 同步协调器 - 协调整个同步流程的核心组件
 *
 * 功能：
 * - 编排同步流程（扫描、过滤、检测变更、上传）
 * - 并发控制（管理上传队列）
 * - 错误处理（捕获、记录、重试）
 * - 状态管理（跟踪进度、支持暂停/恢复/取消）
 *
 * 设计说明：
 * 适用于 Obsidian 插件环境，不使用 Web Worker
 * 直接在主线程执行同步，使用异步/回调避免阻塞
 */

import type {
  FileEntry,
  SyncConfig,
  SyncProgress,
  SyncResult,
  SyncStatus,
  ErrorInfo,
} from './types';
import { FeishuClient } from './feishu-client';
import { UploadManager, type UploadOptions, type FileReader } from './upload-manager';
import { StateTracker } from './state-tracker';

// ============================================================================
// Obsidian Vault 适配器接口
// ============================================================================

/**
 * Obsidian Vault 适配器
 * 用于在插件环境中访问文件系统
 */
export interface VaultAdapter {
  /** 获取所有文件 */
  getFiles(): Array<{ path: string; stat: { size: number; mtime: number } }>;
  /** 读取文件内容 */
  readBinary(path: string): Promise<ArrayBuffer>;
  /** 获取保险库路径 */
  getVaultPath(): string;
}

// ============================================================================
// 事件监听器类型
// ============================================================================

export type ProgressListener = (progress: SyncProgress) => void;
export type CompletionListener = (result: SyncResult) => void;
export type ErrorListener = (error: ErrorInfo) => void;
export type StatusListener = (status: SyncStatus) => void;
export type LogListener = (level: string, message: string) => void;

// ============================================================================
// 协调器配置
// ============================================================================

export interface CoordinatorOptions {
  /** 状态存储路径（可选，用于调试） */
  statePath?: string;
  /** 是否启用详细日志 */
  verbose?: boolean;
}

// ============================================================================
// 同步会话状态（内部）
// ============================================================================

interface SyncSession {
  /** 会话 ID */
  sessionId: string;
  /** 配置 */
  config: SyncConfig;
  /** 开始时间 */
  startTime: number;
  /** 是否已暂停 */
  paused: boolean;
  /** 是否已取消 */
  cancelled: boolean;
  /** 当前状态 */
  status: SyncStatus;
  /** 当前进度 */
  progress: SyncProgress;
}

// ============================================================================
// 同步协调器
// ============================================================================

export class SyncCoordinator {
  private vaultAdapter: VaultAdapter;
  private options: CoordinatorOptions;
  private stateTracker: StateTracker;
  private fileReader: FileReader | null = null;
  private currentSession: SyncSession | null = null;

  // 组件实例（延迟创建）
  private feishuClient: FeishuClient | null = null;
  private uploadManager: UploadManager | null = null;

  // 事件监听器
  private progressListeners: Set<ProgressListener> = new Set();
  private completionListeners: Set<CompletionListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();
  private logListeners: Set<LogListener> = new Set();

  constructor(vaultAdapter: VaultAdapter, options: CoordinatorOptions = {}, fileReader?: FileReader) {
    this.vaultAdapter = vaultAdapter;
    this.options = options;
    this.fileReader = fileReader || null;
    this.stateTracker = new StateTracker({
      autoSaveInterval: 5000,
    });
  }

  // ========================================================================
  // 生命周期管理
  // ========================================================================

  /**
   * 初始化协调器
   */
  async initialize(): Promise<void> {
    await this.stateTracker.load();
    this.log('info', 'SyncCoordinator initialized');
  }

  /**
   * 销毁协调器
   */
  async destroy(): Promise<void> {
    // 取消当前同步
    if (this.currentSession) {
      await this.cancelSync();
    }

    // 保存状态
    await this.stateTracker.save();

    // 清理监听器
    this.progressListeners.clear();
    this.completionListeners.clear();
    this.errorListeners.clear();
    this.statusListeners.clear();
    this.logListeners.clear();

    this.log('info', 'SyncCoordinator destroyed');
  }

  // ========================================================================
  // 同步控制
  // ========================================================================

  /**
   * 开始同步
   */
  async startSync(config: SyncConfig): Promise<string> {
    // 检查是否已有同步进行中
    if (this.currentSession && this.currentSession.status !== 'idle') {
      throw new Error('A sync is already in progress');
    }

    const sessionId = this.generateSessionId();
    const startTime = Date.now();

    // 创建新会话
    this.currentSession = {
      sessionId,
      config,
      startTime,
      paused: false,
      cancelled: false,
      status: 'scanning',
      progress: this.createInitialProgress(),
    };
    this.currentSession.progress.startTime = startTime;

    this.updateStatus('scanning');
    this.log('info', `Starting sync session: ${sessionId}`);

    // 执行同步流程
    this.executeSync().catch((error) => {
      this.log('error', `Sync execution error: ${error.message}`);
      this.handleError({
        code: 'SYNC_ERROR',
        message: error.message,
        details: error,
      });
    });

    return sessionId;
  }

  /**
   * 暂停同步
   */
  async pauseSync(): Promise<void> {
    if (!this.currentSession || this.currentSession.paused) {
      return;
    }

    this.currentSession.paused = true;
    this.updateStatus('paused');
    this.log('info', 'Sync paused');
  }

  /**
   * 恢复同步
   */
  async resumeSync(): Promise<void> {
    if (!this.currentSession || !this.currentSession.paused) {
      return;
    }

    this.currentSession.paused = false;
    this.updateStatus('syncing');
    this.log('info', 'Sync resumed');
  }

  /**
   * 取消同步
   */
  async cancelSync(): Promise<void> {
    if (!this.currentSession || this.currentSession.cancelled) {
      return;
    }

    this.currentSession.cancelled = true;
    this.updateStatus('idle');
    this.log('info', 'Sync cancelled');

    // 通知完成（带取消状态）
    const result: SyncResult = {
      success: false,
      error: 'Sync cancelled by user',
      filesDiscovered: this.currentSession.progress.totalCount,
      excludedCount: 0,
      oversizedCount: 0,
      candidateCount: 0,
      uploadedCount: this.currentSession.progress.uploadedCount,
      skippedCount: this.currentSession.progress.skippedCount,
      failedCount: this.currentSession.progress.failedCount,
      failedFiles: [],
      totalBytesUploaded: 0,
      duration: Date.now() - this.currentSession.startTime,
    };

    this.notifyCompletion(result);
    this.currentSession = null;
  }

  // ========================================================================
  // 事件监听
  // ========================================================================

  /**
   * 监听进度更新
   */
  onProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  /**
   * 监听同步完成
   */
  onComplete(listener: CompletionListener): () => void {
    this.completionListeners.add(listener);
    return () => this.completionListeners.delete(listener);
  }

  /**
   * 监听错误
   */
  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /**
   * 监听状态变化
   */
  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * 监听日志
   */
  onLog(listener: LogListener): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  // ========================================================================
  // 状态查询
  // ========================================================================

  /**
   * 获取当前进度
   */
  getProgress(): SyncProgress {
    if (!this.currentSession) {
      return this.createInitialProgress();
    }
    return { ...this.currentSession.progress };
  }

  /**
   * 是否正在同步
   */
  isSyncing(): boolean {
    if (!this.currentSession) {
      return false;
    }
    const status = this.currentSession.status;
    return status === 'scanning' || status === 'syncing';
  }

  /**
   * 是否已暂停
   */
  isSyncPaused(): boolean {
    return this.currentSession?.paused ?? false;
  }

  /**
   * 是否已取消
   */
  isSyncCancelled(): boolean {
    return this.currentSession?.cancelled ?? false;
  }

  // ========================================================================
  // 私有方法 - 同步执行
  // ========================================================================

  /**
   * 执行同步流程
   */
  private async executeSync(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const { config } = this.currentSession;

    try {
      // 1. 初始化组件
      await this.initializeComponents(config);

      // 2. 扫描文件
      const scanResult = await this.scanFiles();
      if (this.shouldStop()) {
        return;
      }

      // 3. 过滤文件
      const filterResult = this.filterFiles(scanResult.files);

      // 4. 检测变更
      const changedFiles = await this.detectChanges(filterResult.validFiles);
      if (this.shouldStop()) {
        return;
      }

      // 5. 创建文件夹结构
      const folderMap = await this.createFolderStructure(filterResult.validFiles);
      if (this.shouldStop()) {
        return;
      }

      // 6. 上传文件
      await this.uploadFiles(changedFiles, folderMap);
      if (this.shouldStop()) {
        return;
      }

      // 7. 完成
      await this.completeSync(scanResult, filterResult, changedFiles);
    } catch (error) {
      this.handleError({
        code: 'SYNC_ERROR',
        message: (error as Error).message || 'Unknown sync error',
        details: error,
      });
    }
  }

  /**
   * 初始化组件
   */
  private async initializeComponents(config: SyncConfig): Promise<void> {
    // 创建飞书客户端
    this.feishuClient = new FeishuClient({
      userAccessToken: config.userAccessToken,
      appId: config.appId,
      appSecret: config.appSecret,
      refreshToken: config.refreshToken,
      retryAttempts: config.retryAttempts,
      retryDelay: config.retryDelay,
    });

    // 创建上传管理器（使用 fileReader）
    this.uploadManager = new UploadManager(config, this.feishuClient, this.fileReader || undefined);
  }

  /**
   * 扫描文件
   */
  private async scanFiles(): Promise<{ files: FileEntry[] }> {
    if (!this.currentSession) {
      throw new Error('No active sync session');
    }

    this.log('info', 'Scanning vault files...');

    // 从 Obsidian 获取所有文件
    const vaultFiles = this.vaultAdapter.getFiles();

    console.log('[SyncCoordinator] Vault files:', vaultFiles);

    // 转换为 FileEntry 格式
    const files: FileEntry[] = vaultFiles.map((vf) => {
      const entry: FileEntry = {
        type: 'file',
        absPath: vf.path, // Obsidian 使用相对路径，readBinary 也接受相对路径
        relPath: vf.path,
        size: vf.stat.size,
        mtimeMs: vf.stat.mtime,
      };
      console.log('[SyncCoordinator] FileEntry:', entry);
      return entry;
    });

    this.log('info', `Found ${files.length} files in vault`);

    // 更新进度
    this.updateProgress({
      totalCount: files.length,
      filesDiscovered: files.length,
    });

    return { files };
  }

  /**
   * 过滤文件
   */
  private filterFiles(files: FileEntry[]): {
    validFiles: FileEntry[];
    oversizedFiles: FileEntry[];
    excludedCount: number;
  } {
    if (!this.currentSession) {
      throw new Error('No active sync session');
    }

    const { config } = this.currentSession;
    const { fileMatchMode, matchList, maxDirectUploadMB } = config;

    this.log('info', `Filtering files (mode: ${fileMatchMode}, max size: ${maxDirectUploadMB}MB)...`);

    const validFiles: FileEntry[] = [];
    const oversizedFiles: FileEntry[] = [];
    let excludedCount = 0;

    console.log('[SyncCoordinator] 过滤前文件数量:', files.length);
    console.log('[SyncCoordinator] 第一个文件 (过滤前):', files[0]);

    for (const file of files) {
      // 检查是否匹配（排除或包含）
      const shouldMatch = this.shouldMatchFile(file.relPath, matchList, fileMatchMode);
      if (!shouldMatch) {
        excludedCount++;
        continue;
      }

      // 检查文件大小
      const maxSizeBytes = maxDirectUploadMB * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        oversizedFiles.push(file);
        continue;
      }

      validFiles.push(file);
    }

    console.log('[SyncCoordinator] 过滤后文件数量:', validFiles.length);
    console.log('[SyncCoordinator] 第一个文件 (过滤后):', validFiles[0]);

    this.log('info', `Filtered: ${validFiles.length} valid, ${oversizedFiles.length} oversized, ${excludedCount} excluded`);

    return { validFiles, oversizedFiles, excludedCount };
  }

  /**
   * 检测变更
   */
  private async detectChanges(files: FileEntry[]): Promise<FileEntry[]> {
    if (!this.currentSession) {
      throw new Error('No active sync session');
    }

    this.log('info', 'Detecting file changes...');

    console.log('[SyncCoordinator] 检测变更，输入文件数量:', files.length);
    console.log('[SyncCoordinator] 第一个文件 (检测变更前):', files[0]);

    // 检测哪些文件有变化
    const changedFiles: FileEntry[] = [];

    for (const file of files) {
      const prevState = this.stateTracker.getFileState(file.relPath);

      // 如果没有之前的记录，或者文件大小/修改时间变了，则需要上传
      if (!prevState || prevState.size !== file.size || prevState.mtimeMs !== file.mtimeMs) {
        changedFiles.push(file);
      }
    }

    console.log('[SyncCoordinator] 变更文件数量:', changedFiles.length);
    if (changedFiles.length > 0) {
      console.log('[SyncCoordinator] 第一个变更文件:', changedFiles[0]);
    }

    this.log('info', `Detected ${changedFiles.length} changed files`);

    // 更新进度
    this.updateProgress({
      candidateCount: changedFiles.length,
    });

    return changedFiles;
  }

  /**
   * 创建文件夹结构
   */
  private async createFolderStructure(files: FileEntry[]): Promise<Record<string, string>> {
    if (!this.currentSession || !this.feishuClient) {
      throw new Error('No active session or FeishuClient not initialized');
    }

    const { config } = this.currentSession;
    const { feishuRootFolderToken } = config;

    this.log('info', 'Creating folder structure in Feishu...');

    // 收集所有唯一的父目录路径
    const parentPaths = new Set<string>();
    for (const file of files) {
      const parentPath = this.getParentPath(file.relPath);
      if (parentPath) {
        parentPaths.add(parentPath);
      }
    }

    // 排序以确保父目录先创建
    const sortedPaths = Array.from(parentPaths).sort();

    // 创建文件夹映射（相对路径 -> Feishu token）
    const folderMap: Record<string, string> = {
      '': feishuRootFolderToken, // 根目录
    };

    for (const relPath of sortedPaths) {
      // 检查暂停/取消
      if (this.shouldStop()) {
        break;
      }

      // 检查父目录是否存在
      const parentPath = this.getParentPath(relPath);
      const parentToken = folderMap[parentPath || ''];

      if (!parentToken) {
        this.log('warn', `Parent folder not found: ${parentPath}`);
        continue;
      }

      try {
        const folderName = this.getFolderName(relPath);
        const folderToken = await this.feishuClient.ensureFolder(parentToken, folderName);
        folderMap[relPath] = folderToken;

        this.log('debug', `Created/found folder: ${relPath} -> ${folderToken}`);
      } catch (error) {
        this.log('error', `Failed to create folder ${relPath}: ${(error as Error).message}`);
      }
    }

    this.log('info', `Created ${Object.keys(folderMap).length - 1} folders`);

    return folderMap;
  }

  /**
   * 上传文件
   */
  private async uploadFiles(files: FileEntry[], folderMap: Record<string, string>): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active sync session');
    }

    this.log('info', `Uploading ${files.length} files...`);
    this.updateStatus('syncing');

    if (!this.uploadManager) {
      throw new Error('UploadManager not initialized');
    }

    const { config } = this.currentSession;

    // 上传选项
    const uploadOptions: UploadOptions = {
      concurrency: config.concurrentUploads,
      retryAttempts: config.retryAttempts,
      retryDelay: config.retryDelay,
      onProgress: (progress) => {
        this.updateProgress({
          processedCount: progress.processedCount,
          currentFile: progress.currentFile,
        });
      },
      isCancelled: () => this.shouldStop(),
    };

    // 执行上传
    const result = await this.uploadManager.uploadFiles(files, folderMap, uploadOptions);

    this.log('info', `Upload complete: ${result.uploadedCount} uploaded, ${result.failedCount} failed`);

    // 更新状态跟踪器
    const uploadedStates: Array<{ relPath: string; size: number; mtimeMs: number }> = [];
    for (const file of files) {
      // 检查是否成功上传（不在失败列表中）
      const failedFile = result.failedFiles.find(f => f.path === file.relPath);
      if (!failedFile) {
        uploadedStates.push({
          relPath: file.relPath,
          size: file.size,
          mtimeMs: file.mtimeMs,
        });
      }
    }
    this.stateTracker.updateFileStates(uploadedStates);

    // 更新进度
    this.updateProgress({
      uploadedCount: result.uploadedCount,
      failedCount: result.failedCount,
    });
  }

  /**
   * 完成同步
   */
  private async completeSync(
    scanResult: { files: FileEntry[] },
    filterResult: { validFiles: FileEntry[]; oversizedFiles: FileEntry[]; excludedCount: number },
    changedFiles: FileEntry[]
  ): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active sync session');
    }

    // 保存状态
    await this.stateTracker.save();

    // 构建结果
    const result: SyncResult = {
      success: true,
      filesDiscovered: scanResult.files.length,
      excludedCount: filterResult.excludedCount,
      oversizedCount: filterResult.oversizedFiles.length,
      candidateCount: filterResult.validFiles.length,
      uploadedCount: this.currentSession.progress.uploadedCount,
      skippedCount: filterResult.validFiles.length - changedFiles.length,
      failedCount: this.currentSession.progress.failedCount,
      failedFiles: [],
      totalBytesUploaded: 0, // TODO: 收集实际上传字节数
      duration: Date.now() - this.currentSession.startTime,
    };

    this.updateStatus('completed');
    this.log('info', `Sync completed in ${result.duration}ms`);

    this.notifyCompletion(result);
    this.currentSession = null;
  }

  // ========================================================================
  // 私有方法 - 工具函数
  // ========================================================================

  /**
   * 检查是否应该停止（暂停或取消）
   */
  private shouldStop(): boolean {
    return this.currentSession?.cancelled ?? false;
  }

  /**
   * 检查文件是否匹配
   */
  private shouldMatchFile(relPath: string, matchList: string[], mode: 'exclude' | 'include'): boolean {
    const normalized = relPath.replace(/\\/g, '/');

    if (mode === 'exclude') {
      // 排除模式：默认包含所有文件，除非在排除列表中
      return !matchList.some((item) => normalized === item || normalized.startsWith(`${item}/`));
    } else {
      // 白名单模式：只包含在白名单中的文件
      return matchList.some((item) => normalized === item || normalized.startsWith(`${item}/`));
    }
  }

  /**
   * 获取父目录路径
   */
  private getParentPath(relPath: string): string {
    const parts = relPath.split('/');
    parts.pop();
    return parts.join('/');
  }

  /**
   * 获取文件夹名称
   */
  private getFolderName(relPath: string): string {
    const parts = relPath.split('/');
    return parts[parts.length - 1] || '';
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `sync-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 创建初始进度状态
   */
  private createInitialProgress(): SyncProgress {
    return {
      status: 'idle',
      currentFile: null,
      processedCount: 0,
      totalCount: 0,
      uploadedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      percentage: 0,
      speed: 0,
      startTime: null,
      estimatedTimeRemaining: null,
    };
  }

  // ========================================================================
  // 私有方法 - 状态更新和通知
  // ========================================================================

  /**
   * 更新状态
   */
  private updateStatus(status: SyncStatus): void {
    if (this.currentSession) {
      this.currentSession.status = status;
      this.currentSession.progress.status = status;
    }
    this.notifyStatus(status);
  }

  /**
   * 更新进度
   */
  private updateProgress(updates: Partial<SyncProgress>): void {
    if (!this.currentSession) {
      return;
    }

    Object.assign(this.currentSession.progress, updates);

    // 计算百分比
    if (this.currentSession.progress.totalCount > 0) {
      this.currentSession.progress.percentage = Math.floor(
        (this.currentSession.progress.processedCount / this.currentSession.progress.totalCount) * 100
      );
    }

    this.notifyProgress(this.currentSession.progress);
  }

  /**
   * 处理错误
   */
  private handleError(error: ErrorInfo): void {
    this.log('error', error.message);
    this.notifyError(error);

    if (this.currentSession) {
      this.updateStatus('error');
    }
  }

  /**
   * 通知进度监听器
   */
  private notifyProgress(progress: SyncProgress): void {
    for (const listener of this.progressListeners) {
      try {
        listener(progress);
      } catch (err) {
        console.error('Progress listener error:', err);
      }
    }
  }

  /**
   * 通知完成监听器
   */
  private notifyCompletion(result: SyncResult): void {
    for (const listener of this.completionListeners) {
      try {
        listener(result);
      } catch (err) {
        console.error('Completion listener error:', err);
      }
    }
  }

  /**
   * 通知错误监听器
   */
  private notifyError(error: ErrorInfo): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (err) {
        console.error('Error listener error:', err);
      }
    }
  }

  /**
   * 通知状态监听器
   */
  private notifyStatus(status: SyncStatus): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('Status listener error:', err);
      }
    }
  }

  /**
   * 记录日志
   */
  private log(level: string, message: string): void {
    if (this.options.verbose || level === 'error' || level === 'warn') {
      console.log(`[SyncCoordinator:${level}] ${message}`);
    }

    for (const listener of this.logListeners) {
      try {
        listener(level, message);
      } catch (err) {
        console.error('Log listener error:', err);
      }
    }
  }
}
