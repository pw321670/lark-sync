import { Notice, Plugin } from "obsidian";

import { buildSyncPreview } from "./utils/preview";
import {
  DEFAULT_PLUGIN_DATA,
  getMissingConfigFields,
  mergePluginData,
  toLegacyConfig,
  type FeishuSyncConfig,
  type PluginData,
  type SyncSummary
} from "./utils/contracts";
import { normalizeExcludeEntries } from "./utils/path-utils";
import { FeishuSyncSettingTab } from "./settings";
import { FeishuOAuth, AuthStorage } from "./oauth";
import { SyncButton, registerSyncCommands, NotificationManager } from "./ui";
import {
  SyncCoordinator,
  ObsidianVaultAdapter,
  ObsidianFileReader,
  buildSyncConfig,
  toUiSyncSummary,
  type SyncProgress,
  type SyncResult as CoordinatorSyncResult,
} from "./sync";

export default class SyncObsidianFeishuPlugin extends Plugin {
  private pluginData: PluginData = DEFAULT_PLUGIN_DATA;
  private statusBarEl: HTMLElement | null = null;
  private oauth: FeishuOAuth | null = null;
  private syncButton: SyncButton | null = null;
  private notificationManager: NotificationManager | null = null;
  private syncCoordinator: SyncCoordinator | null = null;

  async onload(): Promise<void> {
    this.pluginData = mergePluginData(await this.loadData());

    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("sync-obsidian-feishu-status");

    // 初始化通知管理器
    this.notificationManager = new NotificationManager();

    // 初始化 OAuth
    this.initOAuth();

    // 初始化同步协调器
    this.initSyncCoordinator();

    // 初始化 UI 组件
    this.initUIComponents();

    this.addSettingTab(new FeishuSyncSettingTab(this.app, this));
    this.registerCommands();
    this.updateStatusBar();
  }

  onunload(): void {
    this.statusBarEl = null;
    this.syncButton?.destroy();

    // 清理同步协调器
    if (this.syncCoordinator) {
      this.syncCoordinator.destroy().catch(console.error);
      this.syncCoordinator = null;
    }
  }

  private initUIComponents(): void {
    // 初始化同步按钮
    this.syncButton = new SyncButton(this, {
      onClick: async () => this.startSync()
    });

    // 注册同步相关命令
    registerSyncCommands(this, {
      startSync: async () => this.startSync(),
      pauseSync: async () => this.pauseSync(),
      resumeSync: async () => this.resumeSync(),
      cancelSync: async () => this.cancelSync(),
      openSettings: () => this.openSettings(),
      showStatus: () => this.showLastSyncSummary()
    });
  }

  private async startSync(): Promise<void> {
    // 检查配置
    const missing = getMissingConfigFields(this.pluginData.config);
    if (missing.length > 0) {
      this.notificationManager?.needsConfiguration(missing);
      return;
    }

    // 检查授权
    if (!this.pluginData.auth.refreshToken) {
      this.notificationManager?.needsAuthorization();
      return;
    }

    // 检查协调器是否已初始化
    if (!this.syncCoordinator) {
      this.notificationManager?.error("Sync coordinator not initialized");
      return;
    }

    // 检查是否已有同步进行中
    if (this.syncCoordinator.isSyncing()) {
      this.notificationManager?.concurrentSyncBlocked();
      return;
    }

    this.notificationManager?.syncStarted();
    this.syncButton?.setSyncing();

    try {
      // 构建同步配置
      const syncConfig = buildSyncConfig({
        vaultPath: this.getVaultDisplayPath(),
        config: this.pluginData.config,
        auth: this.pluginData.auth,
      });

      // 启动同步
      await this.syncCoordinator.startSync(syncConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.notificationManager?.error(`Failed to start sync: ${message}`);
      this.syncButton?.setError();
      setTimeout(() => this.syncButton?.setIdle(), 3000);
    }
  }

  private async pauseSync(): Promise<void> {
    if (!this.syncCoordinator || !this.syncCoordinator.isSyncing()) {
      return;
    }

    await this.syncCoordinator.pauseSync();
    this.notificationManager?.syncPaused();
  }

  private async resumeSync(): Promise<void> {
    if (!this.syncCoordinator || !this.syncCoordinator.isSyncPaused()) {
      return;
    }

    await this.syncCoordinator.resumeSync();
    this.notificationManager?.syncResumed();
  }

  private async cancelSync(): Promise<void> {
    if (!this.syncCoordinator || !this.syncCoordinator.isSyncing()) {
      return;
    }

    await this.syncCoordinator.cancelSync();
    this.notificationManager?.syncCancelled();
    this.syncButton?.setIdle();
  }

  getPluginData(): PluginData {
    return this.pluginData;
  }

  getVaultDisplayPath(): string {
    const adapter = this.app.vault.adapter as { basePath?: string };
    return adapter.basePath ?? this.app.vault.getName();
  }

  async updateConfig(patch: Partial<FeishuSyncConfig>): Promise<void> {
    this.pluginData = {
      ...this.pluginData,
      config: {
        ...this.pluginData.config,
        ...patch,
        exclude: patch.exclude ? normalizeExcludeEntries(patch.exclude) : this.pluginData.config.exclude
      }
    };

    await this.persistPluginData();
  }

  async clearAuthorization(): Promise<void> {
    this.pluginData = {
      ...this.pluginData,
      auth: {
        userAccessToken: "",
        refreshToken: "",
        connectedAt: null,
        expiresAt: null
      }
    };

    await this.persistPluginData();
    new Notice("Cleared locally stored Feishu auth state.");
  }

  private initOAuth(): void {
    const { config } = this.pluginData;
    if (!config.appId || !config.appSecret || !config.redirectUri) {
      return;
    }

    // 创建存储适配器
    // 注意：直接传递 this.pluginData.auth 的引用，确保数据修改能够同步
    const storage = new AuthStorage(
      this.pluginData.auth,
      async () => {
        // 直接保存当前的 pluginData，不需要重新创建对象
        await this.persistPluginData();
      }
    );

    this.oauth = new FeishuOAuth(config, storage);
  }

  private initSyncCoordinator(): void {
    // 创建 Obsidian Vault 适配器
    const vaultAdapter = new ObsidianVaultAdapter(this.app as any);
    const fileReader = new ObsidianFileReader(this.app as any);

    // 创建同步协调器
    this.syncCoordinator = new SyncCoordinator(
      vaultAdapter,
      { verbose: false },
      fileReader
    );

    // 设置事件监听器
    this.syncCoordinator.onProgress((progress: SyncProgress) => {
      // 更新进度显示（可以添加进度条等 UI）
      this.updateStatusBarWithProgress(progress);
    });

    this.syncCoordinator.onComplete((result: CoordinatorSyncResult) => {
      const summary = toUiSyncSummary(result);
      this.notificationManager?.syncCompleted(summary);
      this.syncButton?.setSuccess();
      setTimeout(() => this.syncButton?.setIdle(), 3000);
    });

    this.syncCoordinator.onError((error) => {
      this.notificationManager?.error(`Sync error: ${error.message}`);
      this.syncButton?.setError();
    });

    // 初始化协调器
    this.syncCoordinator.initialize().catch((err) => {
      console.error('Failed to initialize SyncCoordinator:', err);
    });
  }

  private updateStatusBarWithProgress(progress: SyncProgress): void {
    if (!this.statusBarEl) {
      return;
    }

    const status = progress.status;
    let text = 'Feishu Sync: ';

    switch (status) {
      case 'scanning':
        text += `Scanning... (${progress.processedCount}/${progress.totalCount})`;
        break;
      case 'syncing':
        text += `Syncing... ${progress.uploadedCount} uploaded`;
        if (progress.failedCount > 0) {
          text += `, ${progress.failedCount} failed`;
        }
        break;
      case 'paused':
        text += 'Paused';
        break;
      case 'completed':
        text += `Done: ${progress.uploadedCount} uploaded`;
        break;
      case 'error':
        text += 'Error';
        break;
      default:
        text += 'Ready';
    }

    this.statusBarEl.setText(text);
  }

  private getOAuth(): FeishuOAuth | null {
    return this.oauth;
  }

  private registerCommands(): void {
    // 核心功能命令
    this.addCommand({
      id: "open-feishu-sync-settings",
      name: "Open Feishu sync settings",
      callback: () => this.openSettings()
    });

    this.addCommand({
      id: "preview-feishu-sync-scope",
      name: "Preview Feishu sync scope",
      callback: async () => this.previewSyncScope()
    });

    this.addCommand({
      id: "show-last-feishu-sync-summary",
      name: "Show last Feishu sync summary",
      callback: () => this.showLastSyncSummary()
    });

    // 维护命令（不常用，放在后面）
    this.addCommand({
      id: "refresh-feishu-token",
      name: "Refresh Feishu access token (Maintenance)",
      callback: async () => this.refreshToken()
    });
  }

  private openSettings(): void {
    const appWithSettings = this.app as typeof this.app & {
      setting?: {
        open: () => void;
        openTabById?: (id: string) => void;
      };
    };

    if (appWithSettings.setting) {
      appWithSettings.setting.open();
      appWithSettings.setting.openTabById?.(this.manifest.id);
      return;
    }

    new Notice("Open Settings -> Community plugins -> Sync Obsidian to Feishu to edit plugin settings.");
  }

  private async previewSyncScope(): Promise<void> {
    const missing = getMissingConfigFields(this.pluginData.config);
    if (missing.length > 0) {
      const summary: SyncSummary = {
        status: "blocked",
        message: `Missing required settings: ${missing.join(", ")}`,
        scannedAt: new Date().toISOString(),
        filesDiscovered: 0,
        excludedCount: 0,
        oversizedCount: 0,
        candidateCount: 0,
        uploadedCount: 0,
        skippedUnchangedCount: 0,
        failedPath: null
      };

      this.pluginData = {
        ...this.pluginData,
        lastSync: summary
      };

      await this.persistPluginData();
      new Notice(summary.message);
      this.openSettings();
      return;
    }

    const files = this.app.vault.getFiles().map((file) => ({
      path: file.path,
      size: file.stat.size
    }));

    const preview = buildSyncPreview(
      files,
      this.pluginData.config.exclude,
      this.pluginData.config.maxDirectUploadMB
    );

    preview.message = `Preview complete: ${preview.candidateCount} candidate file(s), ${preview.excludedCount} excluded, ${preview.oversizedCount} oversized.`;

    this.pluginData = {
      ...this.pluginData,
      lastSync: preview
    };

    await this.persistPluginData();
    new Notice(preview.message, 7000);
  }

  private showLastSyncSummary(): void {
    const summary = this.pluginData.lastSync;
    if (!summary) {
      new Notice("No Feishu sync preview or run summary is available yet.");
      return;
    }

    const details = [
      `${summary.status.toUpperCase()}: ${summary.message}`,
      `Scanned: ${summary.filesDiscovered}`,
      `Candidates: ${summary.candidateCount}`,
      `Excluded: ${summary.excludedCount}`,
      `Oversized: ${summary.oversizedCount}`
    ].join(" | ");

    new Notice(details, 9000);
  }

  private async persistPluginData(): Promise<void> {
    await this.saveData(this.pluginData);
    this.updateStatusBar();
  }

  /**
   * 刷新访问令牌
   */
  private async refreshToken(): Promise<void> {
    if (!this.oauth) {
      new Notice("请先完成插件配置");
      return;
    }

    const hasAuth = await this.oauth.hasAuth();
    if (!hasAuth) {
      new Notice("未授权，请先完成授权");
      return;
    }

    new Notice("正在刷新访问令牌...");

    const result = await this.oauth.refreshToken();

    if (result.success) {
      new Notice("访问令牌刷新成功！");
    } else {
      new Notice(`访问令牌刷新失败: ${result.error}`);
    }
  }

  private updateStatusBar(): void {
    // 状态栏已禁用 - 不再显示飞书同步状态
    if (!this.statusBarEl) {
      return;
    }

    this.statusBarEl.setText("");
  }
}
