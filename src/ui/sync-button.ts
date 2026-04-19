import { Plugin, Menu, MenuItem, addIcon } from "obsidian";

// 自定义飞书同步图标 - 完全参照飞书的鸟形状
const feishuSyncIcon = `<svg version="1.1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <!-- 飞书的鸟形状（硬朗折线） -->
  <path d="M4 8L12 4L20 8L12 12Z"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="miter"/>

  <path d="M4 8L12 20L20 8"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="miter"/>

  <path d="M12 12V20"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="miter"/>

  <!-- 同步箭头（右上） -->
  <path d="M17 4L20 1L23 4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="square"
        stroke-linejoin="miter"/>

  <path d="M20 1V6"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="square"/>

  <path d="M17 6H20C22 6 23 7 23 9"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="square"
        stroke-linejoin="miter"/>
</svg>`;

/**
 * 同步按钮状态
 */
export type SyncButtonStatus = "idle" | "syncing" | "success" | "error" | "warning";

/**
 * 同步按钮状态配置
 */
export interface SyncButtonState {
  status: SyncButtonStatus;
  enabled: boolean;
  tooltip: string;
}

/**
 * 同步按钮配置选项
 */
export interface SyncButtonOptions {
  /** 按钮点击回调 */
  onClick: () => void;
  /** 状态变化回调 */
  onStatusChange?: (status: SyncButtonStatus) => void;
}

/**
 * 同步按钮组件
 *
 * 在 Obsidian 左侧边栏添加同步图标，显示当前同步状态
 * 支持点击触发同步，鼠标悬停显示提示
 */
export class SyncButton {
  private readonly plugin: Plugin;
  private readonly options: SyncButtonOptions;
  private ribbonIconEl: HTMLElement | null = null;
  private currentState: SyncButtonState = {
    status: "idle",
    enabled: true,
    tooltip: "Feishu Sync"
  };
  private animationInterval: number | null = null;

  // 状态图标映射
  private static readonly STATUS_ICONS: Record<SyncButtonStatus, string> = {
    idle: "☁️",
    syncing: "🔄",
    success: "✅",
    error: "❌",
    warning: "⚠️"
  };

  // 默认提示文本
  private static readonly DEFAULT_TOOLTIPS: Record<SyncButtonStatus, string> = {
    idle: "Start sync to Feishu",
    syncing: "Syncing to Feishu...",
    success: "Sync completed successfully",
    error: "Sync failed",
    warning: "Setup required or authorization needed"
  };

  constructor(plugin: Plugin, options: SyncButtonOptions) {
    this.plugin = plugin;
    this.options = options;
    this.init();
  }

  /**
   * 初始化同步按钮
   */
  private init(): void {
    // 注册自定义图标
    addIcon("feishu-sync-custom", feishuSyncIcon);

    this.ribbonIconEl = this.plugin.addRibbonIcon(
      "feishu-sync-custom", // 使用自定义图标
      this.currentState.tooltip,
      () => this.handleClick()
    );

    this.updateIcon();
  }

  /**
   * 处理按钮点击事件
   */
  private handleClick(): void {
    if (!this.currentState.enabled) {
      return;
    }

    this.options.onClick();
  }

  /**
   * 更新按钮状态
   */
  setState(state: Partial<SyncButtonState>): void {
    const previousStatus = this.currentState.status;

    this.currentState = {
      ...this.currentState,
      ...state
    };

    // 状态变化时触发回调
    if (previousStatus !== this.currentState.status) {
      this.options.onStatusChange?.(this.currentState.status);
    }

    this.updateIcon();
  }

  /**
   * 更新图标显示
   */
  private updateIcon(): void {
    if (!this.ribbonIconEl) {
      return;
    }

    // 移除所有状态类
    this.ribbonIconEl.classList.remove("syncing", "success", "error", "warning", "disabled");

    // 添加当前状态类
    this.ribbonIconEl.classList.add(this.currentState.status);

    // 更新悬停提示
    this.ribbonIconEl.setAttribute("aria-label", this.currentState.tooltip);

    // 同步中状态添加旋转动画
    if (this.currentState.status === "syncing") {
      this.startAnimation();
    } else {
      this.stopAnimation();
    }

    // 根据状态设置可用性
    if (!this.currentState.enabled) {
      this.ribbonIconEl.classList.add("disabled");
    }
  }

  /**
   * 启动旋转动画
   */
  private startAnimation(): void {
    if (this.animationInterval !== null) {
      return;
    }

    let rotation = 0;
    this.animationInterval = window.setInterval(() => {
      rotation = (rotation + 15) % 360;
      if (this.ribbonIconEl) {
        this.ribbonIconEl.style.transform = `rotate(${rotation}deg)`;
      }
    }, 100);
  }

  /**
   * 停止旋转动画
   */
  private stopAnimation(): void {
    if (this.animationInterval !== null) {
      window.clearInterval(this.animationInterval);
      this.animationInterval = null;
    }

    if (this.ribbonIconEl) {
      this.ribbonIconEl.style.transform = "";
    }
  }

  /**
   * 设置状态为空闲
   */
  setIdle(tooltip?: string): void {
    this.setState({
      status: "idle",
      enabled: true,
      tooltip: tooltip ?? SyncButton.DEFAULT_TOOLTIPS.idle
    });
  }

  /**
   * 设置状态为同步中
   */
  setSyncing(tooltip?: string): void {
    this.setState({
      status: "syncing",
      enabled: true,
      tooltip: tooltip ?? SyncButton.DEFAULT_TOOLTIPS.syncing
    });
  }

  /**
   * 设置状态为成功
   */
  setSuccess(tooltip?: string): void {
    this.setState({
      status: "success",
      enabled: true,
      tooltip: tooltip ?? SyncButton.DEFAULT_TOOLTIPS.success
    });

    // 3秒后自动恢复空闲状态
    setTimeout(() => {
      if (this.currentState.status === "success") {
        this.setIdle();
      }
    }, 3000);
  }

  /**
   * 设置状态为错误
   */
  setError(tooltip?: string): void {
    this.setState({
      status: "error",
      enabled: true,
      tooltip: tooltip ?? SyncButton.DEFAULT_TOOLTIPS.error
    });
  }

  /**
   * 设置状态为警告
   */
  setWarning(tooltip?: string): void {
    this.setState({
      status: "warning",
      enabled: true,
      tooltip: tooltip ?? SyncButton.DEFAULT_TOOLTIPS.warning
    });
  }

  /**
   * 设置按钮可用性
   */
  setEnabled(enabled: boolean): void {
    this.setState({ enabled });
  }

  /**
   * 获取当前状态
   */
  getState(): SyncButtonState {
    return { ...this.currentState };
  }

  /**
   * 销毁组件
   */
  destroy(): void {
    this.stopAnimation();
    this.ribbonIconEl = null;
  }
}

/**
 * 同步命令类型
 */
export type SyncCommandType =
  | "start-sync"
  | "pause-sync"
  | "resume-sync"
  | "cancel-sync"
  | "open-settings"
  | "show-status";

/**
 * 同步命令处理器
 */
export interface SyncCommandHandlers {
  startSync?: () => void | Promise<void>;
  pauseSync?: () => void | Promise<void>;
  resumeSync?: () => void | Promise<void>;
  cancelSync?: () => void | Promise<void>;
  openSettings?: () => void;
  showStatus?: () => void;
}

/**
 * 注册同步相关命令
 *
 * @param plugin - Obsidian 插件实例
 * @param handlers - 命令处理函数映射
 */
export function registerSyncCommands(plugin: Plugin, handlers: SyncCommandHandlers): void {
  // 开始同步
  if (handlers.startSync) {
    plugin.addCommand({
      id: "feishu-sync-start",
      name: "Start sync to Feishu",
      callback: handlers.startSync
    });
  }

  // 暂停同步
  if (handlers.pauseSync) {
    plugin.addCommand({
      id: "feishu-sync-pause",
      name: "Pause sync to Feishu",
      callback: handlers.pauseSync
    });
  }

  // 恢复同步
  if (handlers.resumeSync) {
    plugin.addCommand({
      id: "feishu-sync-resume",
      name: "Resume sync to Feishu",
      callback: handlers.resumeSync
    });
  }

  // 取消同步
  if (handlers.cancelSync) {
    plugin.addCommand({
      id: "feishu-sync-cancel",
      name: "Cancel sync to Feishu",
      callback: handlers.cancelSync
    });
  }

  // 打开设置
  if (handlers.openSettings) {
    plugin.addCommand({
      id: "feishu-sync-settings",
      name: "Open Feishu sync settings",
      callback: handlers.openSettings
    });
  }

  // 显示状态
  if (handlers.showStatus) {
    plugin.addCommand({
      id: "feishu-sync-status",
      name: "Show Feishu sync status",
      callback: handlers.showStatus
    });
  }
}

/**
 * 为菜单添加同步相关选项
 *
 * @param menu - Obsidian 菜单实例
 * @param handlers - 命令处理函数映射
 */
export function addSyncMenuItems(menu: Menu, handlers: SyncCommandHandlers): void {
  if (handlers.startSync) {
    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Start sync to Feishu")
        .setIcon("cloud-upload")
        .onClick(() => handlers.startSync?.());
    });
  }

  if (handlers.pauseSync) {
    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Pause sync")
        .setIcon("pause")
        .onClick(() => handlers.pauseSync?.());
    });
  }

  if (handlers.resumeSync) {
    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Resume sync")
        .setIcon("play")
        .onClick(() => handlers.resumeSync?.());
    });
  }

  if (handlers.cancelSync) {
    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Cancel sync")
        .setIcon("x")
        .onClick(() => handlers.cancelSync?.());
    });
  }

  menu.addSeparator();

  if (handlers.openSettings) {
    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Open Feishu sync settings")
        .setIcon("settings")
        .onClick(() => handlers.openSettings?.());
    });
  }

  if (handlers.showStatus) {
    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Show sync status")
        .setIcon("info")
        .onClick(() => handlers.showStatus?.());
    });
  }
}
