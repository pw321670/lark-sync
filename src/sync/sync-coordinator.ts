import type { FileEntry, FileState, SyncConfig, SyncProgress, SyncResult } from './types';
import { FeishuClient } from './feishu-client';
import { FeishuDocClient } from './feishu-doc-client';
import { RateLimiter } from './rate-limiter';
import { StateTracker, type StateStore } from './state-tracker';
import { UploadManager } from './upload-manager';

export interface SyncVault {
  getFiles(): Array<{ path: string; stat: { size: number; mtime: number; mtimeMs?: number } }>;
  readBinary(path: string): Promise<ArrayBuffer>;
}

export interface CoordinatorOptions {
  verbose?: boolean;
  stateStore?: StateStore;
  onProgress?: (progress: SyncProgress) => void;
}

interface ActiveSync {
  cancelled: boolean;
  startedAt: number;
}

export class SyncCancelledError extends Error {
  constructor(message = 'Sync cancelled by user') {
    super(message);
    this.name = 'SyncCancelledError';
  }
}

export class SyncCoordinator {
  private readonly stateTracker: StateTracker;
  private activeSync: ActiveSync | null = null;

  constructor(
    private readonly vault: SyncVault,
    private readonly options: CoordinatorOptions = {},
  ) {
    this.stateTracker = new StateTracker({
      store: options.stateStore,
    });
  }

  async initialize(): Promise<void> {
    await this.stateTracker.load();
    this.log('SyncCoordinator initialized');
  }

  async destroy(): Promise<void> {
    this.cancelSync();
    await this.stateTracker.save();
  }

  async startSync(config: SyncConfig): Promise<SyncResult> {
    if (this.activeSync) {
      throw new Error('A sync is already in progress');
    }

    const run: ActiveSync = {
      cancelled: false,
      startedAt: Date.now(),
    };
    this.activeSync = run;

    try {
      return await this.executeSync(config, run);
    } finally {
      if (this.activeSync === run) {
        this.activeSync = null;
      }
    }
  }

  cancelSync(): void {
    if (this.activeSync) {
      this.activeSync.cancelled = true;
    }
  }

  isSyncing(): boolean {
    return this.activeSync !== null;
  }

  private async executeSync(config: SyncConfig, run: ActiveSync): Promise<SyncResult> {
    const rateLimiter = new RateLimiter(4);

    const client = new FeishuClient({
      userAccessToken: config.userAccessToken,
      retryAttempts: config.retryAttempts,
      retryDelay: config.retryDelay,
    }, rateLimiter);

    // 如果启用了 Markdown 文档模式，则创建文档客户端
    let docClient: FeishuDocClient | undefined;
    if (config.markdownSyncMode === 'document') {
      docClient = new FeishuDocClient(config.userAccessToken, rateLimiter);
      this.log('飞书文档 API 客户端已启用');
    }

    const uploadManager = new UploadManager(config, client, {
      readFileContent: (path) => this.vault.readBinary(path.replace(/\\/g, '/')),
    }, docClient);

    this.emitProgress({
      phase: 'scanning',
      filesDiscovered: 0,
      candidateCount: 0,
      excludedCount: 0,
      oversizedCount: 0,
      skippedCount: 0,
      uploadedCount: 0,
      failedCount: 0,
      processedCount: 0,
      totalCount: 0,
    });

    const scannedFiles = this.scanFiles();
    this.throwIfCancelled(run);

    const filtered = this.filterFiles(scannedFiles, config);
    const changedFiles = this.detectChanges(filtered.validFiles, config);
    const skippedCount = filtered.validFiles.length - changedFiles.length;

    this.emitProgress({
      phase: 'ensuring-folders',
      filesDiscovered: scannedFiles.length,
      candidateCount: filtered.validFiles.length,
      excludedCount: filtered.excludedCount,
      oversizedCount: filtered.oversizedFiles.length,
      skippedCount,
      uploadedCount: 0,
      failedCount: 0,
      processedCount: skippedCount,
      totalCount: filtered.validFiles.length,
    });

    this.throwIfCancelled(run);

    const folderMap = await this.createFolderStructure(changedFiles, client, config, run);
    this.throwIfCancelled(run);

    const previousStates = Object.fromEntries(
      changedFiles.flatMap((file) => {
        const state = this.stateTracker.getFileState(file.relPath);
        return state ? [[file.relPath, state]] : [];
      }),
    );

    const uploadResult = await uploadManager.uploadFiles(changedFiles, folderMap, previousStates, {
      concurrency: config.concurrentUploads,
      retryAttempts: config.retryAttempts,
      retryDelay: config.retryDelay,
      isCancelled: () => run.cancelled,
      onFileComplete: (progress) => {
        this.emitProgress({
          phase: 'uploading',
          filesDiscovered: scannedFiles.length,
          candidateCount: filtered.validFiles.length,
          excludedCount: filtered.excludedCount,
          oversizedCount: filtered.oversizedFiles.length,
          skippedCount,
          uploadedCount: progress.uploadedCount,
          failedCount: progress.failedCount,
          processedCount: skippedCount + progress.completedCount,
          totalCount: filtered.validFiles.length,
          currentPath: progress.currentPath,
        });
      },
    });
    this.throwIfCancelled(run);

    if (uploadResult.uploadedStates.length > 0) {
      this.stateTracker.updateFileStates(uploadResult.uploadedStates);
    }

    this.emitProgress({
      phase: 'writing-state',
      filesDiscovered: scannedFiles.length,
      candidateCount: filtered.validFiles.length,
      excludedCount: filtered.excludedCount,
      oversizedCount: filtered.oversizedFiles.length,
      skippedCount,
      uploadedCount: uploadResult.uploadedCount,
      failedCount: uploadResult.failedCount,
      processedCount: filtered.validFiles.length,
      totalCount: filtered.validFiles.length,
    });

    await this.stateTracker.save();

    const result: SyncResult = {
      success: uploadResult.failedCount === 0,
      error:
        uploadResult.failedCount > 0
          ? uploadResult.failedFiles[0]?.error || 'Some files failed to upload'
          : undefined,
      filesDiscovered: scannedFiles.length,
      excludedCount: filtered.excludedCount,
      oversizedCount: filtered.oversizedFiles.length,
      candidateCount: filtered.validFiles.length,
      uploadedCount: uploadResult.uploadedCount,
      skippedCount,
      failedCount: uploadResult.failedCount,
      failedFiles: uploadResult.failedFiles,
      totalBytesUploaded: uploadResult.totalBytesUploaded,
      duration: Date.now() - run.startedAt,
    };

    this.emitProgress({
      phase: 'completed',
      filesDiscovered: result.filesDiscovered,
      candidateCount: result.candidateCount,
      excludedCount: result.excludedCount,
      oversizedCount: result.oversizedCount,
      skippedCount: result.skippedCount,
      uploadedCount: result.uploadedCount,
      failedCount: result.failedCount,
      processedCount: result.candidateCount,
      totalCount: result.candidateCount,
    });

    return result;
  }

  private scanFiles(): FileEntry[] {
    return this.vault.getFiles().map((file) => ({
      relPath: file.path.replace(/\\/g, '/'),
      size: file.stat?.size ?? 0,
      mtimeMs: file.stat?.mtime ?? file.stat?.mtimeMs ?? 0,
    }));
  }

  private filterFiles(
    files: FileEntry[],
    config: SyncConfig,
  ): { validFiles: FileEntry[]; oversizedFiles: FileEntry[]; excludedCount: number } {
    const validFiles: FileEntry[] = [];
    const oversizedFiles: FileEntry[] = [];
    let excludedCount = 0;
    const maxSizeBytes = config.maxDirectUploadMB * 1024 * 1024;

    for (const file of files) {
      if (!this.shouldMatchFile(file.relPath, config.matchList, config.fileMatchMode)) {
        excludedCount += 1;
        continue;
      }

      if (file.size > maxSizeBytes) {
        oversizedFiles.push(file);
        continue;
      }

      validFiles.push(file);
    }

    return { validFiles, oversizedFiles, excludedCount };
  }

  private detectChanges(files: FileEntry[], config: SyncConfig): FileEntry[] {
    return files.filter((file) => {
      const previous = this.stateTracker.getFileState(file.relPath);
      if (!previous || previous.size !== file.size || previous.mtimeMs !== file.mtimeMs) {
        return true;
      }

      return this.requiresDocumentStateRecovery(file.relPath, previous, config);
    });
  }

  private requiresDocumentStateRecovery(
    relPath: string,
    previous: FileState,
    config: SyncConfig,
  ): boolean {
    if (config.markdownSyncMode !== 'document' || !this.isMarkdownFile(relPath)) {
      return false;
    }

    return previous.remote?.type !== 'document' || !previous.remote.token;
  }

  private async createFolderStructure(
    files: FileEntry[],
    client: FeishuClient,
    config: SyncConfig,
    run: ActiveSync,
  ): Promise<Record<string, string>> {
    const folderMap: Record<string, string> = {
      '': config.feishuRootFolderToken,
    };
    const parentPaths = new Set<string>();

    for (const file of files) {
      const parts = file.relPath.split('/');
      parts.pop();
      while (parts.length > 0) {
        parentPaths.add(parts.join('/'));
        parts.pop();
      }
    }

    for (const relPath of Array.from(parentPaths).sort()) {
      this.throwIfCancelled(run);

      const parentPath = this.getParentPath(relPath);
      const parentToken = folderMap[parentPath || ''];
      if (!parentToken) {
        continue;
      }

      folderMap[relPath] = await client.ensureFolder(parentToken, this.getLeafName(relPath));
    }

    return folderMap;
  }

  private shouldMatchFile(
    relPath: string,
    matchList: string[],
    mode: 'exclude' | 'include',
  ): boolean {
    const normalized = relPath.replace(/\\/g, '/');

    if (mode === 'exclude') {
      return !matchList.some((item) => normalized === item || normalized.startsWith(`${item}/`));
    }

    return matchList.some((item) => normalized === item || normalized.startsWith(`${item}/`));
  }

  private getParentPath(relPath: string): string {
    const parts = relPath.split('/');
    parts.pop();
    return parts.join('/');
  }

  private getLeafName(relPath: string): string {
    const parts = relPath.split('/');
    return parts[parts.length - 1] || '';
  }

  private isMarkdownFile(relPath: string): boolean {
    return relPath.toLowerCase().endsWith('.md');
  }

  private throwIfCancelled(run: ActiveSync): void {
    if (run.cancelled) {
      throw new SyncCancelledError();
    }
  }

  private emitProgress(progress: SyncProgress): void {
    this.options.onProgress?.(progress);
  }

  private log(_message: string): void {}
}
