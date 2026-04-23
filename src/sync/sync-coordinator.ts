import type {
  FileEntry,
  FileState,
  SyncChannel,
  SyncConfig,
  SyncProgress,
  SyncResult,
  SyncStateMap,
} from './types';
import { FeishuClient } from './feishu-client';
import { FeishuDocClient } from './feishu-doc-client';
import { RateLimiter } from './rate-limiter';
import { StateTracker, type StateStore } from './state-tracker';
import { UploadManager, type UploadResult } from './upload-manager';

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

interface FilterResult {
  validFiles: FileEntry[];
  oversizedFiles: FileEntry[];
  excludedCount: number;
}

interface ProgressContext {
  filesDiscovered: number;
  candidateCount: number;
  excludedCount: number;
  oversizedCount: number;
  skippedCount: number;
  totalCount: number;
}

interface UploadAggregate {
  uploadedCount: number;
  failedCount: number;
  failedFiles: Array<{ path: string; error: string }>;
  totalBytesUploaded: number;
  completedCount: number;
}

interface UploadLanePolicy {
  channel: SyncChannel;
  batchSize: number;
  concurrency: number;
  cooldownMs: number;
  degradedConcurrency: number;
  degradedCooldownMs: number;
}

const DOCUMENT_BATCH_SIZE = 10;
const DOCUMENT_COOLDOWN_MS = 15_000;
const DOCUMENT_DEGRADED_COOLDOWN_MS = 30_000;
const FILE_BATCH_SIZE = 25;
const FILE_COOLDOWN_MS = 5_000;
const FILE_DEGRADED_COOLDOWN_MS = 15_000;
const RATE_LIMIT_QPS = 3;
const RATE_LIMIT_BASE_PENALTY_MS = 10_000;
const RATE_LIMIT_MAX_PENALTY_MS = 60_000;

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
    const rateLimiter = new RateLimiter(RATE_LIMIT_QPS, {
      basePenaltyMs: RATE_LIMIT_BASE_PENALTY_MS,
      maxPenaltyMs: RATE_LIMIT_MAX_PENALTY_MS,
    });

    const client = new FeishuClient(
      {
        userAccessToken: config.userAccessToken,
        retryAttempts: config.retryAttempts,
        retryDelay: config.retryDelay,
      },
      rateLimiter,
    );

    const docClient =
      config.markdownSyncMode === 'document'
        ? new FeishuDocClient(config.userAccessToken, rateLimiter)
        : undefined;

    const uploadManager = new UploadManager(
      config,
      client,
      {
        readFileContent: (path) => this.vault.readBinary(path.replace(/\\/g, '/')),
      },
      docClient,
    );

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
    const progressContext: ProgressContext = {
      filesDiscovered: scannedFiles.length,
      candidateCount: filtered.validFiles.length,
      excludedCount: filtered.excludedCount,
      oversizedCount: filtered.oversizedFiles.length,
      skippedCount,
      totalCount: filtered.validFiles.length,
    };

    this.emitProgress({
      phase: 'ensuring-folders',
      filesDiscovered: progressContext.filesDiscovered,
      candidateCount: progressContext.candidateCount,
      excludedCount: progressContext.excludedCount,
      oversizedCount: progressContext.oversizedCount,
      skippedCount: progressContext.skippedCount,
      uploadedCount: 0,
      failedCount: 0,
      processedCount: skippedCount,
      totalCount: progressContext.totalCount,
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

    const lanes = this.partitionUploadFiles(changedFiles, config);
    const aggregate: UploadAggregate = {
      uploadedCount: 0,
      failedCount: 0,
      failedFiles: [],
      totalBytesUploaded: 0,
      completedCount: 0,
    };

    if (lanes.documents.length > 0) {
      await this.runUploadLane({
        files: lanes.documents,
        policy: {
          channel: 'documents',
          batchSize: DOCUMENT_BATCH_SIZE,
          concurrency: 1,
          cooldownMs: DOCUMENT_COOLDOWN_MS,
          degradedConcurrency: 1,
          degradedCooldownMs: DOCUMENT_DEGRADED_COOLDOWN_MS,
        },
        uploadManager,
        folderMap,
        previousStates,
        aggregate,
        progressContext,
        rateLimiter,
        retryAttempts: config.retryAttempts,
        retryDelay: config.retryDelay,
        run,
      });
    }

    if (lanes.files.length > 0) {
      await this.runUploadLane({
        files: lanes.files,
        policy: {
          channel: 'files',
          batchSize: FILE_BATCH_SIZE,
          concurrency: this.resolveRegularFileConcurrency(config),
          cooldownMs: FILE_COOLDOWN_MS,
          degradedConcurrency: 1,
          degradedCooldownMs: FILE_DEGRADED_COOLDOWN_MS,
        },
        uploadManager,
        folderMap,
        previousStates,
        aggregate,
        progressContext,
        rateLimiter,
        retryAttempts: config.retryAttempts,
        retryDelay: config.retryDelay,
        run,
      });
    }

    this.emitProgress({
      phase: 'writing-state',
      filesDiscovered: progressContext.filesDiscovered,
      candidateCount: progressContext.candidateCount,
      excludedCount: progressContext.excludedCount,
      oversizedCount: progressContext.oversizedCount,
      skippedCount: progressContext.skippedCount,
      uploadedCount: aggregate.uploadedCount,
      failedCount: aggregate.failedCount,
      processedCount: progressContext.skippedCount + aggregate.completedCount,
      totalCount: progressContext.totalCount,
    });

    await this.stateTracker.save();

    const result: SyncResult = {
      success: aggregate.failedCount === 0,
      error:
        aggregate.failedCount > 0
          ? aggregate.failedFiles[0]?.error || 'Some files failed to upload'
          : undefined,
      filesDiscovered: progressContext.filesDiscovered,
      excludedCount: progressContext.excludedCount,
      oversizedCount: progressContext.oversizedCount,
      candidateCount: progressContext.candidateCount,
      uploadedCount: aggregate.uploadedCount,
      skippedCount: progressContext.skippedCount,
      failedCount: aggregate.failedCount,
      failedFiles: aggregate.failedFiles,
      totalBytesUploaded: aggregate.totalBytesUploaded,
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
      processedCount: result.skippedCount + aggregate.completedCount,
      totalCount: result.candidateCount,
    });

    return result;
  }

  private async runUploadLane(params: {
    files: FileEntry[];
    policy: UploadLanePolicy;
    uploadManager: UploadManager;
    folderMap: Record<string, string>;
    previousStates: SyncStateMap;
    aggregate: UploadAggregate;
    progressContext: ProgressContext;
    rateLimiter: RateLimiter;
    retryAttempts?: number;
    retryDelay?: number;
    run: ActiveSync;
  }): Promise<void> {
    const {
      files,
      policy,
      uploadManager,
      folderMap,
      previousStates,
      aggregate,
      progressContext,
      rateLimiter,
      retryAttempts,
      retryDelay,
      run,
    } = params;

    const batches = this.chunkFiles(files, policy.batchSize);
    let currentConcurrency = policy.concurrency;
    let currentCooldownMs = policy.cooldownMs;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      this.throwIfCancelled(run);

      const batch = batches[batchIndex] ?? [];
      const beforeSnapshot = rateLimiter.getSnapshot();
      const batchPreviousStates = this.pickPreviousStates(batch, previousStates);
      const completedBeforeBatch = aggregate.completedCount;
      const uploadedBeforeBatch = aggregate.uploadedCount;
      const failedBeforeBatch = aggregate.failedCount;

      const batchResult = await uploadManager.uploadFiles(batch, folderMap, batchPreviousStates, {
        concurrency: currentConcurrency,
        retryAttempts,
        retryDelay,
        isCancelled: () => run.cancelled,
        onFileComplete: (progress) => {
          this.emitProgress({
            phase: 'uploading',
            channel: policy.channel,
            filesDiscovered: progressContext.filesDiscovered,
            candidateCount: progressContext.candidateCount,
            excludedCount: progressContext.excludedCount,
            oversizedCount: progressContext.oversizedCount,
            skippedCount: progressContext.skippedCount,
            uploadedCount: uploadedBeforeBatch + progress.uploadedCount,
            failedCount: failedBeforeBatch + progress.failedCount,
            processedCount:
              progressContext.skippedCount + completedBeforeBatch + progress.completedCount,
            totalCount: progressContext.totalCount,
            currentPath: progress.currentPath,
            batchIndex: batchIndex + 1,
            batchCount: batches.length,
          });
        },
      });

      this.throwIfCancelled(run);

      this.mergeBatchResult(aggregate, batchResult);
      if (batchResult.uploadedStates.length > 0) {
        this.stateTracker.updateFileStates(batchResult.uploadedStates);
      }

      const afterSnapshot = rateLimiter.getSnapshot();
      const sawRateLimit = afterSnapshot.totalRateLimitHits > beforeSnapshot.totalRateLimitHits;
      if (sawRateLimit) {
        currentConcurrency = policy.degradedConcurrency;
        currentCooldownMs = policy.degradedCooldownMs;
      }

      const isLastBatch = batchIndex === batches.length - 1;
      if (isLastBatch) {
        continue;
      }

      const cooldownMs = this.resolveCooldownMs({
        defaultCooldownMs: currentCooldownMs,
        sawRateLimit,
        nextAvailableAt: afterSnapshot.nextAvailableAt,
        lastPenaltyMs: afterSnapshot.lastPenaltyMs,
      });

      await this.waitForCooldown({
        cooldownMs,
        channel: policy.channel,
        batchIndex: batchIndex + 2,
        batchCount: batches.length,
        aggregate,
        progressContext,
        run,
      });
    }
  }

  private resolveCooldownMs(options: {
    defaultCooldownMs: number;
    sawRateLimit: boolean;
    nextAvailableAt: number;
    lastPenaltyMs: number;
  }): number {
    const { defaultCooldownMs, sawRateLimit, nextAvailableAt, lastPenaltyMs } = options;
    if (!sawRateLimit) {
      return defaultCooldownMs;
    }

    return Math.max(defaultCooldownMs, lastPenaltyMs, Math.max(0, nextAvailableAt - Date.now()));
  }

  private async waitForCooldown(params: {
    cooldownMs: number;
    channel: SyncChannel;
    batchIndex: number;
    batchCount: number;
    aggregate: UploadAggregate;
    progressContext: ProgressContext;
    run: ActiveSync;
  }): Promise<void> {
    const { cooldownMs, channel, batchIndex, batchCount, aggregate, progressContext, run } =
      params;

    if (cooldownMs <= 0) {
      return;
    }

    const deadline = Date.now() + cooldownMs;

    while (true) {
      this.throwIfCancelled(run);

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        return;
      }

      this.emitProgress({
        phase: 'cooldown',
        channel,
        filesDiscovered: progressContext.filesDiscovered,
        candidateCount: progressContext.candidateCount,
        excludedCount: progressContext.excludedCount,
        oversizedCount: progressContext.oversizedCount,
        skippedCount: progressContext.skippedCount,
        uploadedCount: aggregate.uploadedCount,
        failedCount: aggregate.failedCount,
        processedCount: progressContext.skippedCount + aggregate.completedCount,
        totalCount: progressContext.totalCount,
        batchIndex,
        batchCount,
        cooldownRemainingMs: remainingMs,
      });

      await this.sleep(Math.min(1000, remainingMs));
    }
  }

  private mergeBatchResult(aggregate: UploadAggregate, batchResult: UploadResult): void {
    aggregate.uploadedCount += batchResult.uploadedCount;
    aggregate.failedCount += batchResult.failedCount;
    aggregate.totalBytesUploaded += batchResult.totalBytesUploaded;
    aggregate.completedCount += batchResult.uploadedCount + batchResult.failedCount;
    aggregate.failedFiles.push(...batchResult.failedFiles);
  }

  private pickPreviousStates(
    files: FileEntry[],
    previousStates: SyncStateMap,
  ): SyncStateMap {
    return Object.fromEntries(
      files.flatMap((file) => {
        const previousState = previousStates[file.relPath];
        return previousState ? [[file.relPath, previousState]] : [];
      }),
    );
  }

  private partitionUploadFiles(
    files: FileEntry[],
    config: SyncConfig,
  ): { documents: FileEntry[]; files: FileEntry[] } {
    if (config.markdownSyncMode !== 'document') {
      return {
        documents: [],
        files,
      };
    }

    return {
      documents: files.filter((file) => this.isMarkdownFile(file.relPath)),
      files: files.filter((file) => !this.isMarkdownFile(file.relPath)),
    };
  }

  private resolveRegularFileConcurrency(config: SyncConfig): number {
    const configuredConcurrency = config.concurrentUploads ?? 2;
    return Math.max(1, Math.min(configuredConcurrency, 2));
  }

  private scanFiles(): FileEntry[] {
    return this.vault.getFiles().map((file) => ({
      relPath: file.path.replace(/\\/g, '/'),
      size: file.stat?.size ?? 0,
      mtimeMs: file.stat?.mtime ?? file.stat?.mtimeMs ?? 0,
    }));
  }

  private filterFiles(files: FileEntry[], config: SyncConfig): FilterResult {
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

  private chunkFiles(files: FileEntry[], batchSize: number): FileEntry[][] {
    if (batchSize <= 0) {
      return [files];
    }

    const batches: FileEntry[][] = [];
    for (let index = 0; index < files.length; index += batchSize) {
      batches.push(files.slice(index, index + batchSize));
    }
    return batches;
  }

  private throwIfCancelled(run: ActiveSync): void {
    if (run.cancelled) {
      throw new SyncCancelledError();
    }
  }

  private emitProgress(progress: SyncProgress): void {
    this.options.onProgress?.(progress);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(_message: string): void {}
}
