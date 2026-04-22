import { requestUrl } from 'obsidian';

import type { FeishuApiResponse, FeishuFileItem, UploadFileResponse } from './types';

export interface FeishuClientConfig {
  userAccessToken: string;
  baseURL?: string;
  retryAttempts?: number;
  retryDelay?: number;
}

interface FeishuRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
  contentType?: string;
  skipRetry?: boolean;
}

export class FeishuClient {
  private readonly baseURL: string;
  private readonly retryAttempts: number;
  private readonly retryDelay: number;

  constructor(private readonly config: FeishuClientConfig) {
    this.baseURL = config.baseURL || 'https://open.feishu.cn/open-apis';
    this.retryAttempts = config.retryAttempts ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
  }

  async listFolderItems(folderToken: string): Promise<FeishuFileItem[]> {
    const url = new URL(`${this.baseURL}/drive/v1/files`);
    url.searchParams.set('folder_token', folderToken);
    url.searchParams.set('page_size', '200');

    const response = await this.fetchWithRetry<{ files?: FeishuFileItem[] }>(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.config.userAccessToken}`,
      },
    });

    return (response.data?.files || []).map((item) => ({
      type: item.type || '',
      name: item.name || '',
      token: item.token || '',
    }));
  }

  async createFolder(parentFolderToken: string, folderName: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      try {
        const response = await this.fetchWithRetry<{ token?: string }>(
          `${this.baseURL}/drive/v1/files/create_folder`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.config.userAccessToken}`,
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
              name: folderName,
              folder_token: parentFolderToken,
            }),
            skipRetry: true,
          },
        );

        if (response.data?.token) {
          return response.data.token;
        }

        lastError = new Error(`Create folder returned no token for ${folderName}`);
      } catch (error) {
        lastError = error as Error;
      }

      if (attempt < this.retryAttempts) {
        await this.sleep(this.retryDelay);
      }
    }

    throw lastError || new Error(`Failed to create folder: ${folderName}`);
  }

  async ensureFolder(parentFolderToken: string, folderName: string): Promise<string> {
    const items = await this.listFolderItems(parentFolderToken);
    const existing = items.find((item) => item.type === 'folder' && item.name === folderName);

    if (existing?.token) {
      return existing.token;
    }

    return this.createFolder(parentFolderToken, folderName);
  }

  async findExistingFiles(folderToken: string, fileName: string): Promise<FeishuFileItem[]> {
    return this.findExistingItems(folderToken, fileName, ['file']);
  }

  async findExistingItems(
    folderToken: string,
    itemName: string,
    allowedTypes?: string[],
  ): Promise<FeishuFileItem[]> {
    const items = await this.listFolderItems(folderToken);
    return items.filter((item) => {
      if (item.name !== itemName || item.type === 'folder') {
        return false;
      }

      if (!allowedTypes || allowedTypes.length === 0) {
        return true;
      }

      return allowedTypes.includes(item.type);
    });
  }

  async deleteFile(fileToken: string, fileType = 'file'): Promise<void> {
    const url = new URL(`${this.baseURL}/drive/v1/files/${fileToken}`);
    url.searchParams.set('type', fileType);

    await this.fetchWithRetry(url.toString(), {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.config.userAccessToken}`,
      },
    });
  }

  async uploadSmallFile(
    parentFolderToken: string,
    fileName: string,
    fileContent: ArrayBuffer,
    fileSize: number,
  ): Promise<string> {
    const { body, contentType } = this.buildMultipartBody(
      {
        file_name: fileName,
        parent_type: 'explorer',
        parent_node: parentFolderToken,
        size: String(fileSize),
      },
      fileName,
      fileContent,
    );

    // 🔍 调试信息：上传前记录详细信息（方便后续删除）
    try {
      const response = await this.fetchWithRetry<UploadFileResponse>(
        `${this.baseURL}/drive/v1/files/upload_all`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.userAccessToken}`,
          },
          contentType,
          body,
        },
      );

      const token = response.data?.fileToken ?? response.data?.file_token ?? response.data?.token;
      if (!token) {
        console.error('[Feishu Upload] 响应中缺少文件 token:', response);
        throw new Error(`Upload response missing file token: ${JSON.stringify(response)}`);
      }

      return token;
    } catch (error) {
      console.error('[Feishu Upload] 上传失败:', {
        fileName,
        error: error instanceof Error ? error.message : String(error),
        fileSize,
        parentFolderToken
      });
      throw error;
    }
  }

  private async fetchWithRetry<T>(
    url: string,
    init?: FeishuRequestOptions,
  ): Promise<FeishuApiResponse<T>> {
    const maxAttempts = init?.skipRetry ? 1 : this.retryAttempts;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await requestUrl({
          url,
          method: init?.method || 'GET',
          headers: init?.headers,
          contentType: init?.contentType,
          body: init?.body,
        });

        const data = response.json as FeishuApiResponse<T>;

        if (data.code !== 0) {
          throw new Error(`Feishu API error (code=${data.code}): ${data.msg || 'unknown error'}`);
        }

        return data;
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxAttempts) {
          const delay = this.isRateLimitError(lastError)
            ? this.retryDelay * Math.pow(2, attempt)
            : this.retryDelay;
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Request failed');
  }

  private isRateLimitError(error: Error): boolean {
    return error.message.includes('99991400') || error.message.includes('frequency limit');
  }

  private buildMultipartBody(
    fields: Record<string, string>,
    fileName: string,
    fileContent: ArrayBuffer,
  ): { body: ArrayBuffer; contentType: string } {
    const boundary = `----Boundary${Date.now().toString(16)}`;
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];

    // 🔍 调试信息：记录 multipart 构建过程（方便后续删除）
    // 添加表单字段
    for (const [name, value] of Object.entries(fields)) {
      const chunk = encoder.encode(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
        `${value}\r\n`
      );
      chunks.push(chunk);
    }

    // 添加文件字段 - 转义文件名中的特殊字符以防止 multipart 注入
    // 移除可能破坏 multipart 格式的字符：引号、换行符等
    const safeFileName = fileName.replace(/[\r\n"]/g, '');

    const fileHeader = encoder.encode(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${safeFileName}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    );

    chunks.push(fileHeader);
    chunks.push(new Uint8Array(fileContent));
    chunks.push(encoder.encode(`\r\n--${boundary}--\r\n`));

    // 合并所有 chunk
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      body: merged.buffer,
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
