import { App, Modal, Notice } from "obsidian";

/**
 * 同步阶段
 */
export type SyncPhase =
  | "idle"
  | "authorizing"
  | "refreshing-token"
  | "scanning"
  | "ensuring-folders"
  | "uploading"
  | "writing-state"
  | "completed"
  | "failed";

/**
 * 进度数据
 */
export interface ProgressData {
  /** 当前阶段 */
  phase: SyncPhase;
  /** 当前文件名 */
  currentFile: string;
  /** 进度百分比 (0-100) */
  percentage: number;
  /** 上传速度 (bytes/s) */
  speed: number;
  /** 已上传文件数 */
  uploadedCount: number;
  /** 跳过未修改文件数 */
  skippedCount: number;
  /** 失败文件数 */
  failedCount: number;
  /** 总文件数 */
  totalCount: number;
  /** 剩余时间估算 (秒) */
  estimatedTimeRemaining: number;
  /** 开始时间 */
  startTime?: number;
}

/**
 * 空进度数据
 */
export const EMPTY_PROGRESS: ProgressData = {
  phase: "idle",
  currentFile: "",
  percentage: 0,
  speed: 0,
  uploadedCount: 0,
  skippedCount: 0,
  failedCount: 0,
  totalCount: 0,
  estimatedTimeRemaining: 0
};

/**
 * 进度显示配置
 */
export interface ProgressDisplayOptions {
  /** 模态框标题 */
  title?: string;
  /** 最小宽度 */
  minWidth?: number;
  /** 允许关闭 */
  closeable?: boolean;
  /** 关闭回调 */
  onClose?: () => void;
}

/**
 * 格式化字节大小
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/**
 * 格式化速度
 */
function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return "";
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * 格式化时间
 */
function formatTime(seconds: number): string {
  if (seconds === 0 || !isFinite(seconds)) return "";

  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}s` : `${hours}h`;
}

/**
 * 获取阶段显示文本
 */
function getPhaseText(phase: SyncPhase): string {
  const phaseLabels: Record<SyncPhase, string> = {
    idle: "Ready",
    authorizing: "Authorizing...",
    "refreshing-token": "Refreshing access token...",
    scanning: "Scanning vault...",
    "ensuring-folders": "Ensuring Feishu folders...",
    uploading: "Uploading files...",
    "writing-state": "Writing sync state...",
    completed: "Completed",
    failed: "Failed"
  };

  return phaseLabels[phase] || phase;
}

/**
 * 进度模态框
 *
 * 显示详细的同步进度信息
 */
class ProgressModal extends Modal {
  private progressData: ProgressData = { ...EMPTY_PROGRESS };
  private updateTimer: number | null = null;
  private closeable: boolean = true;
  public isOpen: boolean = false;

  // UI 元素引用
  private phaseEl: HTMLElement | null = null;
  private progressBarEl: HTMLElement | null = null;
  private progressTextEl: HTMLElement | null = null;
  private currentFileEl: HTMLElement | null = null;
  private speedEl: HTMLElement | null = null;
  private statsEl: HTMLElement | null = null;
  private timeEl: HTMLElement | null = null;

  constructor(app: App, options: ProgressDisplayOptions = {}) {
    super(app);
    this.closeable = options.closeable ?? true;

    this.containerEl.addClass("feishu-sync-progress-modal");
    this.render(options.title);
  }

  /**
   * 渲染模态框内容
   */
  private render(title?: string): void {
    this.contentEl.empty();
    this.contentEl.addClass("feishu-sync-progress-content");

    // 标题栏
    const headerEl = this.contentEl.createDiv({ cls: "feishu-sync-progress-header" });
    headerEl.createEl("h2", { text: title ?? "Syncing to Feishu", cls: "feishu-sync-progress-title" });

    // 主要内容区域
    const mainEl = this.contentEl.createDiv({ cls: "feishu-sync-progress-main" });

    // 阶段指示器
    this.phaseEl = mainEl.createDiv({ cls: "feishu-sync-progress-phase" });
    this.phaseEl.textContent = getPhaseText(this.progressData.phase);

    // 进度条容器
    const progressContainerEl = mainEl.createDiv({ cls: "feishu-sync-progress-bar-container" });

    // 进度条
    this.progressBarEl = progressContainerEl.createDiv({ cls: "feishu-sync-progress-bar" });
    this.progressBarEl.createDiv({ cls: "feishu-sync-progress-bar-fill" });

    // 进度百分比文本
    this.progressTextEl = progressContainerEl.createDiv({ cls: "feishu-sync-progress-text" });
    this.progressTextEl.textContent = "0%";

    // 当前文件
    this.currentFileEl = mainEl.createDiv({ cls: "feishu-sync-progress-file" });
    this.currentFileEl.textContent = "Waiting to start...";

    // 速度和时间信息行
    const infoRowEl = mainEl.createDiv({ cls: "feishu-sync-progress-info-row" });

    this.speedEl = infoRowEl.createDiv({ cls: "feishu-sync-progress-speed" });
    this.speedEl.textContent = "";

    this.timeEl = infoRowEl.createDiv({ cls: "feishu-sync-progress-time" });
    this.timeEl.textContent = "";

    // 统计信息
    this.statsEl = mainEl.createDiv({ cls: "feishu-sync-progress-stats" });

    // 底部按钮区域
    const footerEl = this.contentEl.createDiv({ cls: "feishu-sync-progress-footer" });

    const closeBtn = footerEl.createEl("button", {
      text: "Run in background",
      cls: "mod-cta"
    });
    closeBtn.onclick = () => this.close();

    // 样式
    this.addStyles();
  }

  /**
   * 添加自定义样式
   */
  private addStyles(): void {
    const styleId = "feishu-sync-progress-styles";
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .feishu-sync-progress-content {
        padding: 20px;
        min-width: 400px;
        max-width: 600px;
      }

      .feishu-sync-progress-header {
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--background-modifier-border);
      }

      .feishu-sync-progress-title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--text-normal);
      }

      .feishu-sync-progress-main {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .feishu-sync-progress-phase {
        font-size: 14px;
        color: var(--text-muted);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .feishu-sync-progress-phase::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: var(--text-muted);
      }

      .feishu-sync-progress-phase.uploading::before,
      .feishu-sync-progress-phase.scanning::before,
      .feishu-sync-progress-phase.authorizing::before {
        background-color: var(--interactive-accent);
        animation: pulse 1.5s infinite;
      }

      .feishu-sync-progress-phase.completed::before {
        background-color: var(--color-success);
      }

      .feishu-sync-progress-phase.failed::before {
        background-color: var(--color-error);
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .feishu-sync-progress-bar-container {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .feishu-sync-progress-bar {
        height: 8px;
        background-color: var(--background-modifier-border);
        border-radius: 4px;
        overflow: hidden;
      }

      .feishu-sync-progress-bar-fill {
        height: 100%;
        width: 0%;
        background-color: var(--interactive-accent);
        border-radius: 4px;
        transition: width 0.3s ease;
      }

      .feishu-sync-progress-text {
        font-size: 12px;
        color: var(--text-muted);
        text-align: right;
      }

      .feishu-sync-progress-file {
        font-size: 13px;
        color: var(--text-normal);
        padding: 8px 12px;
        background-color: var(--background-secondary);
        border-radius: 4px;
        word-break: break-all;
        min-height: 36px;
        display: flex;
        align-items: center;
      }

      .feishu-sync-progress-info-row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
      }

      .feishu-sync-progress-speed,
      .feishu-sync-progress-time {
        font-size: 12px;
        color: var(--text-muted);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .feishu-sync-progress-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        padding: 12px;
        background-color: var(--background-secondary);
        border-radius: 4px;
      }

      .feishu-sync-progress-stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .feishu-sync-progress-stat-label {
        font-size: 10px;
        color: var(--text-muted);
        text-transform: uppercase;
      }

      .feishu-sync-progress-stat-value {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-normal);
      }

      .feishu-sync-progress-footer {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid var(--background-modifier-border);
        display: flex;
        justify-content: flex-end;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 更新进度数据
   */
  updateProgress(data: Partial<ProgressData>): void {
    this.progressData = {
      ...this.progressData,
      ...data
    };

    // 延迟更新 UI 以避免过度渲染
    if (this.updateTimer === null) {
      this.updateTimer = window.setTimeout(() => {
        this.renderProgress();
        this.updateTimer = null;
      }, 50);
    }
  }

  /**
   * 渲染进度信息
   */
  private renderProgress(): void {
    if (!this.phaseEl || !this.progressBarEl || !this.progressTextEl) {
      return;
    }

    // 更新阶段
    this.phaseEl.textContent = getPhaseText(this.progressData.phase);
    this.phaseEl.className = `feishu-sync-progress-phase ${this.progressData.phase}`;

    // 更新进度条
    const percentage = Math.min(100, Math.max(0, this.progressData.percentage));
    const barFill = this.progressBarEl.querySelector(".feishu-sync-progress-bar-fill") as HTMLElement;
    if (barFill) {
      barFill.style.width = `${percentage}%`;
    }
    this.progressTextEl.textContent = `${percentage}%`;

    // 更新当前文件
    if (this.currentFileEl) {
      if (this.progressData.currentFile) {
        this.currentFileEl.textContent = this.progressData.currentFile;
      } else {
        const phaseText = getPhaseText(this.progressData.phase);
        this.currentFileEl.textContent = phaseText;
      }
    }

    // 更新速度
    if (this.speedEl) {
      const speed = formatSpeed(this.progressData.speed);
      this.speedEl.textContent = speed ? `Speed: ${speed}` : "";
    }

    // 更新剩余时间
    if (this.timeEl) {
      const time = formatTime(this.progressData.estimatedTimeRemaining);
      this.timeEl.textContent = time ? `ETA: ${time}` : "";
    }

    // 更新统计信息
    if (this.statsEl) {
      this.statsEl.empty();

      this.addStatItem("Total", this.progressData.totalCount.toString());
      this.addStatItem("Uploaded", this.progressData.uploadedCount.toString());
      this.addStatItem("Skipped", this.progressData.skippedCount.toString());

      if (this.progressData.failedCount > 0) {
        this.addStatItem("Failed", this.progressData.failedCount.toString(), "error");
      }
    }
  }

  /**
   * 添加统计项
   */
  private addStatItem(label: string, value: string, variant: "normal" | "error" = "normal"): void {
    if (!this.statsEl) return;

    const statEl = this.statsEl.createDiv({ cls: "feishu-sync-progress-stat" });

    const labelEl = statEl.createDiv({ cls: "feishu-sync-progress-stat-label" });
    labelEl.textContent = label;

    const valueEl = statEl.createDiv({ cls: "feishu-sync-progress-stat-value" });
    valueEl.textContent = value;

    if (variant === "error") {
      valueEl.style.color = "var(--color-error)";
    }
  }

  /**
   * 标记完成
   */
  complete(success: boolean, message?: string): void {
    this.progressData.phase = success ? "completed" : "failed";
    this.progressData.percentage = 100;
    this.renderProgress();

    if (this.currentFileEl && message) {
      this.currentFileEl.textContent = message;
    }

    // 完成后允许关闭
    this.closeable = true;

    // 2秒后自动关闭
    setTimeout(() => {
      if (this.isOpen) {
        this.close();
      }
    }, 2000);
  }

  /**
   * 覆盖 open 方法
   */
  override open(): void {
    super.open();
    this.isOpen = true;
  }

  /**
   * 覆盖 close 方法
   */
  override close(): void {
    super.close();
    this.isOpen = false;
  }

  /**
   * 覆盖 onClose 方法以控制关闭行为
   */
  override onClose(): void {
    this.isOpen = false;
    if (this.closeable) {
      super.onClose();
    }
  }

  /**
   * 设置是否允许关闭
   */
  setCloseable(closeable: boolean): void {
    this.closeable = closeable;
  }
}

/**
 * 进度显示组件
 *
 * 管理同步进度的显示，包括模态框和状态栏
 */
export class ProgressDisplay {
  private modal: ProgressModal | null = null;
  private statusBarEl: HTMLElement | null = null;
  private currentProgress: ProgressData = { ...EMPTY_PROGRESS };

  constructor(statusBarEl?: HTMLElement) {
    this.statusBarEl = statusBarEl ?? null;
  }

  /**
   * 显示进度模态框
   */
  show(options?: ProgressDisplayOptions): void {
    // 如果已经打开，不重复创建
    if (this.modal?.isOpen) {
      return;
    }

    // 获取 Obsidian app 实例
    const app = (window as { app?: App }).app;
    if (!app) {
      console.warn("ProgressDisplay: Obsidian app not found");
      return;
    }

    this.modal = new ProgressModal(app, {
      ...options,
      onClose: () => {
        options?.onClose?.();
        this.modal = null;
      }
    });

    this.modal.open();
  }

  /**
   * 隐藏进度模态框
   */
  hide(): void {
    if (this.modal?.isOpen) {
      this.modal.close();
    }
    this.modal = null;
  }

  /**
   * 切换模态框显示状态
   */
  toggle(): void {
    if (this.modal?.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * 更新进度数据
   */
  update(data: Partial<ProgressData>): void {
    this.currentProgress = {
      ...this.currentProgress,
      ...data
    };

    // 更新模态框
    if (this.modal?.isOpen) {
      this.modal.updateProgress(this.currentProgress);
    }

    // 更新状态栏
    this.updateStatusBar();
  }

  /**
   * 重置进度数据
   */
  reset(): void {
    this.currentProgress = { ...EMPTY_PROGRESS };

    if (this.modal?.isOpen) {
      this.modal.updateProgress(this.currentProgress);
    }

    this.updateStatusBar();
  }

  /**
   * 标记同步成功
   */
  complete(message?: string): void {
    this.currentProgress.phase = "completed";
    this.currentProgress.percentage = 100;

    if (this.modal?.isOpen) {
      this.modal.complete(true, message ?? "Sync completed successfully");
    }

    this.updateStatusBar();
  }

  /**
   * 标记同步失败
   */
  fail(message?: string): void {
    this.currentProgress.phase = "failed";

    if (this.modal?.isOpen) {
      this.modal.complete(false, message ?? "Sync failed");
    }

    this.updateStatusBar();
  }

  /**
   * 设置是否允许关闭模态框
   */
  setCloseable(closeable: boolean): void {
    if (this.modal) {
      this.modal.setCloseable(closeable);
    }
  }

  /**
   * 更新状态栏文本
   */
  private updateStatusBar(): void {
    if (!this.statusBarEl) {
      return;
    }

    const { phase, percentage, uploadedCount, skippedCount, failedCount } = this.currentProgress;

    if (phase === "idle") {
      this.statusBarEl.setText("Feishu Sync: idle");
      return;
    }

    if (phase === "completed") {
      this.statusBarEl.setText(`Feishu Sync: completed (${uploadedCount} uploaded)`);
      return;
    }

    if (phase === "failed") {
      this.statusBarEl.setText(`Feishu Sync: failed`);
      return;
    }

    // 同步中状态
    const phaseText = getPhaseText(phase);
    const stats = [`↑${uploadedCount}`, `⊘${skippedCount}`];

    if (failedCount > 0) {
      stats.push(`✗${failedCount}`);
    }

    if (percentage > 0) {
      stats.push(`${percentage}%`);
    }

    this.statusBarEl.setText(`Feishu Sync: ${phaseText} (${stats.join(" ")})`);
  }

  /**
   * 获取当前进度数据
   */
  getProgress(): ProgressData {
    return { ...this.currentProgress };
  }

  /**
   * 检查模态框是否打开
   */
  isOpen(): boolean {
    return this.modal?.isOpen ?? false;
  }
}
