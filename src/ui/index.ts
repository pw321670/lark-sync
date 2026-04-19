/**
 * UI 组件模块
 *
 * 提供用户界面相关的组件，包括同步按钮、进度显示和通知管理。
 */

// 同步按钮
export {
  SyncButton,
  registerSyncCommands,
  addSyncMenuItems,
  type SyncButtonStatus,
  type SyncButtonState,
  type SyncButtonOptions,
  type SyncCommandType,
  type SyncCommandHandlers
} from "./sync-button";

// 进度显示
export {
  ProgressDisplay,
  type SyncPhase,
  type ProgressData,
  type ProgressDisplayOptions,
  EMPTY_PROGRESS
} from "./progress-display";

// 通知管理器
export {
  NotificationManager,
  createNotificationManager,
  notificationManager,
  type NotificationLevel,
  type NotificationAction,
  type NotificationConfig,
  type SyncSummary
} from "./notification-manager";
