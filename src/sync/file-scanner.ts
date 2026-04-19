/**
 * 文件扫描器 - 扫描本地保险库文件系统，进行变化检测
 */

import { normalizeRelPath, shouldMatchFile } from '../utils/path-utils';
import type {
  FileSystemEntry,
  FileEntry,
  DirEntry,
  SyncConfig,
  SyncStateMap,
} from './types';

// ============================================================================
// 文件系统适配器接口
// ============================================================================

export interface FileSystemAdapter {
  readdir(absPath: string): Promise<string[]>;
  stat(absPath: string): Promise<{ size: number; mtimeMs: number; isDirectory: boolean }>;
}

// ============================================================================
// Node.js 文件系统适配器
// ============================================================================

class NodeFileSystemAdapter implements FileSystemAdapter {
  constructor(private fs: typeof import('fs')) {}

  async readdir(absPath: string): Promise<string[]> {
    return this.fs.promises.readdir(absPath);
  }

  async stat(absPath: string): Promise<{ size: number; mtimeMs: number; isDirectory: boolean }> {
    const stats = await this.fs.promises.stat(absPath);
    return {
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      isDirectory: stats.isDirectory(),
    };
  }
}

// ============================================================================
// 扫描选项
// ============================================================================

export interface ScanOptions {
  /** 文件匹配模式 */
  fileMatchMode: 'exclude' | 'include';
  /** 匹配规则（排除或白名单） */
  matchList: string[];
  /** 扫描进度回调 */
  onProgress?: (currentDir: string, entryCount: number) => void;
  /** 是否包含统计信息 */
  collectStats?: boolean;
}

// ============================================================================
// 扫描结果
// ============================================================================

export interface ScanResult {
  /** 所有文件条目 */
  files: FileEntry[];
  /** 所有目录条目 */
  dirs: DirEntry[];
  /** 排除的文件数 */
  excludedCount: number;
  /** 统计信息 */
  stats?: {
    totalEntries: number;
    totalSize: number;
  };
}

// ============================================================================
// 文件扫描器
// ============================================================================

export class FileScanner {
  private fs: FileSystemAdapter;

  constructor(fs?: FileSystemAdapter) {
    this.fs = fs || new NodeFileSystemAdapter(require('fs'));
  }

  /**
   * 扫描保险库目录
   */
  async scanVault(vaultPath: string, options: ScanOptions): Promise<ScanResult> {
    const files: FileEntry[] = [];
    const dirs: DirEntry[] = [];
    let excludedCount = 0;
    let totalEntries = 0;
    let totalSize = 0;

    const scanDir = async (currentDir: string): Promise<void> => {
      let entries: string[];
      try {
        entries = await this.fs.readdir(currentDir);
      } catch (error) {
        // 跳过无法读取的目录
        return;
      }

      for (const entryName of entries) {
        const absPath = `${currentDir}/${entryName}`;
        const relPath = normalizeRelPath(absPath.replace(vaultPath + '/', ''));

        // 根据模式检查文件是否应该被处理
        if (!shouldMatchFile(relPath, options.matchList, options.fileMatchMode)) {
          excludedCount++;
          continue;
        }

        totalEntries++;

        try {
          const stats = await this.fs.stat(absPath);

          if (stats.isDirectory) {
            const dirEntry: DirEntry = {
              type: 'dir',
              absPath,
              relPath,
            };
            dirs.push(dirEntry);

            // 递归扫描子目录
            await scanDir(absPath);
          } else {
            const fileEntry: FileEntry = {
              type: 'file',
              absPath,
              relPath,
              size: stats.size,
              mtimeMs: stats.mtimeMs,
            };
            files.push(fileEntry);
            totalSize += stats.size;
          }

          // 报告进度
          if (options.onProgress) {
            options.onProgress(relPath, totalEntries);
          }
        } catch (error) {
          // 跳过无法访问的文件
          continue;
        }
      }
    };

    await scanDir(vaultPath);

    // 按相对路径排序
    files.sort((a, b) => a.relPath.localeCompare(b.relPath));
    dirs.sort((a, b) => a.relPath.localeCompare(b.relPath));

    return {
      files,
      dirs,
      excludedCount,
      stats: options.collectStats
        ? {
            totalEntries,
            totalSize,
          }
        : undefined,
    };
  }

  /**
   * 检测文件变化
   * @returns 需要上传的文件列表
   */
  detectChanges(files: FileEntry[], prevState: SyncStateMap): FileEntry[] {
    return files.filter((file) => {
      const prev = prevState[file.relPath];
      return !prev || prev.size !== file.size || prev.mtimeMs !== file.mtimeMs;
    });
  }

  /**
   * 筛选超大文件
   */
  filterOversizedFiles(files: FileEntry[], maxSizeMB: number): {
    valid: FileEntry[];
    oversized: FileEntry[];
  } {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    const valid: FileEntry[] = [];
    const oversized: FileEntry[] = [];

    for (const file of files) {
      if (file.size > maxSizeBytes) {
        oversized.push(file);
      } else {
        valid.push(file);
      }
    }

    return { valid, oversized };
  }
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * 格式化持续时间
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}分${remainingSeconds}秒` : `${minutes}分`;
}
