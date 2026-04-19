/**
 * 上传管理器 - 管理文件上传的批处理和并发控制
 */

import type {
  FileEntry,
  SyncConfig,
  SyncProgress,
  SyncStateMap,
} from './types';

// 前向声明 FeishuClient 类型，避免循环引用
interface FeishuClientLike {
  findExistingFiles(folderToken: string, fileName: string): Promise<Array<{ type?: string; token?: string; name: string }>>;
  deleteFile(fileToken: string, fileType?: string): Promise<void>;
  uploadSmallFile(parentFolderToken: string, fileName: string, fileContent: ArrayBuffer, fileSize: number): Promise<string>;
}

// ============================================================================
// 文件读取器接口
// ============================================================================

/**
 * 文件读取器接口
 * 支持不同环境（Node.js vs Obsidian）的文件读取
 */
export interface FileReader {
  readFileContent(absPath: string): Promise<ArrayBuffer>;
}

// ============================================================================
// Node.js 文件读取器
// ============================================================================

/**
 * Node.js 环境的文件读取器
 */
export class NodeFileReader implements FileReader {
  async readFileContent(absPath: string): Promise<ArrayBuffer> {
    const fs = await import('fs');
    return fs.promises.readFile(absPath).then((buffer) => {
      // 在 Node.js 环境中，将 Buffer 转换为 ArrayBuffer
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    });
  }
}

// ============================================================================
// 上传选项
// ============================================================================

export interface UploadOptions {
  /** 并发上传数 */
  concurrency?: number;
  /** 重试次数 */
  retryAttempts?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
  /** 进度回调 */
  onProgress?: (progress: Partial<SyncProgress>) => void;
  /** 取消检查函数（返回 true 表示取消） */
  isCancelled?: () => boolean;
}

// ============================================================================
// 上传结果
// ============================================================================

export interface UploadResult {
  /** 成功上传的文件数 */
  uploadedCount: number;
  /** 跳过的文件数 */
  skippedCount: number;
  /** 失败的文件数 */
  failedCount: number;
  /** 失败的文件列表 */
  failedFiles: Array<{ path: string; error: string }>;
  /** 总上传字节数 */
  totalBytesUploaded: number;
}

// ============================================================================
// 上传任务
// ============================================================================

interface UploadTask {
  file: FileEntry;
  parentFolderToken: string;
}

interface UploadTaskResult {
  file: FileEntry;
  success: boolean;
  error?: string;
  bytesUploaded: number;
}

// ============================================================================
// 上传管理器
// ============================================================================

export class UploadManager {
  private config: SyncConfig;
  private feishuClient: FeishuClientLike;
  private fileReader: FileReader;

  constructor(config: SyncConfig, feishuClient: FeishuClientLike, fileReader?: FileReader) {
    this.config = config;
    this.feishuClient = feishuClient;
    this.fileReader = fileReader || new NodeFileReader();
  }

  /**
   * 批量上传文件
   */
  async uploadFiles(
    files: FileEntry[],
    folderMap: Record<string, string>,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const concurrency = options.concurrency || this.config.concurrentUploads || 3;
    const retryAttempts = options.retryAttempts || this.config.retryAttempts || 3;
    const retryDelay = options.retryDelay || this.config.retryDelay || 1000;

    const result: UploadResult = {
      uploadedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      failedFiles: [],
      totalBytesUploaded: 0,
    };

    // 创建上传任务队列
    const tasks: UploadTask[] = [];
    for (const file of files) {
      const parentRelPath = this.getParentRelPath(file.relPath);
      const parentToken = folderMap[parentRelPath];

      if (!parentToken) {
        result.failedFiles.push({
          path: file.relPath,
          error: `找不到父目录 token: ${parentRelPath}`,
        });
        result.failedCount++;
        continue;
      }

      tasks.push({
        file,
        parentFolderToken: parentToken,
      });
    }

    // 使用并发控制执行上传
    const completedResults = await this.executeWithConcurrency(
      tasks,
      concurrency,
      async (task) => {
        return await this.uploadFileWithRetry(
          task,
          retryAttempts,
          retryDelay,
          options.isCancelled
        );
      },
      options.isCancelled,
      (index) => {
        // 报告进度
        if (options.onProgress) {
          options.onProgress({
            processedCount: index + 1,
            currentFile: tasks[index]?.file.relPath || null,
          });
        }
      }
    );

    // 统计结果
    for (const item of completedResults) {
      if (!item) continue;

      if (item.success) {
        result.uploadedCount++;
        result.totalBytesUploaded += item.bytesUploaded;
      } else {
        result.failedCount++;
        result.failedFiles.push({
          path: item.file.relPath,
          error: item.error || '未知错误',
        });
      }
    }

    return result;
  }

  /**
   * 带重试的单文件上传
   */
  private async uploadFileWithRetry(
    task: UploadTask,
    retryAttempts: number,
    retryDelay: number,
    isCancelled?: () => boolean
  ): Promise<UploadTaskResult> {
    const { file, parentFolderToken } = task;

    console.log(`[UploadManager] 开始上传任务 (共 ${retryAttempts} 次重试):`, {
      fileName: this.getFileName(file.absPath),
      absPath: file.absPath,
      relPath: file.relPath,
      retryAttempts
    });

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      // 检查是否取消
      if (isCancelled && isCancelled()) {
        return {
          file,
          success: false,
          error: '操作已取消',
          bytesUploaded: 0,
        };
      }

      console.log(`[UploadManager] 第 ${attempt}/${retryAttempts} 次尝试上传:`, this.getFileName(file.absPath));

      try {
        const bytesUploaded = await this.uploadFile(file, parentFolderToken);
        console.log(`[UploadManager] 上传成功:`, this.getFileName(file.absPath));
        return {
          file,
          success: true,
          bytesUploaded,
        };
      } catch (err) {
        const error = err as Error;
        lastError = error.message;

        console.error(`[UploadManager] 第 ${attempt} 次尝试失败:`, error.message);

        // 最后一次尝试失败时不再等待
        if (attempt < retryAttempts) {
          console.log(`[UploadManager] 等待 ${retryDelay * attempt}ms 后重试...`);
          await this.sleep(retryDelay * attempt);
        }
      }
    }

    console.error(`[UploadManager] 所有尝试失败:`, this.getFileName(file.absPath));
    return {
      file,
      success: false,
      error: lastError,
      bytesUploaded: 0,
    };
  }

  /**
   * 上传单个文件
   */
  private async uploadFile(file: FileEntry, parentFolderToken: string): Promise<number> {
    const fileName = this.getFileName(file.absPath);

    console.log('[UploadManager] 文件信息:', {
      fileName,
      absPath: file.absPath,
      relPath: file.relPath,
      size: file.size
    });

    this.log('info', `开始上传文件: ${fileName}`);

    try {
      // 读取文件内容
      const fileContent = await this.readFileContent(file.absPath);
      this.log('debug', `文件读取成功: ${fileName}, 大小: ${fileContent.byteLength} bytes`);

      // 直接上传文件（飞书会自动覆盖同名文件）
      await this.feishuClient.uploadSmallFile(
        parentFolderToken,
        fileName,
        fileContent,
        file.size
      );

      this.log('info', `文件上传成功: ${fileName}`);
      return file.size;
    } catch (error) {
      this.log('error', `文件上传失败 [${fileName}]: ${(error as Error).message}`);
      throw error;
    }
  }

  private log(level: string, message: string): void {
    // 简单的日志输出，可以后续扩展
    console.log(`[UploadManager:${level}] ${message}`);
  }

  /**
   * 使用并发控制执行任务
   */
  private async executeWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
    isCancelled?: () => boolean,
    onItemComplete?: (index: number) => void
  ): Promise<(R | undefined)[]> {
    const results: (R | undefined)[] = new Array(items.length);
    const executing: Array<Promise<void>> = [];
    let currentIndex = 0;

    const executeNext = async (): Promise<void> => {
      // 检查是否取消
      if (isCancelled && isCancelled()) {
        return;
      }

      const index = currentIndex++;
      if (index >= items.length) {
        return;
      }

      const item = items[index];
      if (!item) {
        return;
      }

      const promise = (async () => {
        try {
          const result = await fn(item);
          if (result !== undefined) {
            results[index] = result;
          }
          onItemComplete?.(index);
        } catch (err) {
          // 错误已经被 fn 内部处理
          const errorResult: any = {
            success: false,
            error: (err as Error).message,
          };
          results[index] = errorResult as R;
        }
      })();

      executing.push(promise);

      // 当任务数达到并发限制时，等待一个任务完成
      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }

      // 移除已完成的任务
      executing.splice(
        executing.findIndex((p) => p === promise),
        1
      );

      // 继续执行下一个任务
      await executeNext();
    };

    // 启动并发任务
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
      executeNext()
    );

    await Promise.all(workers);

    // 过滤掉未定义的结果（被取消的任务）
    return results.filter((r): r is R => r !== undefined);
  }

  /**
   * 读取文件内容
   */
  private async readFileContent(absPath: string): Promise<ArrayBuffer> {
    return this.fileReader.readFileContent(absPath);
  }

  /**
   * 获取父目录的相对路径
   */
  private getParentRelPath(relPath: string): string {
    const parts = relPath.split('/');
    parts.pop();
    const parentRel = parts.join('/');
    return parentRel === '' ? '' : parentRel;
  }

  /**
   * 从绝对路径获取文件名
   */
  private getFileName(absPath: string): string {
    const parts = absPath.split('/');
    return parts[parts.length - 1] || '';
  }

  /**
   * 睡眠指定时间
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
