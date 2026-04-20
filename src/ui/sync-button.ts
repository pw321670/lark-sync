import { Plugin, addIcon } from 'obsidian';

export type SyncButtonStatus = 'idle' | 'syncing' | 'success' | 'error' | 'warning';

export interface SyncButtonOptions {
  onClick: () => void;
}

export interface SyncCommandHandlers {
  startSync?: () => void | Promise<void>;
  cancelSync?: () => void | Promise<void>;
  openSettings?: () => void;
  showStatus?: () => void;
}

const iconName = 'lark-sync';
const iconSvg = `
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 38c0-13 11-24 24-24 7 0 14 3 18 8l5-5v18H49l7-7a17 17 0 0 0-12-5c-9 0-17 7-17 15z" fill="currentColor"/>
    <path d="M80 62c0 13-11 24-24 24-7 0-14-3-18-8l-5 5V65h18l-7 7a17 17 0 0 0 12 5c9 0 17-7 17-15z" fill="currentColor"/>
  </svg>
`;

export class SyncButton {
  private readonly ribbonIconEl: HTMLElement;
  private resetTimer: number | null = null;

  constructor(
    private readonly plugin: Plugin,
    private readonly options: SyncButtonOptions,
  ) {
    addIcon(iconName, iconSvg);
    this.ribbonIconEl = this.plugin.addRibbonIcon(
      iconName,
      'Start Lark Sync',
      () => this.options.onClick(),
    );
    this.setIdle();
  }

  setIdle(): void {
    this.setState('idle', 'Start Lark Sync');
  }

  setSyncing(): void {
    this.setState('syncing', 'Lark Sync in progress...');
  }

  setSuccess(): void {
    this.setState('success', 'Lark Sync completed');
    this.scheduleReset();
  }

  setError(): void {
    this.setState('error', 'Lark Sync failed');
  }

  setWarning(): void {
    this.setState('warning', 'Lark Sync needs attention');
  }

  destroy(): void {
    if (this.resetTimer !== null) {
      window.clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  private setState(status: SyncButtonStatus, tooltip: string): void {
    this.ribbonIconEl.setAttribute('aria-label', tooltip);
    this.ribbonIconEl.removeClass(
      'lark-sync-idle',
      'lark-sync-syncing',
      'lark-sync-success',
      'lark-sync-error',
      'lark-sync-warning',
    );
    this.ribbonIconEl.addClass(`lark-sync-${status}`);
  }

  private scheduleReset(): void {
    if (this.resetTimer !== null) {
      window.clearTimeout(this.resetTimer);
    }

    this.resetTimer = window.setTimeout(() => {
      this.resetTimer = null;
      this.setIdle();
    }, 3000);
  }
}

export function registerSyncCommands(
  plugin: Plugin,
  handlers: SyncCommandHandlers,
): void {
  if (handlers.startSync) {
    plugin.addCommand({
      id: 'feishu-sync-start',
      name: 'Start Lark Sync',
      callback: handlers.startSync,
    });
  }

  if (handlers.cancelSync) {
    plugin.addCommand({
      id: 'feishu-sync-cancel',
      name: 'Cancel Lark Sync',
      callback: handlers.cancelSync,
    });
  }

  if (handlers.openSettings) {
    plugin.addCommand({
      id: 'feishu-sync-settings',
      name: 'Open Lark Sync settings',
      callback: handlers.openSettings,
    });
  }

  if (handlers.showStatus) {
    plugin.addCommand({
      id: 'feishu-sync-status',
      name: 'Show Lark Sync status',
      callback: handlers.showStatus,
    });
  }
}
