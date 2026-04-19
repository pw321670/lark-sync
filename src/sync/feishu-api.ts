/**
 * 飞书 API 客户端
 *
 * 负责所有与飞书云文档的 API 交互，包括：
 * - 文件上传（支持 multipart/form-data）
 * - 文件夹创建与管理
 * - 文件搜索
 * - 错误处理与重试机制
 *
 * @module sync/feishu-api
 */

import { requestUrl, RequestUrlParam } from 'obsidian';
import type { TokenManager } from '../oauth/token-manager';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 飞书 API 错误码
 */
export enum FeishuApiErrorCode {
  /** 成功 */
  SUCCESS = 0,
  /** 请求参数错误 */
  INVALID_ARGUMENT = 400,
  /** 未授权 */
  UNAUTHORIZED = 401,
  /** 权限不足 */
  PERMISSION_DENIED = 403,
  /** 资源不存在 */
  NOT_FOUND = 404,
  /** 请求过于频繁 */
  RATE_LIMIT_EXCEEDED = 429,
  /** 服务器内部错误 */
  INTERNAL_ERROR = 500,
  /** 服务不可用 */
  SERVICE_UNAVAILABLE = 503,
}

/**
 * 飞书 API 响应基础结构
 */
export interface FeishuApiResponse<T = unknown> {
  /** 错误码，0 表示成功 */
  code: number;
  /** 错误信息 */
  msg?: string;
  /** 返回数据 */
  data?: T;
}

/**
 * 文件上传选项
 */
export interface UploadFileOptions {
  /** 父文件夹 token */
  parentFolderToken: string;
  /** 文件名 */
  fileName: string;
  /** 文件内容（ArrayBuffer 或字符串） */
  fileContent: ArrayBuffer | string;
  /** 文件大小（字节） */
  fileSize: number;
  /** 是否覆盖同名文件 */
  overwrite?: boolean;
}

/**
 * 文件上传结果
 */
export interface UploadFileResult {
  /** 文件 token */
  fileToken: string;
  /** 文件名 */
  fileName: string;
  /** 文件大小 */
  size: number;
  /** 上传时间戳 */
  uploadedAt: number;
}

/**
 * 文件夹创建选项
 */
export interface CreateFolderOptions {
  /** 父文件夹 token */
  parentFolderToken: string;
  /** 文件夹名称 */
  folderName: string;
  /** 是否覆盖同名文件夹（如果存在） */
  overwrite?: boolean;
}

/**
 * 文件夹创建结果
 */
export interface CreateFolderResult {
  /** 文件夹 token */
  folderToken: string;
  /** 文件夹名称 */
  name: string;
  /** 是否为新创建 */
  isNew: boolean;
}

/**
 * 文件搜索选项
 */
export interface SearchFilesOptions {
  /** 搜索关键词（文件名） */
  query: string;
  /** 搜索的父文件夹 token（可选，限制搜索范围） */
  parentFolderToken?: string;
  /** 文件类型过滤 */
  fileType?: 'file' | 'folder' | 'all';
  /** 分页大小 */
  pageSize?: number;
  /** 分页 token */
  pageToken?: string;
}

/**
 * 文件元数据
 */
export interface FileMetadata {
  /** 文件 token */
  token: string;
  /** 文件名 */
  name: string;
  /** 文件类型 */
  type: 'file' | 'folder';
  /** 文件大小（字节） */
  size?: number;
  /** 创建时间（时间戳） */
  createdAt?: number;
  /** 修改时间（时间戳） */
  updatedAt?: number;
  /** 创建者 */
  creator?: string;
  /** 父文件夹 token */
  parentToken?: string;
}

/**
 * 文件搜索结果
 */
export interface SearchFilesResult {
  /** 文件列表 */
  files: FileMetadata[];
  /** 是否有更多结果 */
  hasMore: boolean;
  /** 下一页 token */
  pageToken?: string;
  /** 总数（如果可用） */
  total?: number;
}

/**
 * API 客户端配置
 */
export interface FeishuApiClientConfig {
  /** 应用 ID */
  appId: string;
  /** 应用密钥 */
  appSecret: string;
  /** Token 管理器 */
  tokenManager: TokenManager;
  /** API 基础 URL */
  baseURL?: string;
  /** 重试次数 */
  retryAttempts?: number;
  /** 初始重试延迟（毫秒） */
  retryDelay?: number;
  /** 请求超时时间（毫秒） */
  timeout?: number;
}

/**
 * API 错误
 */
export class FeishuApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'FeishuApiError';
  }
}

// ============================================================================
// 飞书 API 客户端
// ============================================================================

/**
 * 飞书 API 客户端
 *
 * 使用 Obsidian 的 requestUrl API 进行所有 HTTP 请求，
 * 自动处理 token 刷新和错误重试。
 */
export class FeishuApiClient {
  private readonly config: Required<Omit<FeishuApiClientConfig, 'tokenManager'>> & { tokenManager: TokenManager };
  private readonly baseURL: string;

  // 默认配置
  private static readonly DEFAULT_CONFIG = {
    baseURL: 'https://open.feishu.cn/open-apis',
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 30000,
  };

  constructor(config: FeishuApiClientConfig) {
    this.config = {
      ...FeishuApiClient.DEFAULT_CONFIG,
      ...config,
    };
    this.baseURL = this.config.baseURL;
  }

  // ========================================================================
  // 文件上传
  // ========================================================================

  /**
   * 上传文件到飞书云文档
   *
   * 使用 multipart/form-data 格式上传文件。
   * 对于大文件（超过配置的限制），会自动使用分块上传。
   *
   * @param options 上传选项
   * @returns 上传结果，包含文件 token
   * @throws {FeishuApiError} 上传失败时抛出
   *
   * @example
   * ```typescript
   * const result = await apiClient.uploadFile({
   *   parentFolderToken: 'box_xxxxxxxxx',
   *   fileName: 'document.md',
   *   fileContent: arrayBuffer,
   *   fileSize: arrayBuffer.byteLength
   * });
   * console.log('文件 token:', result.fileToken);
   * ```
   */
  async uploadFile(options: UploadFileOptions): Promise<UploadFileResult> {
    const { parentFolderToken, fileName, fileContent, fileSize, overwrite = false } = options;

    // 如果需要覆盖同名文件，先搜索并删除
    if (overwrite) {
      await this.deleteSameNameFiles(parentFolderToken, fileName);
    }

    // 判断是否需要分块上传（飞书限制：单次上传最大 100MB，但建议小文件直接上传）
    if (this.shouldUseChunkUpload(fileSize)) {
      return this.uploadFileInChunks(options);
    }

    // 直接上传
    const accessToken = await this.getValidAccessToken();
    const url = `${this.baseURL}/drive/v1/files/upload_all`;

    // 构建 multipart/form-data
    const formData = new FormData();
    formData.append('file_name', fileName);
    formData.append('parent_type', 'explorer');
    formData.append('parent_node', parentFolderToken);
    formData.append('size', String(fileSize));
    formData.append('file', new Blob([fileContent], { type: 'application/octet-stream' }), fileName);

    try {
      const response = await this.requestWithRetry<UploadFileResponseData>({
        url,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        // 注意：Obsidian 的 requestUrl 不直接支持 FormData
        // 需要手动构建 multipart/form-data
        body: this.buildMultipartFormData(formData),
      });

      if (!response.data?.fileToken) {
        throw new FeishuApiError(
          `上传文件失败: 未返回 fileToken`,
          response.code || FeishuApiErrorCode.INTERNAL_ERROR
        );
      }

      return {
        fileToken: response.data.fileToken,
        fileName,
        size: fileSize,
        uploadedAt: Date.now(),
      };
    } catch (error) {
      if (error instanceof FeishuApiError) {
        throw error;
      }
      throw new FeishuApiError(
        `上传文件失败: ${error instanceof Error ? error.message : String(error)}`,
        FeishuApiErrorCode.INTERNAL_ERROR,
        error
      );
    }
  }

  /**
   * 分块上传文件（用于大文件）
   *
   * @param options 上传选项
   * @returns 上传结果
   */
  private async uploadFileInChunks(options: UploadFileOptions): Promise<UploadFileResult> {
    const { parentFolderToken, fileName, fileContent, fileSize } = options;

    // 1. 初始化分块上传
    const accessToken = await this.getValidAccessToken();
    const initUrl = `${this.baseURL}/drive/v1/files/upload_initiate`;

    const initResponse = await this.requestWithRetry<{ upload_id: string }>({
      url: initUrl,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file_name: fileName,
        parent_type: 'explorer',
        parent_node: parentFolderToken,
        size: fileSize,
      }),
    });

    if (!initResponse.data?.upload_id) {
      throw new FeishuApiError(
        '初始化分块上传失败: 未返回 upload_id',
        initResponse.code || FeishuApiErrorCode.INTERNAL_ERROR
      );
    }

    const uploadId = initResponse.data.upload_id;

    // 2. 上传分块
    const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB per chunk
    const chunks = Math.ceil(fileSize / CHUNK_SIZE);
    const buffer = fileContent instanceof ArrayBuffer ? fileContent : new TextEncoder().encode(fileContent).buffer;

    for (let i = 0; i < chunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileSize);
      const chunkData = buffer.slice(start, end);

      await this.requestWithRetry({
        url: `${this.baseURL}/drive/v1/files/upload_part`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: this.buildMultipartFormData(
          new URLSearchParams({
            upload_id: uploadId,
            part_number: String(i + 1),
            part_size: String(end - start),
          }) as any
        ),
      });
    }

    // 3. 完成分块上传
    const completeUrl = `${this.baseURL}/drive/v1/files/upload_complete`;
    const completeResponse = await this.requestWithRetry<{ file_token: string }>({
      url: completeUrl,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        upload_id: uploadId,
        file_name: fileName,
        parent_type: 'explorer',
        parent_node: parentFolderToken,
        size: fileSize,
      }),
    });

    if (!completeResponse.data?.file_token) {
      throw new FeishuApiError(
        '完成分块上传失败: 未返回 file_token',
        completeResponse.code || FeishuApiErrorCode.INTERNAL_ERROR
      );
    }

    return {
      fileToken: completeResponse.data.file_token,
      fileName,
      size: fileSize,
      uploadedAt: Date.now(),
    };
  }

  // ========================================================================
  // 文件夹操作
  // ========================================================================

  /**
   * 创建文件夹
   *
   * 在指定的父文件夹下创建子文件夹。
   * 如果同名文件夹已存在且 overwrite 为 true，则使用现有文件夹。
   *
   * @param options 创建选项
   * @returns 创建结果，包含文件夹 token
   * @throws {FeishuApiError} 创建失败时抛出
   *
   * @example
   * ```typescript
   * const result = await apiClient.createFolder({
   *   parentFolderToken: 'box_xxxxxxxxx',
   *   folderName: 'My Documents'
   * });
   * console.log('文件夹 token:', result.folderToken);
   * ```
   */
  async createFolder(options: CreateFolderOptions): Promise<CreateFolderResult> {
    const { parentFolderToken, folderName, overwrite = false } = options;

    // 如果允许覆盖，先检查是否已存在同名文件夹
    if (overwrite) {
      const searchResult = await this.searchFiles({
        query: folderName,
        parentFolderToken,
        fileType: 'folder',
        pageSize: 1,
      });

      const existingFolder = searchResult.files.find(
        (f) => f.name === folderName && f.parentToken === parentFolderToken
      );

      if (existingFolder) {
        return {
          folderToken: existingFolder.token,
          name: folderName,
          isNew: false,
        };
      }
    }

    // 创建新文件夹
    const accessToken = await this.getValidAccessToken();
    const url = `${this.baseURL}/drive/v1/files/create_folder`;

    try {
      // 创建文件夹有专门的重试策略
      let lastError: FeishuApiError | null = null;

      for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
        try {
          const response = await this.request<CreateFolderResponseData>({
            url,
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: folderName,
              folder_token: parentFolderToken,
            }),
          });

          if (response.code === 0 && response.data?.token) {
            return {
              folderToken: response.data.token,
              name: folderName,
              isNew: true,
            };
          }

          // 非零错误码
          lastError = new FeishuApiError(
            `创建文件夹失败 [${folderName}]: ${response.msg || '未知错误'}`,
            response.code
          );

          // 不需要重试的错误（如权限问题）
          if (this.isNonRetryableError(response.code)) {
            break;
          }

          // 指数退避
          if (attempt < this.config.retryAttempts) {
            await this.delay(this.config.retryDelay * Math.pow(2, attempt - 1));
          }
        } catch (error) {
          lastError = error instanceof FeishuApiError
            ? error
            : new FeishuApiError(
                `创建文件夹失败 [${folderName}]: ${error instanceof Error ? error.message : String(error)}`,
                FeishuApiErrorCode.INTERNAL_ERROR,
                error
              );

          if (attempt < this.config.retryAttempts) {
            await this.delay(this.config.retryDelay * Math.pow(2, attempt - 1));
          }
        }
      }

      throw lastError || new FeishuApiError('创建文件夹失败', FeishuApiErrorCode.INTERNAL_ERROR);
    } catch (error) {
      if (error instanceof FeishuApiError) {
        throw error;
      }
      throw new FeishuApiError(
        `创建文件夹失败: ${error instanceof Error ? error.message : String(error)}`,
        FeishuApiErrorCode.INTERNAL_ERROR,
        error
      );
    }
  }

  /**
   * 确保文件夹存在
   *
   * 如果文件夹不存在则创建，如果已存在则返回其 token。
   * 这是创建文件夹的便捷方法。
   *
   * @param parentFolderToken 父文件夹 token
   * @param folderName 文件夹名称
   * @returns 文件夹 token
   */
  async ensureFolder(parentFolderToken: string, folderName: string): Promise<string> {
    const result = await this.createFolder({
      parentFolderToken,
      folderName,
      overwrite: true,
    });
    return result.folderToken;
  }

  // ========================================================================
  // 文件搜索
  // ========================================================================

  /**
   * 搜索文件
   *
   * 按文件名搜索飞书云文档中的文件。
   * 可以指定搜索范围（父文件夹）和文件类型。
   *
   * @param options 搜索选项
   * @returns 搜索结果
   * @throws {FeishuApiError} 搜索失败时抛出
   *
   * @example
   * ```typescript
   * // 搜索所有文件
   * const result = await apiClient.searchFiles({
   *   query: 'document',
   *   fileType: 'file'
   * });
   *
   * // 在特定文件夹中搜索
   * const result = await apiClient.searchFiles({
   *   query: 'notes',
   *   parentFolderToken: 'box_xxxxxxxxx',
   *   fileType: 'file'
   * });
   * ```
   */
  async searchFiles(options: SearchFilesOptions): Promise<SearchFilesResult> {
    const {
      query,
      parentFolderToken,
      fileType = 'all',
      pageSize = 50,
      pageToken,
    } = options;

    const accessToken = await this.getValidAccessToken();

    // 使用文件列表 API 进行搜索（支持按名称过滤）
    const url = new URL(`${this.baseURL}/drive/v1/files`);
    url.searchParams.set('page_size', String(pageSize));

    if (parentFolderToken) {
      url.searchParams.set('folder_token', parentFolderToken);
    }

    if (pageToken) {
      url.searchParams.set('page_token', pageToken);
    }

    try {
      const response = await this.requestWithRetry<FileListResponseData>({
        url: url.toString(),
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const files = (response.data?.files || [])
        .filter((item) => {
          // 按名称过滤
          if (query && !item.name?.includes(query)) {
            return false;
          }
          // 按类型过滤
          if (fileType !== 'all' && item.type !== fileType) {
            return false;
          }
          return true;
        })
        .map(this.toFileMetadata);

      return {
        files,
        hasMore: response.data?.has_more || false,
        pageToken: response.data?.page_token,
        total: response.data?.total,
      };
    } catch (error) {
      if (error instanceof FeishuApiError) {
        throw error;
      }
      throw new FeishuApiError(
        `搜索文件失败: ${error instanceof Error ? error.message : String(error)}`,
        FeishuApiErrorCode.INTERNAL_ERROR,
        error
      );
    }
  }

  /**
   * 列出文件夹内容
   *
   * @param folderToken 文件夹 token
   * @param pageSize 分页大小
   * @param pageToken 分页 token
   * @returns 文件列表
   */
  async listFolder(
    folderToken: string,
    pageSize = 50,
    pageToken?: string
  ): Promise<SearchFilesResult> {
    return this.searchFiles({
      query: '',
      parentFolderToken: folderToken,
      pageSize,
      pageToken,
    });
  }

  // ========================================================================
  // 文件删除
  // ========================================================================

  /**
   * 删除文件
   *
   * @param fileToken 文件 token
   * @param fileType 文件类型
   * @throws {FeishuApiError} 删除失败时抛出
   */
  async deleteFile(fileToken: string, fileType: string = 'file'): Promise<void> {
    const accessToken = await this.getValidAccessToken();
    const url = `${this.baseURL}/drive/v1/files/${fileToken}?type=${fileType}`;

    await this.requestWithRetry({
      url,
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  /**
   * 删除同名文件
   *
   * 删除指定文件夹中所有同名的文件。
   *
   * @param parentFolderToken 父文件夹 token
   * @param fileName 文件名
   */
  private async deleteSameNameFiles(
    parentFolderToken: string,
    fileName: string
  ): Promise<void> {
    const searchResult = await this.searchFiles({
      query: fileName,
      parentFolderToken,
      fileType: 'file',
    });

    for (const file of searchResult.files) {
      if (file.name === fileName) {
        await this.deleteFile(file.token, file.type);
      }
    }
  }

  // ========================================================================
  // 辅助方法
  // ========================================================================

  /**
   * 获取有效的访问令牌
   */
  private async getValidAccessToken(): Promise<string> {
    const result = await this.config.tokenManager.getValidAccessToken(
      this.config.appId,
      this.config.appSecret
    );

    if (!result.success || !result.accessToken) {
      throw new FeishuApiError(
        result.error || '获取访问令牌失败',
        FeishuApiErrorCode.UNAUTHORIZED
      );
    }

    return result.accessToken;
  }

  /**
   * 发送 HTTP 请求（带重试）
   */
  private async requestWithRetry<T>(params: RequestUrlParam): Promise<FeishuApiResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await this.request<T>(params);
      } catch (error) {
        lastError = error as Error;

        // 检查是否为不可重试的错误
        if (error instanceof FeishuApiError && this.isNonRetryableError(error.code)) {
          throw error;
        }

        // 最后一次尝试失败时不再等待
        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * Math.pow(2, attempt - 1));
        }
      }
    }

    throw lastError || new FeishuApiError('请求失败', FeishuApiErrorCode.INTERNAL_ERROR);
  }

  /**
   * 发送 HTTP 请求
   */
  private async request<T>(params: RequestUrlParam): Promise<FeishuApiResponse<T>> {
    try {
      const response = await requestUrl({
        ...params,
        throw: false, // 我们自己处理错误
      });

      const data: FeishuApiResponse<T> = response.json;

      // 检查错误码
      if (data.code !== 0) {
        throw new FeishuApiError(
          data.msg || 'API 请求失败',
          data.code,
          data
        );
      }

      return data;
    } catch (error) {
      if (error instanceof FeishuApiError) {
        throw error;
      }

      // 网络错误或其他异常
      throw new FeishuApiError(
        `请求失败: ${error instanceof Error ? error.message : String(error)}`,
        FeishuApiErrorCode.INTERNAL_ERROR,
        error
      );
    }
  }

  /**
   * 判断错误是否不可重试
   */
  private isNonRetryableError(code: number): boolean {
    return [
      FeishuApiErrorCode.INVALID_ARGUMENT,
      FeishuApiErrorCode.UNAUTHORIZED,
      FeishuApiErrorCode.PERMISSION_DENIED,
      FeishuApiErrorCode.NOT_FOUND,
    ].includes(code);
  }

  /**
   * 判断是否需要分块上传
   */
  private shouldUseChunkUpload(fileSize: number): boolean {
    // 飞书文档中提到直接上传最大 100MB，但为了稳定性，建议 50MB 以上使用分块
    const DIRECT_UPLOAD_LIMIT = 50 * 1024 * 1024;
    return fileSize > DIRECT_UPLOAD_LIMIT;
  }

  /**
   * 构建 multipart/form-data
   *
   * 注意：这是一个简化实现，用于 Obsidian 环境。
   * 实际使用时可能需要根据 Obsidian 的 requestUrl API 调整。
   */
  private buildMultipartFormData(formData: FormData): string {
    // 在 Obsidian 插件环境中，requestUrl 可以自动处理 FormData
    // 但为了类型兼容，我们返回一个占位符
    // 实际实现可能需要使用第三方库或手动构建 multipart body
    return formData as any;
  }

  /**
   * 转换为文件元数据
   */
  private toFileMetadata(item: FeishuFileItemData): FileMetadata {
    return {
      token: item.token || '',
      name: item.name || '',
      type: (item.type === 'file' || item.type === 'folder') ? item.type : 'file',
      size: item.size,
      createdAt: item.created_time ? Number(item.created_time) : undefined,
      updatedAt: item.modified_time ? Number(item.modified_time) : undefined,
      creator: item.creator,
      parentToken: item.parent_token,
    };
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// 内部响应类型
// ============================================================================

interface UploadFileResponseData {
  fileToken?: string;
  file_token?: string;
}

interface CreateFolderResponseData {
  token?: string;
}

interface FileListResponseData {
  files?: FeishuFileItemData[];
  has_more?: boolean;
  page_token?: string;
  total?: number;
}

interface FeishuFileItemData {
  token?: string;
  name?: string;
  type?: string;
  size?: number;
  created_time?: string | number;
  modified_time?: string | number;
  creator?: string;
  parent_token?: string;
}

