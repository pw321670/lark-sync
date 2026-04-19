import { requestUrl } from 'obsidian';

import type { IAuthStorage } from './auth-storage';

export interface TokenResponse {
  code: number;
  msg: string;
  data?: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

export interface TokenManagerConfig {
  refreshAdvanceMs?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export class TokenManager {
  private readonly config: Required<TokenManagerConfig>;
  private refreshPromise: Promise<TokenRefreshResult> | null = null;

  private static readonly DEFAULT_CONFIG: Required<TokenManagerConfig> = {
    refreshAdvanceMs: 5 * 60 * 1000,
    maxRetries: 3,
    timeoutMs: 30_000,
  };

  constructor(
    private readonly storage: IAuthStorage,
    config: TokenManagerConfig = {},
  ) {
    this.config = {
      ...TokenManager.DEFAULT_CONFIG,
      ...config,
    };
  }

  async getValidAccessToken(clientId: string, clientSecret: string): Promise<TokenRefreshResult> {
    const authData = await this.storage.read();

    if (!authData || !authData.refreshToken) {
      return {
        success: false,
        error: 'No stored Feishu authorization found. Please authorize first.',
      };
    }

    if (!this.needsRefresh(authData.expiresAt)) {
      return {
        success: true,
        accessToken: authData.userAccessToken,
        refreshToken: authData.refreshToken,
      };
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshWithRetry(authData.refreshToken, clientId, clientSecret);
    }

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private needsRefresh(expiresAt: string | null): boolean {
    if (!expiresAt) {
      return true;
    }

    return Date.now() >= new Date(expiresAt).getTime() - this.config.refreshAdvanceMs;
  }

  private async refreshWithRetry(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
  ): Promise<TokenRefreshResult> {
    let lastError = 'Failed to refresh token.';

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt += 1) {
      const result = await this.refreshAccessToken(refreshToken, clientId, clientSecret);
      if (result.success) {
        return result;
      }

      lastError = result.error || lastError;
      if (attempt < this.config.maxRetries) {
        await this.delay(1000);
      }
    }

    return {
      success: false,
      error: lastError,
    };
  }

  private async refreshAccessToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
  ): Promise<TokenRefreshResult> {
    try {
      const response = await this.withTimeout(
        requestUrl({
          url: 'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
          method: 'POST',
          throw: false,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
          }),
        }),
        this.config.timeoutMs,
        'Refresh token request timed out',
      );

      const data = (response.json ?? {}) as TokenResponse;
      if (response.status >= 400) {
        return {
          success: false,
          error: `Refresh token request failed with HTTP ${response.status}`,
        };
      }

      if (data.code !== 0) {
        return {
          success: false,
          error: `Failed to refresh token: ${data.msg} (code: ${data.code})`,
        };
      }

      const accessToken = data.data?.access_token ?? data.access_token ?? '';
      const nextRefreshToken = data.data?.refresh_token ?? data.refresh_token ?? refreshToken;
      const expiresIn = data.data?.expires_in ?? data.expires_in ?? 0;

      if (!accessToken) {
        return {
          success: false,
          error: 'Refresh response did not include an access token.',
        };
      }

      const previousAuth = await this.storage.read();
      await this.storage.write({
        userAccessToken: accessToken,
        refreshToken: nextRefreshToken,
        connectedAt: previousAuth?.connectedAt ?? new Date().toISOString(),
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      });

      return {
        success: true,
        accessToken,
        refreshToken: nextRefreshToken,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to refresh token: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);

      promise.then(
        (value) => {
          window.clearTimeout(timeoutId);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        },
      );
    });
  }
}
