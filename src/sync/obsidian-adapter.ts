/**
 * Obsidian 适配器 - 连接 Obsidian API 和同步协调器
 *
 * 这个适配器实现了 VaultAdapter 接口，使 SyncCoordinator 可以在 Obsidian 插件环境中使用。
 */

import type { VaultAdapter } from './sync-coordinator';
import type { FileReader } from './upload-manager';
import type { FeishuSyncConfig, FeishuAuthState } from '../utils/contracts';

// ============================================================================
// Obsidian App 接口
// ============================================================================

/**
 * Obsidian App 的最小接口定义
 * 使用接口而非具体类，以便在测试时可以 mock
 */
export interface ObsidianApp {
  vault: {
    getFiles(): Array<{ path: string; stat: { size: number; mtime: number } }>;
    readBinary(path: string): Promise<ArrayBuffer>;
    adapter: {
      basePath?: string;
    };
  };
}

// ============================================================================
// Obsidian Vault 适配器实现
// ============================================================================

/**
 * Obsidian Vault 适配器
 * 将 Obsidian API 转换为 SyncCoordinator 期望的 VaultAdapter 接口
 */
export class ObsidianVaultAdapter implements VaultAdapter {
  constructor(private app: ObsidianApp) {}

  /**
   * 获取所有文件
   */
  getFiles(): Array<{ path: string; stat: { size: number; mtime: number } }> {
    const files = this.app.vault.getFiles();

    // 转换为标准格式
    const result = files.map((file: any) => {
      // 确保 path 属性存在
      const path = file.path;
      if (!path) {
        console.error('[ObsidianVaultAdapter] 文件缺少 path 属性:', file);
      }

      return {
        path: path,
        stat: {
          size: file.stat?.size || 0,
          mtime: file.stat?.mtime || file.stat?.mtimeMs || 0,
        },
      };
    });

    console.log('[ObsidianVaultAdapter] 转换后文件数量:', result.length);
    console.log('[ObsidianVaultAdapter] 第一个文件:', result[0]);

    return result;
  }

  /**
   * 读取文件内容（二进制）
   */
  async readBinary(path: string): Promise<ArrayBuffer> {
    return this.app.vault.readBinary(path);
  }

  /**
   * 获取保险库路径
   */
  getVaultPath(): string {
    const adapter = this.app.vault.adapter as { basePath?: string };
    return adapter.basePath ?? 'vault';
  }
}

// ============================================================================
// 同步配置构建器
// ============================================================================

/**
 * 从插件数据构建同步配置
 */
export interface SyncConfigBuilderOptions {
  /** 保险库路径 */
  vaultPath: string;
  /** 插件配置 */
  config: FeishuSyncConfig;
  /** 授权状态 */
  auth: FeishuAuthState;
}

/**
 * 构建 SyncCoordinator 所需的 SyncConfig
 */
export function buildSyncConfig(options: SyncConfigBuilderOptions) {
  const { vaultPath, config, auth } = options;

  return {
    vaultPath,
    feishuRootFolderToken: config.feishuRootFolderToken,
    userAccessToken: auth.userAccessToken,
    appId: config.appId,
    appSecret: config.appSecret,
    refreshToken: auth.refreshToken,
    fileMatchMode: config.fileMatchMode,
    matchList: config.exclude,
    maxDirectUploadMB: config.maxDirectUploadMB,
    concurrentUploads: config.concurrentUploads,
    retryAttempts: config.retryAttempts,
    retryDelay: config.retryDelay,
  };
}

// ============================================================================
// 结果转换器
// ============================================================================

import type { SyncResult } from './types';
import type { SyncSummary as UiSyncSummary } from '../ui/notification-manager';

/**
 * 将 SyncResult 转换为 UI 层的 SyncSummary
 */
export function toUiSyncSummary(result: SyncResult): UiSyncSummary {
  return {
    status: result.success ? 'success' : 'failed',
    startTime: result.duration ? Date.now() - result.duration : undefined,
    endTime: Date.now(),
    filesScanned: result.filesDiscovered,
    uploadedCount: result.uploadedCount,
    skippedCount: result.skippedCount,
    failedCount: result.failedCount,
    firstFailedPath: result.failedFiles[0]?.path,
    errorMessage: result.error,
  };
}

// ============================================================================
// Obsidian 文件读取器
// ============================================================================

/**
 * Obsidian 环境的文件读取器
 * 使用 Obsidian API 读取文件内容
 */
export class ObsidianFileReader implements FileReader {
  constructor(private app: ObsidianApp) {}

  async readFileContent(absPath: string): Promise<ArrayBuffer> {
    console.log('[ObsidianFileReader] 读取文件:', absPath);

    if (!absPath) {
      throw new Error('文件路径为空');
    }

    try {
      const content = await this.app.vault.readBinary(absPath);
      console.log('[ObsidianFileReader] 文件读取成功:', absPath, '大小:', content.byteLength);
      return content;
    } catch (error) {
      console.error('[ObsidianFileReader] 文件读取失败:', absPath, error);
      throw error;
    }
  }
}
