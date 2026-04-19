/**
 * Token 管理器
 *
 * 负责 access_token 的刷新和状态管理。
 * 自动处理 token 过期并尝试刷新。
 */

import type { IAuthStorage, StoredAuthData, AuthStatus } from "./auth-storage";

/**
 * Token 响应（飞书 API 返回）
 */
export interface TokenResponse {
  code: number;
  msg: string;
  data?: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  // 旧版本 API 兼容
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Token 刷新结果
 */
export interface TokenRefreshResult {
  /** 是否成功 */
  success: boolean;
  /** 新的访问令牌 */
  accessToken?: string;
  /** 新的刷新令牌 */
  refreshToken?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * Token 管理器配置
 */
export interface TokenManagerConfig {
  /** 提前刷新时间（毫秒），默认 5 分钟 */
  refreshAdvanceMs?: number;
  /** 刷新重试次数 */
  maxRetries?: number;
  /** 刷新超时时间（毫秒） */
  timeoutMs?: number;
}

/**
 * Token 管理器
 */
export class TokenManager {
  private readonly storage: IAuthStorage;
  private readonly config: Required<TokenManagerConfig>;
  private refreshPromise: Promise<TokenRefreshResult> | null = null;

  // 默认配置
  private static readonly DEFAULT_CONFIG: Required<TokenManagerConfig> = {
    refreshAdvanceMs: 5 * 60 * 1000, // 5 分钟
    maxRetries: 3,
    timeoutMs: 30000 // 30 秒
  };

  /**
   * 创建 Token 管理器实例
   * @param storage 授权存储
   * @param config 配置选项
   */
  constructor(storage: IAuthStorage, config: TokenManagerConfig = {}) {
    this.storage = storage;
    this.config = {
      ...TokenManager.DEFAULT_CONFIG,
      ...config
    };
  }

  /**
   * 检查 token 是否需要刷新
   * @param expiresAt 过期时间（ISO 8601）
   */
  private needsRefresh(expiresAt: string | null): boolean {
    if (!expiresAt) {
      return true; // 没有过期时间，认为需要刷新
    }
    const expiryTime = new Date(expiresAt).getTime();
    const now = Date.now();
    return now >= (expiryTime - this.config.refreshAdvanceMs);
  }

  /**
   * 使用刷新令牌获取新的访问令牌
   * @param refreshToken 刷新令牌
   * @param clientId 应用 ID
   * @param clientSecret 应用密钥
   */
  private async refreshAccessToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string
  ): Promise<TokenRefreshResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch("https://open.feishu.cn/open-apis/authen/v2/refresh_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: refreshToken
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data: TokenResponse = await response.json();

      if (data.code !== 0) {
        return {
          success: false,
          error: `刷新 token 失败: ${data.msg} (code: ${data.code})`
        };
      }

      // 处理新版本和旧版本 API 响应格式
      const accessToken = data.data?.access_token ?? data.access_token ?? "";
      const newRefreshToken = data.data?.refresh_token ?? data.refresh_token ?? "";
      const expiresIn = data.data?.expires_in ?? data.expires_in ?? 0;

      if (!accessToken) {
        return {
          success: false,
          error: "未获取到 access_token"
        };
      }

      // 计算过期时间
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // 保存新的 token
      await this.storage.write({
        userAccessToken: accessToken,
        refreshToken: newRefreshToken || refreshToken, // 如果没有返回新的刷新令牌，保留旧的
        connectedAt: (await this.storage.read())?.connectedAt ?? new Date().toISOString(),
        expiresAt
      });

      return {
        success: true,
        accessToken,
        refreshToken: newRefreshToken || refreshToken
      };

    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          success: false,
          error: "刷新 token 超时"
        };
      }
      return {
        success: false,
        error: `刷新 token 失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 获取有效的访问令牌
   * 如果 token 过期或不存在，会自动尝试刷新
   * @param clientId 应用 ID
   * @param clientSecret 应用密钥
   */
  async getValidAccessToken(clientId: string, clientSecret: string): Promise<TokenRefreshResult> {
    const authData = await this.storage.read();

    // 没有授权数据
    if (!authData || !authData.refreshToken) {
      return {
        success: false,
        error: "未找到授权信息，请先完成授权"
      };
    }

    // 检查是否需要刷新
    if (this.needsRefresh(authData.expiresAt)) {
      // 如果已经在刷新中，返回同一个 Promise
      if (this.refreshPromise) {
        return this.refreshPromise;
      }

      // 创建新的刷新 Promise
      this.refreshPromise = this.performRefreshWithRetry(
        authData.refreshToken,
        clientId,
        clientSecret
      );

      try {
        const result = await this.refreshPromise;
        return result;
      } finally {
        this.refreshPromise = null;
      }
    }

    // Token 有效，直接返回
    return {
      success: true,
      accessToken: authData.userAccessToken,
      refreshToken: authData.refreshToken
    };
  }

  /**
   * 带重试的刷新操作
   */
  private async performRefreshWithRetry(
    refreshToken: string,
    clientId: string,
    clientSecret: string
  ): Promise<TokenRefreshResult> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      const result = await this.refreshAccessToken(refreshToken, clientId, clientSecret);
      if (result.success) {
        return result;
      }
      lastError = result.error;

      // 最后一次尝试不需要等待
      if (attempt < this.config.maxRetries) {
        await this.delay(1000 * attempt); // 递增延迟
      }
    }

    return {
      success: false,
      error: lastError || "刷新失败，已达到最大重试次数"
    };
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 验证当前的访问令牌
   * 返回 token 是否有效
   */
  async validateCurrentToken(): Promise<boolean> {
    const authData = await this.storage.read();
    if (!authData || !authData.userAccessToken) {
      return false;
    }
    return !this.needsRefresh(authData.expiresAt);
  }

  /**
   * 获取授权状态
   */
  async getAuthStatus(): Promise<AuthStatus> {
    const authData = await this.storage.read();
    if (!authData || !authData.refreshToken) {
      return "unauthorized" as AuthStatus;
    }
    if (this.needsRefresh(authData.expiresAt)) {
      return "expired" as AuthStatus;
    }
    return "authorized" as AuthStatus;
  }

  /**
   * 强制刷新 token
   */
  async forceRefresh(clientId: string, clientSecret: string): Promise<TokenRefreshResult> {
    const authData = await this.storage.read();
    if (!authData || !authData.refreshToken) {
      return {
        success: false,
        error: "未找到授权信息，请先完成授权"
      };
    }

    return this.performRefreshWithRetry(
      authData.refreshToken,
      clientId,
      clientSecret
    );
  }
}
