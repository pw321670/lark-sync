/**
 * 飞书 OAuth 2.0 授权流程管理
 *
 * 实现完整的飞书开放平台 OAuth 2.0 授权流程。
 * 支持本地 HTTP 服务器接收回调，处理授权码换取 token。
 */

import { Notice, requestUrl } from "obsidian";
import type { IAuthStorage, StoredAuthData } from "./auth-storage";
import { TokenManager, type TokenRefreshResult } from "./token-manager";

/**
 * 飞书 OAuth 配置
 */
export interface FeishuOAuthConfig {
  /** 应用 ID */
  appId: string;
  /** 应用密钥 */
  appSecret: string;
  /** 回调地址 */
  redirectUri: string;
}

/**
 * OAuth 授权结果
 */
export interface OAuthResult {
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 用户访问令牌 */
  accessToken?: string;
  /** 刷新令牌 */
  refreshToken?: string;
}

/**
 * HTTP 服务器选项
 */
export interface ServerOptions {
  /** 服务器主机名 */
  host?: string;
  /** 请求超时时间（毫秒） */
  timeoutMs?: number;
}

/**
 * 服务器回调处理结果
 */
type ServerCallbackResult =
  | { success: true; code: string }
  | { success: false; error: string };

/**
 * 飞书 OAuth 管理器
 */
export class FeishuOAuth {
  private readonly config: FeishuOAuthConfig;
  private readonly storage: IAuthStorage;
  private readonly tokenManager: TokenManager;
  private server: any | null = null; // Node.js HTTP Server

  // OAuth 作用域
  private static readonly SCOPES = [
    "offline_access",      // 离线访问权限，获取 refresh_token
    "drive:drive",         // 云磁盘权限
    "drive:drive:readonly" // 云盘只读权限
  ];

  /**
   * 创建飞书 OAuth 实例
   * @param config OAuth 配置
   * @param storage 授权存储
   */
  constructor(config: FeishuOAuthConfig, storage: IAuthStorage) {
    this.config = config;
    this.storage = storage;
    this.tokenManager = new TokenManager(storage);
  }

  /**
   * 构建授权 URL
   */
  private buildAuthUrl(): string {
    const scope = FeishuOAuth.SCOPES.join(" ");
    const params = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: scope
    });

    return `https://accounts.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`;
  }

  /**
   * 解析回调地址获取端口
   */
  private getCallbackPort(): number {
    try {
      const url = new URL(this.config.redirectUri);
      return Number(url.port) || 3333;
    } catch {
      return 3333;
    }
  }

  /**
   * 解析回调地址获取路径
   */
  private getCallbackPath(): string {
    try {
      const url = new URL(this.config.redirectUri);
      return url.pathname;
    } catch {
      return "/callback";
    }
  }

  /**
   * 使用授权码换取访问令牌
   * @param code 授权码
   */
  private async exchangeCodeForToken(code: string): Promise<OAuthResult> {
    try {
      console.log("开始换取访问令牌...");
      console.log("授权码:", code);
      console.log("App ID:", this.config.appId);
      console.log("回调地址:", this.config.redirectUri);

      const tokenUrl = "https://open.feishu.cn/open-apis/authen/v2/oauth/token";
      const requestBody = {
        grant_type: "authorization_code",
        client_id: this.config.appId,
        client_secret: this.config.appSecret,
        code: code,
        redirect_uri: this.config.redirectUri
      };

      console.log("请求URL:", tokenUrl);
      console.log("请求体:", JSON.stringify({ ...requestBody, client_secret: "***" }));

      // 使用 Obsidian 的 requestUrl API 而不是 fetch
      const response = await requestUrl({
        url: tokenUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify(requestBody)
      });

      console.log("响应状态:", response.status);
      console.log("响应数据:", JSON.stringify(response.json, null, 2));

      const data = response.json;

      if (data.code !== 0) {
        return {
          success: false,
          error: `获取访问令牌失败: ${data.msg} (code: ${data.code})`
        };
      }

      // 处理新版本和旧版本 API 响应格式
      const accessToken = data.data?.access_token ?? data.access_token ?? "";
      const refreshToken = data.data?.refresh_token ?? data.refresh_token ?? "";
      const expiresIn = data.data?.expires_in ?? data.expires_in ?? 0;

      if (!accessToken) {
        return {
          success: false,
          error: `未获取到 access_token，返回内容：${JSON.stringify(data)}`
        };
      }

      // 计算过期时间
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // 保存授权数据
      const authData: StoredAuthData = {
        userAccessToken: accessToken,
        refreshToken: refreshToken,
        connectedAt: new Date().toISOString(),
        expiresAt
      };

      await this.storage.write(authData);

      return {
        success: true,
        accessToken,
        refreshToken
      };

    } catch (error) {
      console.error("换取令牌异常:", error);
      return {
        success: false,
        error: `换取访问令牌时发生错误: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 启动本地 HTTP 服务器接收回调
   * @param options 服务器选项
   */
  private startCallbackServer(options: ServerOptions = {}): Promise<ServerCallbackResult> {
    const { host = "127.0.0.1", timeoutMs = 120000 } = options;
    const port = this.getCallbackPort();
    const callbackPath = this.getCallbackPath();

    return new Promise((resolve) => {
      // 使用 Node.js 的 http 模块
      // 在 Obsidian 插件环境中，我们需要通过全局对象访问 Node.js API
      const http = (typeof require !== "undefined" ? require("http") : null);
      if (!http) {
        resolve({ success: false, error: "HTTP 服务器不可用" });
        return;
      }

      this.server = http.createServer((req: any, res: any) => {
        try {
          const reqUrl = new URL(req.url, this.config.redirectUri);

          // 检查路径是否匹配
          if (reqUrl.pathname !== callbackPath) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Not found");
            return;
          }

          // 获取授权码
          const code = reqUrl.searchParams.get("code");
          const error = reqUrl.searchParams.get("error");

          if (error) {
            const errorDescription = reqUrl.searchParams.get("error_description") || error;
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`<h2>授权失败</h2><p>${this.escapeHtml(errorDescription)}</p>`);
            resolve({ success: false, error: `授权被拒绝: ${errorDescription}` });
            this.closeServer();
            return;
          }

          if (!code) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end("<h2>授权失败</h2><p>未找到授权码</p>");
            resolve({ success: false, error: "未找到授权码" });
            this.closeServer();
            return;
          }

          // 授权成功，返回成功页面
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            "<html><head><meta charset='utf-8'><title>授权成功</title></head>" +
            "<body style='font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif;'>" +
            "<div style='max-width: 600px; margin: 100px auto; padding: 40px; text-align: center;'>" +
            "<h2 style='color: #52c41a;'>授权成功</h2>" +
            "<p style='color: #666; margin: 20px 0;'>您现在可以关闭此页面并返回 Obsidian。</p>" +
            "</div></body></html>"
          );

          resolve({ success: true, code });
          this.closeServer();

        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
          const errorMsg = err instanceof Error ? err.message : String(err);
          res.end(`<h2>服务器错误</h2><pre>${this.escapeHtml(errorMsg)}</pre>`);
          resolve({ success: false, error: errorMsg });
          this.closeServer();
        }
      });

      // 设置超时
      const timeoutHandle = setTimeout(() => {
        resolve({ success: false, error: "等待授权超时" });
        this.closeServer();
      }, timeoutMs);

      // 监听连接，超时后清理
      this.server.on("connection", () => {
        clearTimeout(timeoutHandle);
      });

      // 启动服务器
      this.server.listen(port, host, () => {
        // 服务器已启动
      });

      // 错误处理
      this.server.on("error", (err: Error) => {
        resolve({ success: false, error: `服务器错误: ${err.message}` });
      });
    });
  }

  /**
   * 关闭服务器
   */
  private closeServer(): void {
    if (this.server) {
      try {
        this.server.close();
      } catch {
        // 忽略关闭错误
      }
      this.server = null;
    }
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return text.replace(/[&<>"']/g, (m) => map[m] ?? m);
  }

  /**
   * 打开浏览器
   * @param url 要打开的 URL
   */
  private openBrowser(url: string): void {
    // 在 Electron 环境中（Obsidian）使用 shell.openExternal
    if (typeof window !== "undefined" && (window as any).electron?.openExternal) {
      (window as any).electron.openExternal(url);
      return;
    }

    // 检测平台并使用适当的命令
    const platform = typeof process !== "undefined" ? process.platform : "unknown";
    let command: string | null = null;

    if (platform === "win32") {
      command = `cmd /c start "" "${url}"`;
    } else if (platform === "darwin") {
      command = `open "${url}"`;
    } else if (platform === "linux") {
      command = `xdg-open "${url}"`;
    }

    if (command && typeof require !== "undefined") {
      const { exec } = require("child_process");
      exec(command);
    } else {
      // 回退：尝试使用 window.open（可能在某些环境中被阻止）
      window.open(url, "_blank");
    }
  }

  /**
   * 开始 OAuth 授权流程
   * @param options 服务器选项
   */
  async authorize(options: ServerOptions = {}): Promise<OAuthResult> {
    // 验证配置
    if (!this.config.appId || !this.config.appSecret || !this.config.redirectUri) {
      return {
        success: false,
        error: "OAuth 配置不完整，请检查 appId、appSecret 和 redirectUri"
      };
    }

    // 构建授权 URL
    const authUrl = this.buildAuthUrl();

    // 先启动本地服务器，再打开浏览器
    const serverPromise = this.startCallbackServer(options);

    // 等待服务器启动（给一点时间确保服务器准备好）
    await new Promise(resolve => setTimeout(resolve, 500));

    // 打开浏览器进行授权
    this.openBrowser(authUrl);

    // 等待服务器接收回调
    const serverResult = await serverPromise;

    if (!serverResult.success) {
      return {
        success: false,
        error: serverResult.error
      };
    }

    // 使用授权码换取 token
    const tokenResult = await this.exchangeCodeForToken(serverResult.code);

    if (tokenResult.success) {
      new Notice("飞书授权成功！");
    } else {
      new Notice(`飞书授权失败: ${tokenResult.error}`);
    }

    return tokenResult;
  }

  /**
   * 仅生成授权 URL（不启动服务器）
   * 用于在设置页面显示或手动复制
   */
  getAuthorizationUrl(): string {
    return this.buildAuthUrl();
  }

  /**
   * 手动处理授权码（用于外部回调）
   * @param code 授权码
   */
  async handleAuthorizationCode(code: string): Promise<OAuthResult> {
    return this.exchangeCodeForToken(code);
  }

  /**
   * 获取有效的访问令牌
   * 自动处理 token 过期和刷新
   */
  async getAccessToken(): Promise<TokenRefreshResult> {
    return this.tokenManager.getValidAccessToken(
      this.config.appId,
      this.config.appSecret
    );
  }

  /**
   * 验证当前授权状态
   */
  async validateAuth(): Promise<boolean> {
    return this.tokenManager.validateCurrentToken();
  }

  /**
   * 清除授权
   */
  async clearAuth(): Promise<void> {
    await this.storage.clear();
  }

  /**
   * 检查是否有授权
   */
  async hasAuth(): Promise<boolean> {
    return this.storage.hasValidAuth();
  }

  /**
   * 获取授权信息（只读）
   */
  async getAuthInfo(): Promise<{ connected: boolean; connectedAt: string | null }> {
    const data = await this.storage.read();
    return {
      connected: !!data?.refreshToken,
      connectedAt: data?.connectedAt ?? null
    };
  }

  /**
   * 强制刷新 token
   */
  async refreshToken(): Promise<TokenRefreshResult> {
    return this.tokenManager.forceRefresh(
      this.config.appId,
      this.config.appSecret
    );
  }
}
