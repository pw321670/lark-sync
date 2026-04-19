import { App, PluginSettingTab } from 'obsidian';

import type SyncObsidianFeishuPlugin from '../main';
import {
  renderAdvancedSection,
  renderFeishuAppSection,
  renderStatusSection,
  renderSyncStrategySection,
} from './sections';

export class FeishuSyncSettingTab extends PluginSettingTab {
  private testConnectionButton?: HTMLButtonElement;

  constructor(app: App, private readonly plugin: SyncObsidianFeishuPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const pluginData = this.plugin.getPluginData();

    containerEl.empty();
    containerEl.addClass('sync-obsidian-feishu-settings');
    containerEl.createEl('h2', { text: 'Sync Obsidian to Feishu' });
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Configure Feishu auth, sync scope, and operational defaults for this vault.',
    });

    const context = {
      plugin: this.plugin,
      containerEl,
      config: pluginData.config,
      auth: pluginData.auth,
      lastSync: pluginData.lastSync,
      refresh: () => this.display(),
      setTestConnectionButton: (button: HTMLButtonElement) => {
        this.testConnectionButton = button;
      },
      getTestConnectionButton: () => this.testConnectionButton,
    };

    renderFeishuAppSection(context);
    renderSyncStrategySection(context);
    renderAdvancedSection(context);
    renderStatusSection(context);
  }
}
