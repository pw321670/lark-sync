import { FeishuDocClient, FeishuDocClientError } from './feishu-doc-client';
import type { FileEntry, FileState, RemoteFileRef, SyncConfig, SyncStateMap } from './types';

interface FeishuClientLike {
  findExistingFiles(
    folderToken: string,
    fileName: string,
  ): Promise<Array<{ type?: string; token?: string; name: string }>>;
  findExistingItems(
    folderToken: string,
    itemName: string,
    allowedTypes?: string[],
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
  uploadedStates: Array<{
    relPath: string;
    size: number;
    mtimeMs: number;
    remote?: RemoteFileRef;
  }>;
}

interface UploadTask {
  file: FileEntry;
  parentFolderToken: string;
  previousState?: FileState;
}

interface UploadTaskResult {
  file: FileEntry;
  success: boolean;
  error?: string;
  bytesUploaded: number;
  remote?: RemoteFileRef;
}

interface UploadOperationResult {
  bytesUploaded: number;
  remote?: RemoteFileRef;
}

export class UploadManager {
  constructor(
    private readonly config: SyncConfig,
    private readonly feishuClient: FeishuClientLike,
    private readonly fileReader: FileReader,
    private readonly feishuDocClient?: FeishuDocClient,
  ) {}

  async uploadFiles(
    files: FileEntry[],
    folderMap: Record<string, string>,
    previousStates: SyncStateMap = {},
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
      uploadedStates: [],
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

      tasks.push({
        file,
        parentFolderToken: parentToken,
        previousState: previousStates[file.relPath],
      });
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
        result.uploadedStates.push({
          relPath: item.file.relPath,
          size: item.file.size,
          mtimeMs: item.file.mtimeMs,
          remote: item.remote,
        });
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
    const { file, parentFolderToken, previousState } = task;
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
        const upload = await this.uploadFile(file, parentFolderToken, previousState);
        return {
          file,
          success: true,
          bytesUploaded: upload.bytesUploaded,
          remote: upload.remote,
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

  private async uploadFile(
    file: FileEntry,
    parentFolderToken: string,
    previousState?: FileState,
  ): Promise<UploadOperationResult> {
    const fileName = this.getFileName(file.relPath);

    console.log('[UploadManager] 准备上传文件:', {
      relPath: file.relPath,
      fileName,
      size: file.size,
      parentFolderToken,
      mtimeMs: file.mtimeMs,
    });

    try {
      if (
        this.isMarkdownFile(fileName) &&
        this.feishuDocClient &&
        this.config.markdownSyncMode !== 'file'
      ) {
        return await this.uploadAsDocument(file, parentFolderToken, fileName, previousState);
      }

      return await this.uploadAsRegularFile(file, parentFolderToken, fileName);
    } catch (error) {
      console.error('[UploadManager] 文件上传失败:', {
        fileName,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  private async uploadAsDocument(
    file: FileEntry,
    parentFolderToken: string,
    fileName: string,
    previousState?: FileState,
  ): Promise<UploadOperationResult> {
    console.log('[UploadManager] 检测到 Markdown 文件，准备同步为在线文档:', fileName);

    const fileContent = await this.fileReader.readFileContent(file.relPath);
    const markdownText = new TextDecoder().decode(fileContent);
    const docTitle = fileName.replace(/\.md$/i, '') || '未命名文档';

    console.log('[UploadManager] Markdown 内容读取成功:', {
      fileName,
      contentLength: markdownText.length,
      originalSize: file.size,
    });

    const previousToken = this.getStoredDocumentToken(previousState);
    let remoteRef: RemoteFileRef | undefined;

    if (previousToken) {
      try {
        await this.feishuDocClient!.updateDocument(previousToken, markdownText);
        remoteRef = this.buildDocumentRef(previousToken, docTitle, parentFolderToken);
        console.log('[UploadManager] 使用已记录 docId 原位更新成功:', {
          relPath: file.relPath,
          docId: previousToken,
        });
      } catch (error) {
        if (!this.isMissingDocumentError(error)) {
          throw error;
        }

        console.warn('[UploadManager] 已记录 docId 指向的文档不存在，准备恢复或重建:', {
          relPath: file.relPath,
          docId: previousToken,
        });
      }
    }

    if (!remoteRef) {
      const recoveredToken = await this.recoverExistingDocumentToken(parentFolderToken, docTitle);
      if (recoveredToken) {
        await this.feishuDocClient!.updateDocument(recoveredToken, markdownText);
        remoteRef = this.buildDocumentRef(recoveredToken, docTitle, parentFolderToken);
        console.log('[UploadManager] 通过同目录同标题恢复到已有文档:', {
          relPath: file.relPath,
          docId: recoveredToken,
        });
      }
    }

    if (!remoteRef) {
      const created = await this.feishuDocClient!.createDocument(docTitle, markdownText, {
        parentFolderToken,
      });
      remoteRef = this.buildDocumentRef(created.docId, docTitle, parentFolderToken, created.docUrl);
      console.log('[UploadManager] 在线文档创建成功:', {
        fileName,
        docId: created.docId,
        docUrl: created.docUrl,
      });
    }

    return {
      bytesUploaded: file.size,
      remote: remoteRef,
    };
  }

  private async uploadAsRegularFile(
    file: FileEntry,
    parentFolderToken: string,
    fileName: string,
  ): Promise<UploadOperationResult> {
    const fileContent = await this.fileReader.readFileContent(file.relPath);

    console.log('[UploadManager] 文件内容读取成功:', {
      fileName,
      contentSize: fileContent.byteLength,
      expectedSize: file.size,
      sizeMatch: fileContent.byteLength === file.size,
    });

    await this.deleteExistingFiles(parentFolderToken, fileName);
    await this.feishuClient.uploadSmallFile(parentFolderToken, fileName, fileContent, file.size);

    console.log('[UploadManager] 文件上传成功:', fileName);
    return {
      bytesUploaded: file.size,
    };
  }

  private async recoverExistingDocumentToken(
    parentFolderToken: string,
    docTitle: string,
  ): Promise<string | undefined> {
    const existingItems = await this.feishuClient.findExistingItems(parentFolderToken, docTitle);
    const documentTokens: string[] = [];

    for (const existingItem of existingItems) {
      if (!existingItem.token) {
        continue;
      }

      if (await this.feishuDocClient!.documentExists(existingItem.token)) {
        documentTokens.push(existingItem.token);
      }
    }

    if (documentTokens.length === 0) {
      return undefined;
    }

    if (documentTokens.length > 1) {
      console.warn(
        `[UploadManager] Found ${documentTokens.length} existing documents named "${docTitle}" in the same remote folder; reusing the first match to avoid creating more duplicates.`,
      );
    }

    return documentTokens[0];
  }

  private getStoredDocumentToken(previousState?: FileState): string | undefined {
    if (previousState?.remote?.type !== 'document') {
      return undefined;
    }

    return previousState.remote.token;
  }

  private buildDocumentRef(
    token: string,
    title: string,
    parentFolderToken: string,
    url = this.buildDocumentUrl(token),
  ): RemoteFileRef {
    return {
      type: 'document',
      token,
      title,
      parentFolderToken,
      url,
    };
  }

  private buildDocumentUrl(docId: string): string {
    return `https://www.feishu.cn/docx/${docId}`;
  }

  private isMissingDocumentError(error: unknown): boolean {
    return error instanceof FeishuDocClientError && error.isMissing;
  }

  private async deleteExistingFiles(parentFolderToken: string, fileName: string): Promise<void> {
    await this.deleteExistingItems(parentFolderToken, fileName, ['file']);
  }

  private async deleteExistingItems(
    parentFolderToken: string,
    itemName: string,
    allowedTypes?: string[],
  ): Promise<void> {
    const existingItems = await this.feishuClient.findExistingItems(
      parentFolderToken,
      itemName,
      allowedTypes,
    );

    for (const existingItem of existingItems) {
      if (!existingItem.token) {
        continue;
      }

      await this.feishuClient.deleteFile(existingItem.token, existingItem.type || 'file');
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

  private isMarkdownFile(fileName: string): boolean {
    return fileName.toLowerCase().endsWith('.md');
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
