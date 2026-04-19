/**
 * Web Worker 实现 - 在独立线程中执行同步操作
 *
 * 这是同步引擎的核心 Worker 实现，处理所有耗时操作，
 * 包括文件扫描、目录创建、文件上传等。
 */

import type {
  WorkerCommand,
  WorkerMessage,
  SyncConfig,
  SyncProgress,
  SyncResult,
  SyncStatus,
  ErrorInfo,
} from '../sync/types';
import { FileScanner } from '../sync/file-scanner';
import { FeishuClient } from '../sync/feishu-client';
import { UploadManager } from '../sync/upload-manager';
import { StateTracker, SessionManager } from '../sync/state-tracker';

// ============================================================================
// Worker 状态
// ============================================================================

interface WorkerState {
  status: SyncStatus;
  config: SyncConfig | null;
  progress: SyncProgress;
  isPaused: boolean;
  isCancelled: boolean;
  currentSessionId: string | null;
}

const state: WorkerState = {
  status: 'idle',
  config: null,
  progress: createInitialProgress(),
  isPaused: false,
  isCancelled: false,
  currentSessionId: null,
};

// ============================================================================
// 实例
// ============================================================================

let scanner: FileScanner | null = null;
let feishuClient: FeishuClient | null = null;
let uploadManager: UploadManager | null = null;
let stateTracker: StateTracker | null = null;
let sessionManager: SessionManager | null = null;

// ============================================================================
// 工具函数
// ============================================================================

function createInitialProgress(): SyncProgress {
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

function updateProgress(updates: Partial<SyncProgress>): void {
  state.progress = { ...state.progress, ...updates };

  // 计算百分比
  if (state.progress.totalCount > 0) {
    state.progress.percentage = Math.floor(
      (state.progress.processedCount / state.progress.totalCount) * 100
    );
  }

  // 计算速度
  if (state.progress.startTime && state.progress.processedCount > 0) {
    const elapsed = Date.now() - state.progress.startTime;
    state.progress.speed = (state.progress.processedCount / (elapsed / 1000)) * 1024; // 字节/秒
  }

  // 计算预估剩余时间
  if (state.progress.startTime && state.progress.processedCount > 0) {
    const elapsed = Date.now() - state.progress.startTime;
    const avgTimePerFile = elapsed / state.progress.processedCount;
    const remaining = state.progress.totalCount - state.progress.processedCount;
    state.progress.estimatedTimeRemaining = Math.floor(avgTimePerFile * remaining);
  }

  sendMessage({
    type: 'sync-progress',
    data: state.progress,
  });
}

function updateStatus(status: SyncStatus): void {
  state.status = status;
  state.progress.status = status;

  sendMessage({
    type: 'sync-status',
    data: status,
  });
}

function sendMessage(message: WorkerMessage): void {
  self.postMessage(message);
}

function log(level: string, message: string): void {
  sendMessage({
    type: 'sync-log',
    data: { level, message },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// 同步逻辑
// ============================================================================

/**
 * 执行同步
 */
async function executeSync(config: SyncConfig): Promise<void> {
  const startTime = Date.now();
  let filesDiscovered = 0;
  let excludedCount = 0;
  let oversizedCount = 0;

  try {
    // 初始化组件
    scanner = new FileScanner();
    stateTracker = new StateTracker({
      autoSaveInterval: 30000, // 30秒自动保存
    });
    sessionManager = new SessionManager();

    // 加载状态
    await stateTracker.load();
    stateTracker.startAutoSave();

    // 创建会话
    const sessionId = sessionManager.createSession(0);
    state.currentSessionId = sessionId;

    log('info', `创建同步会话: ${sessionId}`);

    // 初始化飞书客户端
    feishuClient = new FeishuClient({
      userAccessToken: config.userAccessToken,
      appId: config.appId,
      appSecret: config.appSecret,
      refreshToken: config.refreshToken,
    });

    // 刷新访问令牌
    log('info', '刷新访问令牌...');
    const tokens = await feishuClient.refreshAccessToken();
    config.userAccessToken = tokens.userAccessToken;
    config.refreshToken = tokens.refreshToken;

    // 扫描文件
    updateStatus('scanning');
    log('info', `扫描目录: ${config.vaultPath}`);

    const scanResult = await scanner.scanVault(config.vaultPath, {
      fileMatchMode: config.fileMatchMode,
      matchList: config.matchList,
      collectStats: true,
    });

    filesDiscovered = scanResult.files.length;
    excludedCount = scanResult.excludedCount;

    log('info', `扫描完成: ${filesDiscovered} 个文件, ${scanResult.dirs.length} 个目录`);

    // 检测变化
    const prevState = stateTracker.getAllStates();
    const changedFiles = scanner.detectChanges(scanResult.files, prevState);

    log('info', `变化检测: ${changedFiles.length} 个文件需要处理`);

    // 筛选超大文件
    const { valid, oversized } = scanner.filterOversizedFiles(
      changedFiles,
      config.maxDirectUploadMB
    );
    oversizedCount = oversized.length;

    if (oversized.length > 0) {
      log('warn', `${oversized.length} 个文件超过大小限制:`);
      for (const file of oversized) {
        log('warn', `  - ${file.relPath} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      }
    }

    // 更新进度
    state.progress.totalCount = valid.length;
    state.progress.startTime = startTime;
    updateProgress({});

    // 创建文件夹结构
    updateStatus('syncing');
    log('info', '创建文件夹结构...');

    const folderMap: Record<string, string> = {
      '': config.feishuRootFolderToken,
    };

    for (const dir of scanResult.dirs) {
      if (state.isCancelled) {
        throw new Error('操作已取消');
      }

      // 检查暂停
      while (state.isPaused && !state.isCancelled) {
        await sleep(100);
      }

      const parentRelPath = getParentRelPath(dir.relPath);
      const parentToken = folderMap[parentRelPath];

      if (!parentToken) {
        log('error', `找不到父目录 token: ${dir.relPath}`);
        continue;
      }

      const folderName = getBasename(dir.relPath);
      const token = await feishuClient.ensureFolder(parentToken, folderName);
      folderMap[dir.relPath] = token;

      log('debug', `文件夹已创建: ${dir.relPath}`);
    }

    // 初始化上传管理器
    uploadManager = new UploadManager(config, feishuClient);

    // 上传文件
    log('info', `开始上传 ${valid.length} 个文件...`);

    const uploadResult = await uploadManager.uploadFiles(valid, folderMap, {
      concurrency: config.concurrentUploads || 3,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      onProgress: (progress) => {
        updateProgress(progress);
      },
      isCancelled: () => state.isCancelled,
    });

    // 更新状态
    for (const file of scanResult.files) {
      const prev = prevState[file.relPath];
      if (!prev || prev.size !== file.size || prev.mtimeMs !== file.mtimeMs) {
        stateTracker.updateFileState(file.relPath, file.size, file.mtimeMs);
      }
    }

    // 保存状态
    await stateTracker.save();
    stateTracker.stopAutoSave();

    // 构建结果
    const duration = Date.now() - startTime;
    const result: SyncResult = {
      success: uploadResult.failedCount === 0,
      filesDiscovered,
      excludedCount,
      oversizedCount,
      candidateCount: valid.length,
      uploadedCount: uploadResult.uploadedCount,
      skippedCount: filesDiscovered - valid.length - uploadResult.uploadedCount,
      failedCount: uploadResult.failedCount,
      failedFiles: uploadResult.failedFiles,
      totalBytesUploaded: uploadResult.totalBytesUploaded,
      duration,
    };

    // 更新会话
    sessionManager.completeSession(result);

    // 发送完成消息
    updateStatus('completed');
    log('info', `同步完成: 上传 ${result.uploadedCount} 个, 跳过 ${result.skippedCount} 个, 失败 ${result.failedCount} 个`);

    sendMessage({
      type: 'sync-complete',
      data: result,
    });
  } catch (err) {
    const error = err as Error;
    log('error', `同步失败: ${error.message}`);

    // 保存状态
    if (stateTracker) {
      try {
        await stateTracker.save();
        stateTracker.stopAutoSave();
      } catch (saveErr) {
        log('error', `保存状态失败: ${(saveErr as Error).message}`);
      }
    }

    const errorInfo: ErrorInfo = {
      code: 'SYNC_ERROR',
      message: error.message,
      details: error,
    };

    sendMessage({
      type: 'sync-error',
      data: errorInfo,
    });
  } finally {
    // 重置状态
    state.status = 'idle';
    state.isPaused = false;
    state.isCancelled = false;
    state.currentSessionId = null;
  }
}

// ============================================================================
// 路径工具函数
// ============================================================================

function getParentRelPath(relPath: string): string {
  const parts = relPath.split('/');
  parts.pop();
  const parentRel = parts.join('/');
  return parentRel === '' ? '' : parentRel;
}

function getBasename(relPath: string): string {
  const parts = relPath.split('/');
  return parts[parts.length - 1] || '';
}

// ============================================================================
// 消息处理
// ============================================================================

/**
 * 处理主线程命令
 */
async function handleCommand(event: MessageEvent<WorkerCommand>): Promise<void> {
  const command = event.data;
  const { type, config, id } = command;

  log('debug', `收到命令: ${type}`);

  switch (type) {
    case 'start-sync':
      if (!config) {
        sendMessage({
          type: 'sync-error',
          data: {
            code: 'INVALID_CONFIG',
            message: '缺少同步配置',
          },
          id,
        });
        return;
      }

      state.config = config;
      state.isPaused = false;
      state.isCancelled = false;

      // 异步执行同步
      executeSync(config).catch((err) => {
        log('error', `同步执行错误: ${err.message}`);
      });

      // 返回会话 ID
      const sessionId = `sync-${Date.now()}`;
      sendMessage({
        type: 'sync-status',
        data: sessionId,
        id,
      });
      break;

    case 'pause-sync':
      state.isPaused = true;
      updateStatus('paused');
      log('info', '同步已暂停');
      sendMessage({
        type: 'sync-status',
        data: 'paused',
        id,
      });
      break;

    case 'resume-sync':
      state.isPaused = false;
      updateStatus('syncing');
      log('info', '同步已恢复');
      sendMessage({
        type: 'sync-status',
        data: 'syncing',
        id,
      });
      break;

    case 'cancel-sync':
      state.isCancelled = true;
      state.isPaused = false;
      updateStatus('idle');
      log('info', '同步已取消');
      sendMessage({
        type: 'sync-status',
        data: 'idle',
        id,
      });
      break;

    case 'check-status':
      sendMessage({
        type: 'sync-status',
        data: state.progress,
        id,
      });
      break;

    default:
      log('warn', `未知命令: ${type}`);
  }
}

// ============================================================================
// Worker 初始化
// ============================================================================

// 设置消息处理器
self.onmessage = handleCommand;

// 发送就绪消息
log('info', 'Worker 已就绪');
