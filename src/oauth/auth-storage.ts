import type { FeishuAuthState } from '../utils/contracts';

export interface StoredAuthData {
  userAccessToken: string;
  refreshToken: string;
  connectedAt: string | null;
  expiresAt: string | null;
}

export interface IAuthStorage {
  read(): Promise<StoredAuthData | null>;
  write(data: StoredAuthData): Promise<void>;
  clear(): Promise<void>;
}

export class AuthStorage implements IAuthStorage {
  constructor(
    private readonly getAuthState: () => FeishuAuthState,
    private readonly saveCallback?: () => Promise<void>,
  ) {}

  async read(): Promise<StoredAuthData | null> {
    const authState = this.getAuthState();
    if (!authState.userAccessToken && !authState.refreshToken) {
      return null;
    }

    return {
      userAccessToken: authState.userAccessToken,
      refreshToken: authState.refreshToken,
      connectedAt: authState.connectedAt,
      expiresAt: authState.expiresAt,
    };
  }

  async write(data: StoredAuthData): Promise<void> {
    const authState = this.getAuthState();
    authState.userAccessToken = data.userAccessToken;
    authState.refreshToken = data.refreshToken;
    authState.connectedAt = data.connectedAt;
    authState.expiresAt = data.expiresAt;

    if (this.saveCallback) {
      await this.saveCallback();
    }
  }

  async clear(): Promise<void> {
    const authState = this.getAuthState();
    authState.userAccessToken = '';
    authState.refreshToken = '';
    authState.connectedAt = null;
    authState.expiresAt = null;

    if (this.saveCallback) {
      await this.saveCallback();
    }
  }
}
