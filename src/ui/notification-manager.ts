import { Notice } from "obsidian";

/**
 * 通知级别
 */
export type NotificationLevel = "info" | "warning" | "error";

/**
 * 通知操作按钮
 */
export interface NotificationAction {
  /** 按钮文本 */
  label: string;
  /** 点击回调 */
  callback: () => void;
}

/**
 * 通知配置
 */
export interface NotificationConfig {
  /** 通知级别 */
  level: NotificationLevel;
  /** 通知标题 */
  title: string;
  /** 通知消息 */
  message: string;
  /** 持续时间（毫秒），0 表示不自动关闭 */
  duration?: number;
  /** 操作按钮 */
  actions?: NotificationAction[];
}

/**
 * 同步摘要数据
 */
export interface SyncSummary {
  /** 同步状态 */
  status: "success" | "failed" | "partial";
  /** 开始时间 */
  startTime?: number;
  /** 结束时间 */
  endTime?: number;
  /** 扫描的文件数 */
  filesScanned: number;
  /** 上传成功数 */
  uploadedCount: number;
  /** 跳过数（未修改） */
  skippedCount: number;
  /** 失败数 */
  failedCount: number;
  /** 失败的第一个文件路径 */
  firstFailedPath?: string;
  /** 错误消息 */
  errorMessage?: string;
}

/**
 * 通知管理器
 *
 * 封装 Obsidian Notice API，提供统一的通知接口
 * 支持同步开始/完成/失败等场景的通知
 */
export class NotificationManager {
  private readonly defaultDuration = 5000;
  private activeNotices: Notice[] = [];

  /**
   * 显示信息通知
   */
  info(message: string, duration?: number): Notice {
    return this.show({
      level: "info",
      title: "",
      message,
      duration: duration ?? this.defaultDuration
    });
  }

  /**
   * 显示警告通知
   */
  warning(message: string, duration?: number): Notice {
    return this.show({
      level: "warning",
      title: "Warning",
      message,
      duration: duration ?? this.defaultDuration
    });
  }

  /**
   * 显示错误通知
   */
  error(message: string, duration?: number): Notice {
    return this.show({
      level: "error",
      title: "Error",
      message,
      duration: duration ?? 8000
    });
  }

  /**
   * 显示通知
   */
  show(config: NotificationConfig): Notice {
    const message = this.formatMessage(config);
    const options = this.buildOptions(config);

    const notice = new Notice(message, options);
    this.activeNotices.push(notice);

    // 清理已关闭的通知
    setTimeout(() => {
      this.activeNotices = this.activeNotices.filter(n => n !== notice);
    }, config.duration ?? this.defaultDuration);

    return notice;
  }

  /**
   * 格式化通知消息
   */
  private formatMessage(config: NotificationConfig): string {
    if (config.title) {
      return `${config.title}: ${config.message}`;
    }
    return config.message;
  }

  /**
   * 构建 Notice 选项
   */
  private buildOptions(config: NotificationConfig): number {
    return config.duration ?? this.defaultDuration;
  }

  /**
   * 清除所有活动通知
   */
  clearAll(): void {
    this.activeNotices.forEach(notice => {
      notice.hide();
    });
    this.activeNotices = [];
  }

  // ==================== 同步相关通知 ====================

  /**
   * 显示同步开始通知
   */
  syncStarted(): Notice {
    return this.info("Starting sync to Feishu...", 3000);
  }

  /**
   * 显示同步完成通知
   */
  syncCompleted(summary: SyncSummary): Notice {
    const duration = summary.failedCount > 0 ? 10000 : 5000;
    const message = this.formatSyncSummary(summary);

    if (summary.status === "failed") {
      return this.show({
        level: "error",
        title: "Sync failed",
        message,
        duration
      });
    }

    if (summary.status === "partial") {
      return this.show({
        level: "warning",
        title: "Sync partially completed",
        message,
        duration
      });
    }

    return this.show({
      level: "info",
      title: "Sync completed",
      message,
      duration
    });
  }

  /**
   * 格式化同步摘要
   */
  private formatSyncSummary(summary: SyncSummary): string {
    const parts: string[] = [];

    // 添加基本统计
    if (summary.uploadedCount > 0) {
      parts.push(`${summary.uploadedCount} uploaded`);
    }

    if (summary.skippedCount > 0) {
      parts.push(`${summary.skippedCount} skipped`);
    }

    if (summary.failedCount > 0) {
      parts.push(`${summary.failedCount} failed`);
    }

    let message = parts.join(", ");

    // 添加错误详情
    if (summary.failedCount > 0 && summary.firstFailedPath) {
      message += `\nFailed at: ${this.truncatePath(summary.firstFailedPath)}`;
    }

    if (summary.errorMessage) {
      message += `\nError: ${summary.errorMessage}`;
    }

    // 添加耗时
    if (summary.startTime && summary.endTime) {
      const elapsed = ((summary.endTime - summary.startTime) / 1000).toFixed(1);
      message += `\nCompleted in ${elapsed}s`;
    }

    return message || "No files were synced";
  }

  /**
   * 截断文件路径
   */
  private truncatePath(path: string, maxLength = 50): string {
    if (path.length <= maxLength) {
      return path;
    }

    // 保留开头和结尾
    const start = path.substring(0, maxLength / 2 - 2);
    const end = path.substring(path.length - (maxLength / 2 - 1));

    return `${start}...${end}`;
  }

  /**
   * 显示授权开始通知
   */
  authStarted(): Notice {
    return this.info("Opening Feishu authorization page...", 5000);
  }

  /**
   * 显示授权成功通知
   */
  authSucceeded(): Notice {
    return this.info("Successfully connected to Feishu!", 5000);
  }

  /**
   * 显示授权失败通知
   */
  authFailed(reason?: string): Notice {
    const message = reason
      ? `Failed to authorize: ${reason}`
      : "Failed to authorize with Feishu. Please try again.";

    return this.error(message, 8000);
  }

  /**
   * 显示需要配置通知
   */
  needsConfiguration(missingFields: string[]): Notice {
    const fields = missingFields.join(", ");
    const message = `Please configure the following settings: ${fields}`;

    return this.warning(message, 8000);
  }

  /**
   * 显示需要授权通知
   */
  needsAuthorization(): Notice {
    return this.warning("Please authorize with Feishu first.", 6000);
  }

  /**
   * 显示配置已更新通知
   */
  configUpdated(): Notice {
    return this.info("Configuration updated.", 3000);
  }

  /**
   * 显示同步已取消通知
   */
  syncCancelled(): Notice {
    return this.info("Sync cancelled by user.", 3000);
  }

  /**
   * 显示同步已暂停通知
   */
  syncPaused(): Notice {
    return this.info("Sync paused.", 3000);
  }

  /**
   * 显示同步已恢复通知
   */
  syncResumed(): Notice {
    return this.info("Sync resumed.", 3000);
  }

  /**
   * 显示网络错误通知
   */
  networkError(error?: string): Notice {
    const message = error
      ? `Network error: ${error}`
      : "Network error. Please check your connection.";

    return this.error(message, 8000);
  }

  /**
   * 显示文件过大通知
   */
  fileTooLarge(filePath: string, maxSizeMB: number): Notice {
    const message = `File too large: ${this.truncatePath(filePath)}\nMax size: ${maxSizeMB} MB`;

    return this.warning(message, 6000);
  }

  /**
   * 显示预览完成通知
   */
  previewComplete(candidateCount: number, excludedCount: number): Notice {
    const message = `Preview: ${candidateCount} files ready to sync, ${excludedCount} excluded.`;

    return this.info(message, 5000);
  }

  /**
   * 显示令牌刷新成功通知（静默）
   */
  tokenRefreshed(): void {
    // 令牌刷新是后台操作，不显示通知
    // 可以在这里记录日志
  }

  /**
   * 显示令牌刷新失败通知
   */
  tokenRefreshFailed(): Notice {
    return this.warning("Failed to refresh access token. Please re-authorize.", 8000);
  }

  /**
   * 显示并发同步警告
   */
  concurrentSyncBlocked(): Notice {
    return this.warning("A sync is already in progress. Please wait for it to complete.", 5000);
  }

  /**
   * 显示文件夹创建成功通知（静默）
   */
  folderCreated(path: string): void {
    // 文件夹创建是同步的一部分，不显示通知
    // 可以在这里记录日志
  }

  /**
   * 显示文件夹创建失败通知
   */
  folderCreationFailed(path: string, error: string): Notice {
    const message = `Failed to create folder: ${this.truncatePath(path)}\n${error}`;

    return this.error(message, 8000);
  }

  /**
   * 显示文件上传成功通知（静默）
   */
  fileUploaded(path: string): void {
    // 文件上传是同步的一部分，不显示通知
    // 可以在这里记录日志
  }

  /**
   * 显示文件上传失败通知
   */
  fileUploadFailed(path: string, error: string): Notice {
    const message = `Failed to upload: ${this.truncatePath(path)}\n${error}`;

    return this.error(message, 8000);
  }
}

/**
 * 创建全局通知管理器实例
 */
export function createNotificationManager(): NotificationManager {
  return new NotificationManager();
}

/**
 * 默认通知管理器实例
 */
export const notificationManager = createNotificationManager();
