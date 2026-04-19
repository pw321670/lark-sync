import { App, Notice, PluginSettingTab, Setting } from "obsidian";

import type SyncObsidianFeishuPlugin from "./main";
import type { FeishuSyncConfig, LogLevel, SyncMode } from "./utils/contracts";
import type { FileMatchMode } from "./utils/contracts";
import {
  DEFAULT_PLUGIN_DATA,
  DEFAULT_REDIRECT_URI,
  exportConfig,
  importConfig,
  validateConfig
} from "./utils/contracts";
import { formatExcludeEntries, normalizeExcludeEntries } from "./utils/path-utils";

/**
 * 设置标签页
 */
export class FeishuSyncSettingTab extends PluginSettingTab {
  private testConnectionButton?: HTMLButtonElement;

  constructor(app: App, private readonly plugin: SyncObsidianFeishuPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const pluginData = this.plugin.getPluginData();
    const { config, auth, lastSync } = pluginData;

    containerEl.empty();
    containerEl.addClass("sync-obsidian-feishu-settings");

    // 标题和描述
    containerEl.createEl("h2", { text: "Sync Obsidian to Feishu" });

    const descEl = containerEl.createEl("p", {
      cls: "setting-item-description"
    });
    descEl.innerHTML = "配置飞书同步插件，将您的 Obsidian 笔记同步到飞书云文档。";

    // ==================== 飞书应用配置 ====================
    this.renderFeishuAppSection(containerEl, config);

    // ==================== 同步策略配置 ====================
    this.renderSyncStrategySection(containerEl, config);

    // ==================== 高级配置 ====================
    this.renderAdvancedSection(containerEl, config);

    // ==================== 配置管理 ====================
    this.renderConfigManagementSection(containerEl, config);

    // ==================== 状态信息 ====================
    this.renderStatusSection(containerEl, auth, lastSync);
  }

  /**
   * 渲染飞书应用配置组
   */
  private renderFeishuAppSection(containerEl: HTMLElement, config: FeishuSyncConfig): void {
    containerEl.createEl("h3", { text: "飞书应用配置", cls: "setting-item-heading" });

    // App ID
    this.addTextSetting(
      containerEl,
      "App ID",
      "飞书应用的 App ID，通常以 cli_ 开头。可在飞书开放平台获取。",
      config.appId,
      async (value) => this.plugin.updateConfig({ appId: value.trim() }),
      { placeholder: "cli_xxxxxxxxx" }
    );

    // App Secret
    this.addSecretSetting(
      containerEl,
      "App Secret",
      "飞书应用的 App Secret，请妥善保管。可在飞书开放平台获取。",
      config.appSecret,
      async (value) => this.plugin.updateConfig({ appSecret: value.trim() })
    );

    // 根目录 Token
    this.addTextSetting(
      containerEl,
      "根目录 Token",
      "飞书云文档中要同步到的根文件夹 Token。格式：folder_xxxxxxxxx",
      config.feishuRootFolderToken,
      async (value) => this.plugin.updateConfig({ feishuRootFolderToken: value.trim() }),
      { placeholder: "folder_xxxxxxxxx" }
    );

    // Redirect URI
    this.addTextSetting(
      containerEl,
      "重定向 URI",
      "OAuth 回调地址，默认使用本地回环地址。",
      config.redirectUri,
      async (value) =>
        this.plugin.updateConfig({
          redirectUri: value.trim() || DEFAULT_REDIRECT_URI
        })
    );

    // 测试连接按钮
    new Setting(containerEl)
      .setName("测试连接")
      .setDesc("验证飞书应用配置是否正确")
      .addButton((button) => {
        this.testConnectionButton = button.buttonEl;
        button
          .setButtonText("测试连接")
          .setClass("mod-cta")
          .onClick(async () => this.testConnection(config));
      });

    this.addDivider(containerEl);
  }

  /**
   * 渲染同步策略配置组
   */
  private renderSyncStrategySection(containerEl: HTMLElement, config: FeishuSyncConfig): void {
    containerEl.createEl("h3", { text: "同步策略", cls: "setting-item-heading" });

    // 同步模式
    new Setting(containerEl)
      .setName("同步模式")
      .setDesc("选择同步触发方式")
      .addDropdown((dropdown) => {
        const modes: Record<string, string> = {
          manual: "手动同步",
          auto: "自动同步",
          scheduled: "定时同步"
        };

        dropdown
          .addOptions(modes)
          .setValue(config.syncMode)
          .onChange(async (value: string) => {
            const syncMode = value as SyncMode;
            await this.plugin.updateConfig({ syncMode });
            this.display(); // 刷新界面以显示/隐藏定时间隔选项
          });
      });

    // 定时间隔（仅在定时模式下显示）
    if (config.syncMode === "scheduled") {
      new Setting(containerEl)
        .setName("同步间隔")
        .setDesc("定时同步的时间间隔（分钟）")
        .addSlider((slider) => {
          slider
            .setLimits(5, 1440, 5)
            .setValue(config.scheduledSyncInterval)
            .setDynamicTooltip()
            .onChange(async (value) => {
              await this.plugin.updateConfig({ scheduledSyncInterval: value });
            });
        })
        .addExtraButton((button) => button
          .setIcon("reset")
          .setTooltip("恢复默认值 (30分钟)")
          .onClick(async () => {
            await this.plugin.updateConfig({ scheduledSyncInterval: 30 });
            this.display();
          }));
    }

    // 文件匹配模式选择
    new Setting(containerEl)
      .setName("文件匹配模式")
      .setDesc("选择如何筛选要同步的文件")
      .addDropdown((dropdown) => {
        const modes: Record<string, string> = {
          exclude: "排除模式（同步所有，排除指定）",
          include: "白名单模式（只同步指定文件）"
        };

        dropdown
          .addOptions(modes)
          .setValue(config.fileMatchMode || "exclude")
          .onChange(async (value: string) => {
            await this.plugin.updateConfig({
              fileMatchMode: value as "exclude" | "include"
            });
            this.display(); // 刷新界面以更新下面的标签和说明
          });
      });

    // 文件大小限制
    new Setting(containerEl)
      .setName("文件大小限制")
      .setDesc("超过此大小的文件将被跳过（MB）")
      .addSlider((slider) => {
        slider
          .setLimits(1, 100, 1)
          .setValue(config.maxDirectUploadMB)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await this.plugin.updateConfig({ maxDirectUploadMB: value });
          });
      })
      .addExtraButton((button) => button
        .setIcon("reset")
        .setTooltip("恢复默认值 (20MB)")
        .onClick(async () => {
          await this.plugin.updateConfig({ maxDirectUploadMB: 20 });
          this.display();
        }));

    // 文件匹配规则
    const isExcludeMode = config.fileMatchMode === "exclude";
    const ruleTitle = isExcludeMode ? "排除规则" : "白名单规则";
    const ruleDesc = isExcludeMode
      ? "每行一个路径，支持通配符。匹配的文件将被跳过。"
      : "每行一个路径，支持通配符。只有匹配的文件会被同步。";
    const rulePlaceholder = isExcludeMode
      ? ".trash\n.obsidian/\n*.tmp"
      : "Documents/\nProjects/\n*.md";

    new Setting(containerEl)
      .setName(ruleTitle)
      .setDesc(ruleDesc)
      .addTextArea((textArea) => {
        textArea
          .setValue(formatExcludeEntries(config.exclude))
          .setPlaceholder(rulePlaceholder)
          .onChange(async (value) => {
            const lines = value.split(/\r?\n/);
            await this.plugin.updateConfig({
              exclude: normalizeExcludeEntries(lines)
            });
          });
      });

    // 规则说明
    const ruleHint = containerEl.createEl("div", {
      cls: "setting-item-description"
    });

    if (isExcludeMode) {
      ruleHint.innerHTML = `
        <strong>排除规则说明：</strong><br>
        • 每行一个路径或模式<br>
        • 路径使用正斜杠 / <br>
        • 支持前缀匹配（如 .obsidian 会排除 .obsidian/ 下所有文件）
      `;
    } else {
      ruleHint.innerHTML = `
        <strong>白名单规则说明：</strong><br>
        • 每行一个路径或模式<br>
        • 路径使用正斜杠 / <br>
        • 只有明确列出的路径会被同步<br>
        • 支持前缀匹配（如 Documents 会同步 Documents/ 下所有文件）
      `;
    }

    this.addDivider(containerEl);
  }

  /**
   * 渲染高级配置组
   */
  private renderAdvancedSection(containerEl: HTMLElement, config: FeishuSyncConfig): void {
    containerEl.createEl("h3", { text: "高级配置", cls: "setting-item-heading" });

    // 并发上传数量
    new Setting(containerEl)
      .setName("并发上传")
      .setDesc("同时上传的文件数量（1-10）")
      .addSlider((slider) => {
        slider
          .setLimits(1, 10, 1)
          .setValue(config.concurrentUploads)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await this.plugin.updateConfig({ concurrentUploads: value });
          });
      })
      .addExtraButton((button) => button
        .setIcon("reset")
        .setTooltip("恢复默认值 (3)")
        .onClick(async () => {
          await this.plugin.updateConfig({ concurrentUploads: 3 });
          this.display();
        }));

    // 重试次数
    new Setting(containerEl)
      .setName("重试次数")
      .setDesc("上传失败时的重试次数（0-10）")
      .addSlider((slider) => {
        slider
          .setLimits(0, 10, 1)
          .setValue(config.retryAttempts)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await this.plugin.updateConfig({ retryAttempts: value });
          });
      })
      .addExtraButton((button) => button
        .setIcon("reset")
        .setTooltip("恢复默认值 (3)")
        .onClick(async () => {
          await this.plugin.updateConfig({ retryAttempts: 3 });
          this.display();
        }));

    // 重试延迟
    new Setting(containerEl)
      .setName("重试延迟")
      .setDesc("重试前的等待时间（毫秒）")
      .addSlider((slider) => {
        slider
          .setLimits(100, 10000, 100)
          .setValue(config.retryDelay)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await this.plugin.updateConfig({ retryDelay: value });
          });
      })
      .addExtraButton((button) => button
        .setIcon("reset")
        .setTooltip("恢复默认值 (1000ms)")
        .onClick(async () => {
          await this.plugin.updateConfig({ retryDelay: 1000 });
          this.display();
        }));

    // 日志级别
    new Setting(containerEl)
      .setName("日志级别")
      .setDesc("控制日志输出的详细程度")
      .addDropdown((dropdown) => {
        const levels: Record<string, string> = {
          error: "仅错误",
          warn: "警告及以上",
          info: "信息及以上（默认）",
          debug: "调试（最详细）"
        };

        dropdown
          .addOptions(levels)
          .setValue(config.logLevel)
          .onChange(async (value: string) => {
            const logLevel = value as LogLevel;
            await this.plugin.updateConfig({ logLevel });
          });
      });

    this.addDivider(containerEl);
  }

  /**
   * 渲染配置管理组
   */
  private renderConfigManagementSection(containerEl: HTMLElement, config: FeishuSyncConfig): void {
    containerEl.createEl("h3", { text: "配置管理", cls: "setting-item-heading" });

    // 导入导出按钮组
    new Setting(containerEl)
      .setName("配置导入/导出")
      .setDesc("备份或迁移您的配置")
      .addButton((button) =>
        button
          .setButtonText("导出配置")
          .setClass("mod-cta")
          .onClick(async () => this.exportConfiguration(config))
      )
      .addButton((button) =>
        button
          .setButtonText("导入配置")
          .onClick(async () => this.importConfiguration())
      );

    // 恢复默认配置
    new Setting(containerEl)
      .setName("恢复默认配置")
      .setDesc("将所有配置恢复为默认值（不包含认证信息）")
      .addButton((button) =>
        button
          .setButtonText("恢复默认")
          .setWarning()
          .onClick(async () => this.resetToDefaults())
      );

    // 配置验证状态
    const validationResult = validateConfig(config);
    const validationSetting = new Setting(containerEl)
      .setName("配置状态")
      .setDesc(validationResult.isValid
        ? "✓ 配置完整，可以开始同步"
        : `⚠ ${validationResult.errors.join(", ")}`);

    if (validationResult.warnings.length > 0) {
      const warningEl = containerEl.createEl("div", {
        cls: "setting-item-description",
        text: `提示: ${validationResult.warnings.join("; ")}`
      });
      warningEl.style.color = "var(--text-muted)";
    }

    this.addDivider(containerEl);
  }

  /**
   * 渲染状态信息组
   */
  private renderStatusSection(
    containerEl: HTMLElement,
    auth: { refreshToken: string; connectedAt: string | null },
    lastSync: { status: string; message: string } | null
  ): void {
    containerEl.createEl("h3", { text: "状态信息", cls: "setting-item-heading" });

    // 认证状态
    new Setting(containerEl)
      .setName("授权状态")
      .setDesc(
        auth.refreshToken
          ? `已授权${auth.connectedAt ? `，连接时间: ${new Date(auth.connectedAt).toLocaleString()}` : ""}`
          : "尚未授权飞书应用"
      )
      .addButton((button) =>
        button
          .setButtonText("清除授权")
          .setWarning()
          .onClick(async () => {
            await this.plugin.clearAuthorization();
            this.display();
          })
      );

    // 最后同步状态
    new Setting(containerEl)
      .setName("最后同步")
      .setDesc(
        lastSync
          ? `${lastSync.status}: ${lastSync.message}`
          : "暂无同步记录"
      );
  }

  /**
   * 添加文本输入设置
   */
  private addTextSetting(
    containerEl: HTMLElement,
    name: string,
    description: string,
    value: string,
    onChange: (value: string) => Promise<void>,
    options: { placeholder?: string } = {}
  ): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addText((text) => {
        text.setValue(value);
        if (options.placeholder) {
          text.setPlaceholder(options.placeholder);
        }
        text.onChange(onChange);
      });
  }

  /**
   * 添加密码输入设置（支持显示/隐藏切换）
   */
  private addSecretSetting(
    containerEl: HTMLElement,
    name: string,
    description: string,
    value: string,
    onChange: (value: string) => Promise<void>
  ): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addText((text) => {
        text.setValue(value);
        text.inputEl.type = "password";
        text.onChange(onChange);

        // 添加显示/隐藏按钮
        const toggleButton = text.inputEl.createEl("button", {
          cls: "clickable-icon",
          attr: { "aria-label": "显示/隐藏密码" }
        });
        toggleButton.innerHTML = svgEyeOff;
        toggleButton.style.cssText = `
          position: absolute;
          right: 6px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          padding: 4px;
          cursor: pointer;
          color: var(--text-muted);
        `;

        let isVisible = false;
        toggleButton.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          isVisible = !isVisible;
          text.inputEl.type = isVisible ? "text" : "password";
          toggleButton.innerHTML = isVisible ? svgEye : svgEyeOff;
        };
      });
  }

  /**
   * 添加分隔线
   */
  private addDivider(containerEl: HTMLElement): void {
    const divider = containerEl.createEl("div", { cls: "setting-item" });
    divider.style.borderTop = "1px solid var(--background-modifier-border)";
    divider.style.margin = "12px 0";
  }

  /**
   * 测试飞书连接
   */
  private async testConnection(config: FeishuSyncConfig): Promise<void> {
    if (!this.testConnectionButton) {
      return;
    }

    // 禁用按钮，显示加载状态
    this.testConnectionButton.disabled = true;
    const originalText = this.testConnectionButton.textContent;
    this.testConnectionButton.textContent = "测试中...";

    try {
      // 重新获取最新的配置和授权数据
      const pluginData = this.plugin.getPluginData();
      const latestConfig = pluginData.config;

      // 验证必填字段
      const validationResult = validateConfig(latestConfig);

      if (!validationResult.isValid) {
        new Notice(`配置验证失败: ${validationResult.errors.join(", ")}`, 5000);
        return;
      }

      // 检查授权状态的详细信息
      const auth = pluginData.auth;
      const hasRefreshToken = !!auth.refreshToken;
      const hasAccessToken = !!auth.userAccessToken;
      const connectedAt = auth.connectedAt;

      console.log("授权状态检查:", {
        hasRefreshToken,
        hasAccessToken,
        connectedAt,
        authKeys: Object.keys(auth).filter(k => auth[k as keyof typeof auth])
      });

      if (!hasRefreshToken) {
        const authInfo = hasAccessToken
          ? "有 userAccessToken 但缺少 refreshToken（可能授权不完整）"
          : "完全没有授权信息";

        // 自动启动OAuth授权流程
        new Notice(`未授权，正在启动飞书授权流程...\n${authInfo}`, 5000);

        // 检查OAuth是否可用
        if (!this.plugin['oauth']) {
          // 强制初始化OAuth
          this.plugin['initOAuth']();
        }

        // 启动授权
        if (this.plugin['oauth']) {
          const result = await this.plugin['oauth'].authorize();
          if (result.success) {
            // 授权成功，重新验证连接
            new Notice("授权成功！正在验证连接...");
            await this.testConnection(config); // 递归调用，重新测试
            return;
          } else {
            new Notice(`授权失败: ${result.error}`, 8000);
            return;
          }
        } else {
          new Notice("OAuth 初始化失败，请检查配置", 5000);
          return;
        }
      }

      // 显示授权状态的详细信息
      const authStatus = connectedAt
        ? `✅ 已授权 (授权时间: ${new Date(connectedAt).toLocaleString()})`
        : "✅ 已授权 (无授权时间信息)";

      new Notice(`✅ 配置验证通过！\n${authStatus}\n可以开始同步了。`, 3000);

    } catch (error) {
      new Notice(`连接测试失败: ${error instanceof Error ? error.message : String(error)}`, 5000);
    } finally {
      // 恢复按钮状态
      this.testConnectionButton.disabled = false;
      this.testConnectionButton.textContent = originalText;
    }
  }

  /**
   * 导出配置
   */
  private async exportConfiguration(config: FeishuSyncConfig): Promise<void> {
    try {
      const json = exportConfig(config);

      // 创建 Blob 并下载
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `feishu-sync-config-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      new Notice("配置已导出", 3000);
    } catch (error) {
      new Notice(`导出失败: ${error instanceof Error ? error.message : String(error)}`, 5000);
    }
  }

  /**
   * 导入配置
   */
  private async importConfiguration(): Promise<void> {
    try {
      // 创建文件选择器
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          return;
        }

        try {
          const text = await file.text();
          const result = importConfig(text);

          if (!result.success) {
            new Notice(`导入失败: ${result.error}`, 5000);
            return;
          }

          // 确认导入
          const confirmed = await this.confirmImport();
          if (!confirmed) {
            return;
          }

          // 应用导入的配置
          if (result.config) {
            await this.plugin.updateConfig(result.config);
            new Notice("配置已导入", 3000);
            this.display();
          }
        } catch (error) {
          new Notice(`读取文件失败: ${error instanceof Error ? error.message : String(error)}`, 5000);
        }
      };

      input.click();
    } catch (error) {
      new Notice(`导入失败: ${error instanceof Error ? error.message : String(error)}`, 5000);
    }
  }

  /**
   * 确认导入操作
   */
  private async confirmImport(): Promise<boolean> {
    // 使用简单的 confirm 对话框
    return confirm("导入配置将覆盖当前设置，是否继续？");
  }

  /**
   * 恢复默认配置
   */
  private async resetToDefaults(): Promise<void> {
    const confirmed = confirm("确定要恢复默认配置吗？这将清除所有自定义设置（但不包含认证信息）。");

    if (!confirmed) {
      return;
    }

    try {
      // 只恢复配置部分，保留认证信息
      const defaultConfig = DEFAULT_PLUGIN_DATA.config;
      await this.plugin.updateConfig(defaultConfig);
      new Notice("已恢复默认配置", 3000);
      this.display();
    } catch (error) {
      new Notice(`恢复失败: ${error instanceof Error ? error.message : String(error)}`, 5000);
    }
  }
}

// SVG 图标
const svgEye = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const svgEyeOff = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;
