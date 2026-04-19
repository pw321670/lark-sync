import type { FileEntry, SyncConfig } from './types';

interface FeishuClientLike {
  findExistingFiles(
    folderToken: string,
    fileName: string,
  ): Promise<Array<{ type?: string; token?: string; name: string }>>;
  deleteFile(fileToken: string, fileType?: string): Promise<void>;
  uploadSmallFile(
    parentFolderToken: string,
    fileName: string,
    fileContent: ArrayBuffer,
    fileSize: number,
  ): Promise<string>;
}

export interface FileReader {
  readFileContent(path: string): Promise<ArrayBuffer>;
}

export interface UploadOptions {
  concurrency?: number;
  retryAttempts?: number;
  retryDelay?: number;
  isCancelled?: () => boolean;
}

export interface UploadResult {
  uploadedCount: number;
  failedCount: number;
  failedFiles: Array<{ path: string; error: string }>;
  totalBytesUploaded: number;
}

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

export class UploadManager {
  constructor(
    private readonly config: SyncConfig,
    private readonly feishuClient: FeishuClientLike,
    private readonly fileReader: FileReader,
  ) {}

  async uploadFiles(
    files: FileEntry[],
    folderMap: Record<string, string>,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    const concurrency = options.concurrency || this.config.concurrentUploads || 3;
    const retryAttempts = options.retryAttempts || this.config.retryAttempts || 3;
    const retryDelay = options.retryDelay || this.config.retryDelay || 1000;

    const result: UploadResult = {
      uploadedCount: 0,
      failedCount: 0,
      failedFiles: [],
      totalBytesUploaded: 0,
    };

    const tasks: UploadTask[] = [];
    for (const file of files) {
      const parentRelPath = this.getParentRelPath(file.relPath);
      const parentToken = folderMap[parentRelPath];

      if (!parentToken) {
        result.failedFiles.push({
          path: file.relPath,
          error: `Parent folder token not found: ${parentRelPath}`,
        });
        result.failedCount += 1;
        continue;
      }

      tasks.push({ file, parentFolderToken: parentToken });
    }

    const completedResults = await this.executeWithConcurrency(
      tasks,
      concurrency,
      (task) => this.uploadFileWithRetry(task, retryAttempts, retryDelay, options.isCancelled),
      options.isCancelled,
    );

    for (const item of completedResults) {
      if (item.success) {
        result.uploadedCount += 1;
        result.totalBytesUploaded += item.bytesUploaded;
        continue;
      }

      result.failedCount += 1;
      result.failedFiles.push({
        path: item.file.relPath,
        error: item.error || 'Unknown upload error',
      });
    }

    return result;
  }

  private async uploadFileWithRetry(
    task: UploadTask,
    retryAttempts: number,
    retryDelay: number,
    isCancelled?: () => boolean,
  ): Promise<UploadTaskResult> {
    const { file, parentFolderToken } = task;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
      if (isCancelled?.()) {
        return {
          file,
          success: false,
          error: 'Operation cancelled',
          bytesUploaded: 0,
        };
      }

      try {
        const bytesUploaded = await this.uploadFile(file, parentFolderToken);
        return {
          file,
          success: true,
          bytesUploaded,
        };
      } catch (error) {
        lastError = (error as Error).message;

        if (attempt < retryAttempts) {
          this.log('warn', `Retrying ${file.relPath} after failure: ${lastError}`);
          await this.sleep(retryDelay);
        }
      }
    }

    this.log('error', `Upload failed after ${retryAttempts} attempts: ${file.relPath}`);
    return {
      file,
      success: false,
      error: lastError,
      bytesUploaded: 0,
    };
  }

  private async uploadFile(file: FileEntry, parentFolderToken: string): Promise<number> {
    const fileName = this.getFileName(file.relPath);
    const fileContent = await this.fileReader.readFileContent(file.relPath);

    await this.deleteExistingFiles(parentFolderToken, fileName);
    await this.feishuClient.uploadSmallFile(parentFolderToken, fileName, fileContent, file.size);

    return file.size;
  }

  private async deleteExistingFiles(parentFolderToken: string, fileName: string): Promise<void> {
    const existingFiles = await this.feishuClient.findExistingFiles(parentFolderToken, fileName);

    for (const existingFile of existingFiles) {
      if (!existingFile.token) {
        continue;
      }

      await this.feishuClient.deleteFile(existingFile.token, existingFile.type || 'file');
    }
  }

  private async executeWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
    isCancelled?: () => boolean,
  ): Promise<R[]> {
    const results: Array<R | undefined> = new Array(items.length);
    const executing = new Set<Promise<void>>();
    let currentIndex = 0;

    const executeNext = async (): Promise<void> => {
      if (isCancelled?.()) {
        return;
      }

      const index = currentIndex;
      currentIndex += 1;
      if (index >= items.length) {
        return;
      }

      const item = items[index];
      if (item === undefined) {
        return;
      }

      let promise: Promise<void> | null = null;
      promise = (async () => {
        try {
          results[index] = await fn(item);
        } catch (error) {
          results[index] = {
            success: false,
            error: (error as Error).message,
          } as R;
        } finally {
          if (promise) {
            executing.delete(promise);
          }
        }
      })();

      executing.add(promise);

      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }

      await executeNext();
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, () => executeNext()),
    );
    await Promise.all(executing);

    return results.filter((item): item is R => item !== undefined);
  }

  private getParentRelPath(relPath: string): string {
    const parts = relPath.split('/');
    parts.pop();
    return parts.join('/');
  }

  private getFileName(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1] || '';
  }

  private log(level: 'warn' | 'error', message: string): void {
    if (level === 'error') {
      console.error(`[UploadManager:${level}] ${message}`);
      return;
    }

    if (this.config.logLevel === 'error') {
      return;
    }

    console.warn(`[UploadManager:${level}] ${message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
