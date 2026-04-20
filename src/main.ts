import { Notice, Plugin } from 'obsidian';

import { FeishuOAuth, AuthStorage, type OAuthResult } from './oauth';
import { LarkSyncSettingTab } from './settings';
import {
  SyncCoordinator,
  SyncCancelledError,
  buildSyncConfig,
  toUiSyncSummary,
  type StateStore,
  type SyncResult,
} from './sync';
import { NotificationManager, SyncButton, registerSyncCommands } from './ui';
import {
  DEFAULT_PLUGIN_DATA,
  getMissingConfigFields,
  mergePluginData,
  mergePluginDataWithFallback,
  type FeishuSyncConfig,
  type PluginData,
  type SyncSummary,
} from './utils/contracts';
import { normalizeExcludeEntries } from './utils/path-utils';
import { buildSyncPreview } from './utils/preview';

const LEGACY_PLUGIN_ID = 'sync-obsidian-feishu';

export default class LarkSyncPlugin extends Plugin {
  private pluginData: PluginData = DEFAULT_PLUGIN_DATA;
  private oauth: FeishuOAuth | null = null;
  private syncButton: SyncButton | null = null;
  private notificationManager: NotificationManager | null = null;
  private syncCoordinator: SyncCoordinator | null = null;

  async onload(): Promise<void> {
    this.pluginData = await this.loadPluginData();

    this.notificationManager = new NotificationManager();
    this.initOAuth();
    this.initSyncCoordinator();
    this.initUIComponents();

    this.addSettingTab(new LarkSyncSettingTab(this.app, this));
    this.registerCommands();
  }

  onunload(): void {
    this.syncButton?.destroy();

    if (this.syncCoordinator) {
      this.syncCoordinator.destroy().catch(console.error);
      this.syncCoordinator = null;
    }
  }

  getPluginData(): PluginData {
    return this.pluginData;
  }

  async updateConfig(patch: Partial<FeishuSyncConfig>): Promise<void> {
    this.pluginData = {
      ...this.pluginData,
      config: {
        ...this.pluginData.config,
        ...patch,
        exclude: patch.exclude
          ? normalizeExcludeEntries(patch.exclude)
          : this.pluginData.config.exclude,
      },
    };

    await this.persistPluginData();
    this.initOAuth();
  }

  async clearAuthorization(): Promise<void> {
    this.pluginData = {
      ...this.pluginData,
      auth: {
        userAccessToken: '',
        refreshToken: '',
        connectedAt: null,
        expiresAt: null,
        grantedScopes: [],
      },
    };

    await this.persistPluginData();
    new Notice('Cleared locally stored Feishu auth state.');
  }

  private initUIComponents(): void {
    this.syncButton = new SyncButton(this, {
      onClick: async () => this.startSync(),
    });

    registerSyncCommands(this, {
      startSync: async () => this.startSync(),
      cancelSync: async () => this.cancelSync(),
      openSettings: () => this.openSettings(),
      showStatus: () => this.showLastSyncSummary(),
    });
  }

  private initOAuth(): void {
    const { config } = this.pluginData;
    this.oauth = null;

    if (!config.appId || !config.appSecret || !config.redirectUri) {
      return;
    }

    const storage = new AuthStorage(() => this.pluginData.auth, async () => {
      await this.persistPluginData();
    });

    this.oauth = new FeishuOAuth(config, storage);
  }

  async authorizeFeishu(): Promise<OAuthResult> {
    this.initOAuth();

    if (!this.oauth) {
      return {
        success: false,
        error: 'Feishu OAuth is not configured yet.',
      };
    }

    return this.oauth.authorize();
  }

  async verifyFeishuConnection(): Promise<void> {
    await this.ensureValidAccessToken();
  }

  private initSyncCoordinator(): void {
    const stateStore: StateStore = {
      load: async () => ({ ...this.pluginData.syncState }),
      save: async (state) => {
        this.pluginData = {
          ...this.pluginData,
          syncState: { ...state },
        };
        await this.persistPluginData();
      },
    };

    this.syncCoordinator = new SyncCoordinator({
      getFiles: () =>
        this.app.vault.getFiles().map((file) => ({
          path: file.path,
          stat: {
            size: file.stat.size,
            mtime: file.stat.mtime,
            mtimeMs: file.stat.mtime,
          },
        })),
      readBinary: (path) => this.app.vault.adapter.readBinary(path.replace(/\\/g, '/')),
    }, {
      stateStore,
    });

    this.syncCoordinator.initialize().catch((error) => {
      console.error('Failed to initialize SyncCoordinator:', error);
    });
  }

  private async startSync(): Promise<void> {
    const missing = getMissingConfigFields(this.pluginData.config);
    if (missing.length > 0) {
      this.notificationManager?.needsConfiguration(missing);
      return;
    }

    if (!this.pluginData.auth.refreshToken) {
      this.notificationManager?.needsAuthorization();
      return;
    }

    if (!this.syncCoordinator) {
      this.notificationManager?.error('Sync coordinator not initialized');
      return;
    }

    if (this.syncCoordinator.isSyncing()) {
      this.notificationManager?.concurrentSyncBlocked();
      return;
    }

    this.notificationManager?.syncStarted();
    this.syncButton?.setSyncing();

    try {
      await this.ensureValidAccessToken();

      const syncConfig = buildSyncConfig({
        config: this.pluginData.config,
        auth: this.pluginData.auth,
      });

      const result = await this.syncCoordinator.startSync(syncConfig);
      const summary = toUiSyncSummary(result);

      await this.storeSyncSummary(result);
      this.notificationManager?.syncCompleted(summary);

      if (summary.status === 'partial') {
        this.syncButton?.setWarning();
        return;
      }

      if (summary.status === 'failed') {
        this.syncButton?.setError();
        return;
      }

      this.syncButton?.setSuccess();
    } catch (error) {
      if (error instanceof SyncCancelledError) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      await this.storeSyncFailure(message);
      this.notificationManager?.error(`Failed to start sync: ${message}`);
      this.syncButton?.setError();
    }
  }

  private async ensureValidAccessToken(): Promise<void> {
    if (!this.oauth) {
      this.initOAuth();
    }

    if (!this.oauth) {
      throw new Error('Feishu OAuth is not configured');
    }

    const tokenResult = await this.oauth.getAccessToken();
    if (!tokenResult.success || !tokenResult.accessToken) {
      throw new Error(tokenResult.error || 'Failed to obtain a valid Feishu access token');
    }
  }

  private async cancelSync(): Promise<void> {
    if (!this.syncCoordinator || !this.syncCoordinator.isSyncing()) {
      return;
    }

    this.syncCoordinator.cancelSync();
    this.notificationManager?.syncCancelled();
    this.syncButton?.setIdle();
  }

  private registerCommands(): void {
    this.addCommand({
      id: 'open-feishu-sync-settings',
      name: 'Open Lark Sync settings',
      callback: () => this.openSettings(),
    });

    this.addCommand({
      id: 'preview-feishu-sync-scope',
      name: 'Preview Lark Sync scope',
      callback: async () => this.previewSyncScope(),
    });

    this.addCommand({
      id: 'show-last-feishu-sync-summary',
      name: 'Show last Lark Sync summary',
      callback: () => this.showLastSyncSummary(),
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

    new Notice(
      'Open Settings -> Community plugins -> Lark Sync to edit plugin settings.',
    );
  }

  private async previewSyncScope(): Promise<void> {
    const missing = getMissingConfigFields(this.pluginData.config);
    if (missing.length > 0) {
      const summary: SyncSummary = {
        status: 'blocked',
        message: `Missing required settings: ${missing.join(', ')}`,
        scannedAt: new Date().toISOString(),
        filesDiscovered: 0,
        excludedCount: 0,
        oversizedCount: 0,
        candidateCount: 0,
        uploadedCount: 0,
        skippedUnchangedCount: 0,
        failedPath: null,
      };

      this.pluginData = {
        ...this.pluginData,
        lastSync: summary,
      };

      await this.persistPluginData();
      new Notice(summary.message);
      this.openSettings();
      return;
    }

    const files = this.app.vault.getFiles().map((file) => ({
      path: file.path,
      size: file.stat.size,
    }));

    const preview = buildSyncPreview(
      files,
      this.pluginData.config.exclude,
      this.pluginData.config.maxDirectUploadMB,
    );

    preview.message = `Preview complete: ${preview.candidateCount} candidate file(s), ${preview.excludedCount} excluded, ${preview.oversizedCount} oversized.`;

    this.pluginData = {
      ...this.pluginData,
      lastSync: preview,
    };

    await this.persistPluginData();
    new Notice(preview.message, 7000);
  }

  private showLastSyncSummary(): void {
    const summary = this.pluginData.lastSync;
    if (!summary) {
      new Notice('No Lark Sync preview or run summary is available yet.');
      return;
    }

    const details = [
      `${summary.status.toUpperCase()}: ${summary.message}`,
      `Scanned: ${summary.filesDiscovered}`,
      `Candidates: ${summary.candidateCount}`,
      `Excluded: ${summary.excludedCount}`,
      `Oversized: ${summary.oversizedCount}`,
    ].join(' | ');

    new Notice(details, 9000);
  }

  private async persistPluginData(): Promise<void> {
    await this.saveData(this.pluginData);
  }

  private async loadPluginData(): Promise<PluginData> {
    const currentRawData = await this.loadData();
    const currentData = mergePluginData(currentRawData);
    const legacyData = await this.loadLegacyPluginData();
    if (legacyData) {
      const mergedData = mergePluginDataWithFallback(currentRawData, legacyData);
      if (JSON.stringify(mergedData) !== JSON.stringify(currentData)) {
        this.pluginData = mergedData;
        await this.persistPluginData();
        console.info(`Migrated plugin data from ${LEGACY_PLUGIN_ID} to ${this.manifest.id}.`);
      }
      return mergedData;
    }

    return currentData;
  }

  private async loadLegacyPluginData(): Promise<PluginData | null> {
    if (this.manifest.id === LEGACY_PLUGIN_ID) {
      return null;
    }

    const legacyDataPath = `${this.app.vault.configDir}/plugins/${LEGACY_PLUGIN_ID}/data.json`;
    if (!(await this.app.vault.adapter.exists(legacyDataPath))) {
      return null;
    }

    try {
      const raw = await this.app.vault.adapter.read(legacyDataPath);
      return mergePluginData(JSON.parse(raw));
    } catch (error) {
      console.warn(`Failed to read legacy plugin data from ${legacyDataPath}:`, error);
      return null;
    }
  }

  private async storeSyncSummary(result: SyncResult): Promise<void> {
    const success = result.success && result.failedCount === 0;
    this.pluginData = {
      ...this.pluginData,
      lastSync: {
        status: success ? 'success' : 'failed',
        message: success
          ? `Uploaded ${result.uploadedCount} file(s), skipped ${result.skippedCount}.`
          : result.error || `Failed on ${result.failedFiles[0]?.path || 'unknown file'}.`,
        scannedAt: new Date().toISOString(),
        filesDiscovered: result.filesDiscovered,
        excludedCount: result.excludedCount,
        oversizedCount: result.oversizedCount,
        candidateCount: result.candidateCount,
        uploadedCount: result.uploadedCount,
        skippedUnchangedCount: result.skippedCount,
        failedPath: result.failedFiles[0]?.path ?? null,
      },
    };

    await this.persistPluginData();
  }

  private async storeSyncFailure(message: string): Promise<void> {
    this.pluginData = {
      ...this.pluginData,
      lastSync: {
        status: 'failed',
        message,
        scannedAt: new Date().toISOString(),
        filesDiscovered: 0,
        excludedCount: 0,
        oversizedCount: 0,
        candidateCount: 0,
        uploadedCount: 0,
        skippedUnchangedCount: 0,
        failedPath: null,
      },
    };

    await this.persistPluginData();
  }
}
