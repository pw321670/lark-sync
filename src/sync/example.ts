/**
 * 同步引擎使用示例
 *
 * 此文件展示如何使用同步引擎模块
 */

import type { SyncProgress, SyncResult } from './types';
import type { SyncConfig } from './types';
import { SyncCoordinator } from './sync-coordinator';

// ============================================================================
// 创建同步配置
// ============================================================================

function createSyncConfig(vaultPath: string, config: {
  feishuRootFolderToken: string;
  appId: string;
  appSecret: string;
  userAccessToken: string;
  refreshToken: string;
  fileMatchMode?: 'exclude' | 'include';
  exclude?: string[];
  maxDirectUploadMB?: number;
}): SyncConfig {
  return {
    vaultPath,
    feishuRootFolderToken: config.feishuRootFolderToken,
    appId: config.appId,
    appSecret: config.appSecret,
    userAccessToken: config.userAccessToken,
    refreshToken: config.refreshToken,
    fileMatchMode: config.fileMatchMode || 'exclude',
    matchList: config.exclude || [
      '.trash',
      '.obsidian/workspace.json',
      '.obsidian/workspaces.json',
    ],
    maxDirectUploadMB: config.maxDirectUploadMB || 20,
    concurrentUploads: 3,
    retryAttempts: 3,
    retryDelay: 1000,
  };
}

// ============================================================================
// 使用同步协调器
// ============================================================================

import type { VaultAdapter } from './sync-coordinator';

async function runSync() {
  // 创建 Vault 适配器（实际使用时需要实现）
  const vaultAdapter: VaultAdapter = {
    getFiles: () => [],
    readBinary: async (_path) => new ArrayBuffer(0),
    getVaultPath: () => '/path/to/vault',
  };

  // 创建协调器
  const coordinator = new SyncCoordinator(vaultAdapter, {
    verbose: true,
  });

  // 设置事件监听器
  coordinator.onProgress((progress: SyncProgress) => {
    console.log(`进度: ${progress.percentage}% (${progress.processedCount}/${progress.totalCount})`);
    if (progress.currentFile) {
      console.log(`当前文件: ${progress.currentFile}`);
    }
  });

  coordinator.onComplete((result: SyncResult) => {
    console.log('同步完成:', result);
    console.log(`上传: ${result.uploadedCount}, 跳过: ${result.skippedCount}, 失败: ${result.failedCount}`);
  });

  coordinator.onError((error) => {
    console.error('同步错误:', error);
  });

  coordinator.onStatusChange((status) => {
    console.log('状态变化:', status);
  });

  coordinator.onLog((level, message) => {
    console.log(`[${level}]`, message);
  });

  try {
    // 初始化协调器
    await coordinator.initialize();

    // 创建配置
    const config = createSyncConfig('/path/to/vault', {
      feishuRootFolderToken: 'your_folder_token',
      appId: 'your_app_id',
      appSecret: 'your_app_secret',
      userAccessToken: 'your_access_token',
      refreshToken: 'your_refresh_token',
    });

    // 开始同步
    await coordinator.startSync(config);

    // 可以暂停
    // await coordinator.pauseSync();

    // 可以恢复
    // await coordinator.resumeSync();

    // 可以取消
    // await coordinator.cancelSync();

  } finally {
    // 清理
    await coordinator.destroy();
  }
}

// ============================================================================
// 直接使用组件（不使用 Worker）
// ============================================================================

import { FileScanner } from './file-scanner';
import { FeishuClient } from './feishu-client';
import { UploadManager } from './upload-manager';
import { StateTracker } from './state-tracker';

async function runSyncDirect() {
  // 创建配置
  const config: SyncConfig = {
    vaultPath: '/path/to/vault',
    feishuRootFolderToken: 'root_folder_token',
    userAccessToken: 'your_access_token',
    appId: 'your_app_id',
    appSecret: 'your_app_secret',
    refreshToken: 'your_refresh_token',
    fileMatchMode: 'exclude',
    matchList: ['.trash'],
    maxDirectUploadMB: 20,
    concurrentUploads: 3,
    retryAttempts: 3,
    retryDelay: 1000,
  };

  // 创建组件
  const scanner = new FileScanner();
  const feishuClient = new FeishuClient({
    userAccessToken: config.userAccessToken,
    appId: config.appId,
    appSecret: config.appSecret,
    refreshToken: config.refreshToken,
  });
  const stateTracker = new StateTracker();
  const uploadManager = new UploadManager(config, feishuClient);

  try {
    // 加载状态
    await stateTracker.load();

    // 扫描文件
    const scanResult = await scanner.scanVault('/path/to/vault', {
      fileMatchMode: 'exclude',
      matchList: ['.trash'],
      collectStats: true,
    });

    console.log(`发现 ${scanResult.files.length} 个文件`);

    // 检测变化
    const prevState = stateTracker.getAllStates();
    const changedFiles = scanner.detectChanges(scanResult.files, prevState);

    console.log(`${changedFiles.length} 个文件需要上传`);

    // 上传文件
    const folderMap = { '': 'root_folder_token' };
    const uploadResult = await uploadManager.uploadFiles(
      changedFiles,
      folderMap,
      {
        concurrency: 3,
        retryAttempts: 3,
        onProgress: (progress) => {
          console.log(`进度: ${progress.processedCount}/${progress.totalCount}`);
        },
      }
    );

    console.log(`上传完成: ${uploadResult.uploadedCount} 个成功, ${uploadResult.failedCount} 个失败`);

  } finally {
    // 保存状态
    await stateTracker.save();
  }
}

export { runSync, runSyncDirect };
