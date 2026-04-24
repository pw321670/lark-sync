import { Setting } from 'obsidian';

import type LarkSyncPlugin from '../main';
import type { FeishuAuthState, FeishuSyncConfig, LogLevel, PluginData, SyncMode } from '../utils/contracts';
import { DEFAULT_REDIRECT_URI } from '../utils/contracts';
import { formatExcludeEntries, normalizeExcludeEntries } from '../utils/path-utils';
import { testConnection } from './actions';
import { addDivider, addSecretSetting, addTextSetting, formatTimestamp, renderHint } from './helpers';

interface SettingsSectionContext {
  plugin: LarkSyncPlugin;
  containerEl: HTMLElement;
  config: FeishuSyncConfig;
  auth: FeishuAuthState;
  lastSync: PluginData['lastSync'];
  refresh: () => void;
  setTestConnectionButton: (button: HTMLButtonElement) => void;
  getTestConnectionButton: () => HTMLButtonElement | undefined;
}

export function renderFeishuAppSection(context: SettingsSectionContext): void {
  const { containerEl, config, plugin, setTestConnectionButton, getTestConnectionButton } = context;

  containerEl.createEl('h3', { text: 'Feishu App', cls: 'setting-item-heading' });

  addTextSetting(
    containerEl,
    'App ID',
    'The Feishu app ID, usually starting with cli_.',
    config.appId,
    async (value) => plugin.updateConfig({ appId: value.trim() }),
    { placeholder: 'cli_xxxxxxxxx' },
  );

  addSecretSetting(
    containerEl,
    'App Secret',
    'The Feishu app secret used for OAuth and refresh requests.',
    config.appSecret,
    async (value) => plugin.updateConfig({ appSecret: value.trim() }),
  );

  addTextSetting(
    containerEl,
    'Root Folder Token',
    'Feishu folder token where synced content should be uploaded.',
    config.feishuRootFolderToken,
    async (value) => plugin.updateConfig({ feishuRootFolderToken: value.trim() }),
    { placeholder: 'folder_xxxxxxxxx' },
  );

  addTextSetting(
    containerEl,
    'Redirect URI',
    'OAuth callback URL. The default localhost callback works for local plugin development.',
    config.redirectUri,
    async (value) => plugin.updateConfig({ redirectUri: value.trim() || DEFAULT_REDIRECT_URI }),
  );

  const isAuthorized = !!context.auth.refreshToken;

  const authSetting = new Setting(containerEl)
    .setName('Feishu Authorization')
    .addButton((button) => {
      setTestConnectionButton(button.buttonEl);
      if (isAuthorized) {
        button.setButtonText('Re-authorize').onClick(async () => {
          await testConnection(plugin, getTestConnectionButton(), context.refresh);
        });
      } else {
        button.setButtonText('Authorize').setCta().onClick(async () => {
          await testConnection(plugin, getTestConnectionButton(), context.refresh);
        });
      }
    });

  if (isAuthorized) {
    authSetting.setDesc(`Authorized since ${formatTimestamp(context.auth.connectedAt)}`);
    authSetting.descEl.createEl('br');
    authSetting.descEl.createEl('span', {
      text: `Permissions: ${context.auth.grantedScopes.join(', ') || 'default'}`,
      cls: 'setting-item-description',
    });
    authSetting.addExtraButton((btn) =>
      btn.setIcon('trash').setTooltip('Clear auth').onClick(async () => {
        await plugin.clearAuthorization();
        context.refresh();
      }),
    );
  } else {
    authSetting.setDesc('Authorize to grant: docx:document, drive:drive');
  }

  addDivider(containerEl);
}

export function renderSyncStrategySection(context: SettingsSectionContext): void {
  const { containerEl, config, plugin, refresh } = context;

  containerEl.createEl('h3', { text: 'Sync Strategy', cls: 'setting-item-heading' });

  new Setting(containerEl)
    .setName('Markdown file sync mode')
    .setDesc(
      'Upload .md files as regular files or create as Feishu online documents. ' +
      'Document mode uses Feishu official API.'
    )
    .addDropdown((dropdown) => {
      dropdown
        .addOptions({
          file: 'Upload as files',
          document: 'Create as online documents',
        })
        .setValue(config.markdownSyncMode)
        .onChange(async (value) => {
          await plugin.updateConfig({ markdownSyncMode: value as 'file' | 'document' });
          refresh();
        });
    })
    .addExtraButton((button) =>
      button
        .setIcon('reset')
        .setTooltip('Reset to online document mode')
        .onClick(async () => {
          await plugin.updateConfig({ markdownSyncMode: 'document' });
          refresh();
        }),
    );

  new Setting(containerEl)
    .setName('Sync mode')
    .setDesc('Choose how sync is triggered inside the plugin.')
    .addDropdown((dropdown) => {
      dropdown
        .addOptions({
          manual: 'Manual only',
          auto: 'Auto sync',
          scheduled: 'Scheduled sync',
        })
        .setValue(config.syncMode)
        .onChange(async (value) => {
          await plugin.updateConfig({ syncMode: value as SyncMode });
          refresh();
        });
    });

  if (config.syncMode === 'scheduled') {
    new Setting(containerEl)
      .setName('Scheduled interval')
      .setDesc('Interval for scheduled sync runs, in minutes.')
      .addSlider((slider) => {
        slider
          .setLimits(5, 1440, 5)
          .setValue(config.scheduledSyncInterval)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await plugin.updateConfig({ scheduledSyncInterval: value });
          });
      })
      .addExtraButton((button) =>
        button
          .setIcon('reset')
          .setTooltip('Reset to 30 minutes')
          .onClick(async () => {
            await plugin.updateConfig({ scheduledSyncInterval: 30 });
            refresh();
          }),
      );
  }

  new Setting(containerEl)
    .setName('File match mode')
    .setDesc('Exclude mode syncs everything except listed paths. Include mode syncs only listed paths.')
    .addDropdown((dropdown) => {
      dropdown
        .addOptions({
          exclude: 'Exclude listed paths',
          include: 'Include listed paths only',
        })
        .setValue(config.fileMatchMode)
        .onChange(async (value) => {
          await plugin.updateConfig({ fileMatchMode: value as 'exclude' | 'include' });
          refresh();
        });
    });

  new Setting(containerEl)
    .setName('Max upload size')
    .setDesc('Files larger than this size are skipped, in MB.')
    .addSlider((slider) => {
      slider
        .setLimits(1, 100, 1)
        .setValue(config.maxDirectUploadMB)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await plugin.updateConfig({ maxDirectUploadMB: value });
        });
    })
    .addExtraButton((button) =>
      button
        .setIcon('reset')
        .setTooltip('Reset to 20 MB')
        .onClick(async () => {
          await plugin.updateConfig({ maxDirectUploadMB: 20 });
          refresh();
        }),
    );

  const isExcludeMode = config.fileMatchMode === 'exclude';
  new Setting(containerEl)
    .setName(isExcludeMode ? 'Exclude rules' : 'Include rules')
    .setDesc(
      isExcludeMode
        ? 'One path or glob per line. Matching files are skipped.'
        : 'One path or glob per line. Only matching files are synced.',
    )
    .addTextArea((textArea) => {
      textArea
        .setValue(formatExcludeEntries(config.exclude))
        .setPlaceholder(isExcludeMode ? '.trash\n.obsidian/\n*.tmp' : 'Projects/\nNotes/\n*.md')
        .onChange(async (value) => {
          await plugin.updateConfig({
            exclude: normalizeExcludeEntries(value.split(/\r?\n/)),
          });
        });
      textArea.inputEl.rows = 6;
    });

  renderHint(containerEl, [
    isExcludeMode ? 'Exclude mode examples: .trash, .obsidian/, *.tmp' : 'Include mode examples: Projects/, Notes/, *.md',
    'Use forward slashes in paths.',
    'Prefix matches apply to nested files and subfolders.',
  ]);

  addDivider(containerEl);
}

export function renderAdvancedSection(context: SettingsSectionContext): void {
  const { containerEl, config, plugin, refresh } = context;

  containerEl.createEl('h3', { text: 'Advanced', cls: 'setting-item-heading' });

  new Setting(containerEl)
    .setName('Concurrent uploads')
    .setDesc('How many files may upload in parallel.')
    .addSlider((slider) => {
      slider
        .setLimits(1, 10, 1)
        .setValue(config.concurrentUploads)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await plugin.updateConfig({ concurrentUploads: value });
        });
    })
    .addExtraButton((button) =>
      button
        .setIcon('reset')
        .setTooltip('Reset to 3')
        .onClick(async () => {
          await plugin.updateConfig({ concurrentUploads: 3 });
          refresh();
        }),
    );

  new Setting(containerEl)
    .setName('Retry attempts')
    .setDesc('Maximum attempts for individual Feishu API requests.')
    .addSlider((slider) => {
      slider
        .setLimits(0, 10, 1)
        .setValue(config.retryAttempts)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await plugin.updateConfig({ retryAttempts: value });
        });
    })
    .addExtraButton((button) =>
      button
        .setIcon('reset')
        .setTooltip('Reset to 3')
        .onClick(async () => {
          await plugin.updateConfig({ retryAttempts: 3 });
          refresh();
        }),
    );

  new Setting(containerEl)
    .setName('Retry delay')
    .setDesc('Milliseconds to wait before retrying a failed Feishu API request.')
    .addSlider((slider) => {
      slider
        .setLimits(100, 10000, 100)
        .setValue(config.retryDelay)
        .setDynamicTooltip()
        .onChange(async (value) => {
          await plugin.updateConfig({ retryDelay: value });
        });
    })
    .addExtraButton((button) =>
      button
        .setIcon('reset')
        .setTooltip('Reset to 1000 ms')
        .onClick(async () => {
          await plugin.updateConfig({ retryDelay: 1000 });
          refresh();
        }),
    );

  new Setting(containerEl)
    .setName('Log level')
    .setDesc('How much runtime detail the plugin should log.')
    .addDropdown((dropdown) => {
      dropdown
        .addOptions({
          error: 'Errors only',
          warn: 'Warnings and errors',
          info: 'Info, warnings, and errors',
          debug: 'Debug everything',
        })
        .setValue(config.logLevel)
        .onChange(async (value) => {
          await plugin.updateConfig({ logLevel: value as LogLevel });
        });
    });

  addDivider(containerEl);
}

export function renderStatusSection(context: SettingsSectionContext): void {
  const { containerEl, auth, lastSync, plugin, refresh } = context;

  containerEl.createEl('h3', { text: 'Status', cls: 'setting-item-heading' });

  new Setting(containerEl)
    .setName('Last sync')
    .setDesc(lastSync ? `${lastSync.status}: ${lastSync.message}` : 'No preview or sync summary yet.');
}
