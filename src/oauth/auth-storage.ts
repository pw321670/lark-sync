/**
 * OAuth 授权数据持久化存储
 *
 * 负责 OAuth 相关数据的持久化，包括 token、授权状态等。
 * 与 Obsidian 的数据存储系统集成。
 */

import type { FeishuAuthState } from "../utils/contracts";

/**
 * 授权状态枚举
 */
export enum AuthStatus {
  /** 未授权 */
  Unauthorized = "unauthorized",
  /** 已授权 */
  Authorized = "authorized",
  /** Token 过期 */
  Expired = "expired",
  /** 刷新中 */
  Refreshing = "refreshing"
}

/**
 * 存储的授权数据
 */
export interface StoredAuthData {
  /** 用户访问令牌 */
  userAccessToken: string;
  /** 刷新令牌 */
  refreshToken: string;
  /** 授权时间 (ISO 8601) */
  connectedAt: string | null;
  /** Token 过期时间 (ISO 8601) */
  expiresAt: string | null;
}

/**
 * 存储接口抽象
 */
export interface IAuthStorage {
  /** 读取授权数据 */
  read(): Promise<StoredAuthData | null>;
  /** 写入授权数据 */
  write(data: StoredAuthData): Promise<void>;
  /** 清除授权数据 */
  clear(): Promise<void>;
  /** 检查是否有有效授权 */
  hasValidAuth(): Promise<boolean>;
  /** 保存数据回调（无参数，因为数据已经直接修改） */
  saveData?(): Promise<void>;
}

/**
 * Obsidian 插件授权存储实现
 */
export class AuthStorage implements IAuthStorage {
  private readonly getAuthState: () => FeishuAuthState;
  private readonly saveCallback?: () => Promise<void>;

  /**
   * 创建授权存储实例
   * @param authState 授权状态引用
   * @param saveCallback 保存数据回调（可选，无参数）
   */
  constructor(authState: FeishuAuthState, saveCallback?: () => Promise<void>) {
    // 创建一个getter函数来始终获取最新的auth对象
    this.getAuthState = () => authState;
    this.saveCallback = saveCallback;
  }

  /**
   * 读取授权数据
   */
  async read(): Promise<StoredAuthData | null> {
    const { userAccessToken, refreshToken, connectedAt } = this.getAuthState();

    if (!userAccessToken && !refreshToken) {
      return null;
    }

    return {
      userAccessToken,
      refreshToken,
      connectedAt,
      expiresAt: null // 由 TokenManager 计算
    };
  }

  /**
   * 写入授权数据
   */
  async write(data: StoredAuthData): Promise<void> {
    const authState = this.getAuthState();
    authState.userAccessToken = data.userAccessToken;
    authState.refreshToken = data.refreshToken;
    authState.connectedAt = data.connectedAt;

    // 调用保存回调（数据已经被直接修改）
    if (this.saveCallback) {
      await this.saveCallback();
    }
  }

  /**
   * 清除授权数据
   */
  async clear(): Promise<void> {
    const authState = this.getAuthState();
    authState.userAccessToken = "";
    authState.refreshToken = "";
    authState.connectedAt = null;

    // 调用保存回调
    if (this.saveCallback) {
      await this.saveCallback();
    }
  }

  /**
   * 检查是否有有效授权
   */
  async hasValidAuth(): Promise<boolean> {
    const data = await this.read();
    return data !== null && data.refreshToken.length > 0;
  }

  /**
   * 获取当前授权状态
   */
  getAuthStatus(): AuthStatus {
    const authState = this.getAuthState();
    if (!authState.refreshToken) {
      return AuthStatus.Unauthorized;
    }
    if (!authState.userAccessToken) {
      return AuthStatus.Expired;
    }
    return AuthStatus.Authorized;
  }

  /**
   * 获取刷新令牌（用于 token 刷新）
   */
  getRefreshToken(): string {
    return this.getAuthState().refreshToken;
  }

  /**
   * 获取用户访问令牌（用于 API 调用）
   */
  getUserAccessToken(): string {
    return this.getAuthState().userAccessToken;
  }

  /**
   * 获取授权时间
   */
  getConnectedAt(): string | null {
    return this.getAuthState().connectedAt;
  }
}
