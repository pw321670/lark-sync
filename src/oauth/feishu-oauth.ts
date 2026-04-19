import { Notice, requestUrl } from 'obsidian';

import type { IAuthStorage, StoredAuthData } from './auth-storage';
import { TokenManager, type TokenRefreshResult } from './token-manager';

export interface FeishuOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export interface OAuthResult {
  success: boolean;
  error?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface ServerOptions {
  host?: string;
  timeoutMs?: number;
}

type ServerCallbackResult =
  | { success: true; code: string }
  | { success: false; error: string };

export class FeishuOAuth {
  private server: any | null = null;
  private readonly tokenManager: TokenManager;

  private static readonly SCOPES = ['offline_access', 'drive:drive', 'drive:drive:readonly', 'docx:document', 'docx:document:write_only'];

  constructor(
    private readonly config: FeishuOAuthConfig,
    private readonly storage: IAuthStorage,
  ) {
    this.tokenManager = new TokenManager(storage);
  }

  async authorize(options: ServerOptions = {}): Promise<OAuthResult> {
    if (!this.config.appId || !this.config.appSecret || !this.config.redirectUri) {
      return {
        success: false,
        error: 'OAuth configuration is incomplete. Check appId, appSecret, and redirectUri.',
      };
    }

    const serverPromise = this.startCallbackServer(options);
    await new Promise((resolve) => setTimeout(resolve, 500));
    this.openBrowser(this.buildAuthUrl());

    const serverResult = await serverPromise;
    if (!serverResult.success) {
      return {
        success: false,
        error: serverResult.error,
      };
    }

    const tokenResult = await this.exchangeCodeForToken(serverResult.code);
    if (tokenResult.success) {
      new Notice('Feishu authorization succeeded.');
    } else {
      new Notice(`Feishu authorization failed: ${tokenResult.error}`);
    }

    return tokenResult;
  }

  async getAccessToken(): Promise<TokenRefreshResult> {
    return this.tokenManager.getValidAccessToken(this.config.appId, this.config.appSecret);
  }

  private buildAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: FeishuOAuth.SCOPES.join(' '),
    });

    return `https://accounts.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`;
  }

  private getCallbackPort(): number {
    try {
      const url = new URL(this.config.redirectUri);
      return Number(url.port) || 3333;
    } catch {
      return 3333;
    }
  }

  private getCallbackPath(): string {
    try {
      const url = new URL(this.config.redirectUri);
      return url.pathname;
    } catch {
      return '/callback';
    }
  }

  private async exchangeCodeForToken(code: string): Promise<OAuthResult> {
    try {
      const response = await requestUrl({
        url: 'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: this.config.appId,
          client_secret: this.config.appSecret,
          code,
          redirect_uri: this.config.redirectUri,
        }),
      });

      const data = response.json;
      if (data.code !== 0) {
        return {
          success: false,
          error: `Failed to exchange authorization code: ${data.msg} (code: ${data.code})`,
        };
      }

      const accessToken = data.data?.access_token ?? data.access_token ?? '';
      const refreshToken = data.data?.refresh_token ?? data.refresh_token ?? '';
      const expiresIn = data.data?.expires_in ?? data.expires_in ?? 0;
      const scope = data.data?.scope ?? data.scope ?? '';

      if (!accessToken) {
        return {
          success: false,
          error: `Feishu did not return an access token: ${JSON.stringify(data)}`,
        };
      }

      // 解析授予的权限范围
      const grantedScopes = scope ? scope.split(' ') : [];

      const authData: StoredAuthData = {
        userAccessToken: accessToken,
        refreshToken,
        connectedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        grantedScopes,
      };
      await this.storage.write(authData);

      return {
        success: true,
        accessToken,
        refreshToken,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to exchange authorization code: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private startCallbackServer(options: ServerOptions = {}): Promise<ServerCallbackResult> {
    const { host = '127.0.0.1', timeoutMs = 120_000 } = options;
    const port = this.getCallbackPort();
    const callbackPath = this.getCallbackPath();

    return new Promise((resolve) => {
      const http = typeof require !== 'undefined' ? require('http') : null;
      if (!http) {
        resolve({ success: false, error: 'HTTP server is not available in this environment.' });
        return;
      }

      this.server = http.createServer((req: any, res: any) => {
        try {
          const reqUrl = new URL(req.url, this.config.redirectUri);
          if (reqUrl.pathname !== callbackPath) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
          }

          const code = reqUrl.searchParams.get('code');
          const error = reqUrl.searchParams.get('error');

          if (error) {
            const description = reqUrl.searchParams.get('error_description') || error;
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h2>Authorization failed</h2><p>${this.escapeHtml(description)}</p>`);
            resolve({ success: false, error: `Authorization was rejected: ${description}` });
            this.closeServer();
            return;
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h2>Authorization failed</h2><p>Missing authorization code.</p>');
            resolve({ success: false, error: 'Authorization callback did not include a code.' });
            this.closeServer();
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            "<html><head><meta charset='utf-8'><title>Authorization complete</title></head>" +
              "<body style='font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif;'>" +
              "<div style='max-width: 600px; margin: 100px auto; padding: 40px; text-align: center;'>" +
              "<h2 style='color: #52c41a;'>Authorization complete</h2>" +
              '<p style=\'color: #666; margin: 20px 0;\'>You can close this page and return to Obsidian.</p>' +
              '</div></body></html>',
          );

          resolve({ success: true, code });
          this.closeServer();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h2>Server error</h2><pre>${this.escapeHtml(message)}</pre>`);
          resolve({ success: false, error: message });
          this.closeServer();
        }
      });

      const timeoutHandle = setTimeout(() => {
        resolve({ success: false, error: 'Timed out waiting for authorization callback.' });
        this.closeServer();
      }, timeoutMs);

      this.server.on('connection', () => {
        clearTimeout(timeoutHandle);
      });

      this.server.listen(port, host);
      this.server.on('error', (error: Error) => {
        resolve({ success: false, error: `Local callback server error: ${error.message}` });
      });
    });
  }

  private closeServer(): void {
    if (!this.server) {
      return;
    }

    try {
      this.server.close();
    } catch {
      // Ignore cleanup failures.
    }

    this.server = null;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return text.replace(/[&<>"']/g, (match) => map[match] ?? match);
  }

  private openBrowser(url: string): void {
    if (typeof window !== 'undefined' && (window as any).electron?.openExternal) {
      (window as any).electron.openExternal(url);
      return;
    }

    const platform = typeof process !== 'undefined' ? process.platform : 'unknown';
    let command: string | null = null;

    if (platform === 'win32') {
      command = `cmd /c start "" "${url}"`;
    } else if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'linux') {
      command = `xdg-open "${url}"`;
    }

    if (command && typeof require !== 'undefined') {
      const { exec } = require('child_process');
      exec(command);
      return;
    }

    window.open(url, '_blank');
  }
}
