import type { Plugin } from 'obsidian';

import type { SyncProgress } from '../sync/types';
import type { SyncSummary as StoredSyncSummary } from '../utils/contracts';

export class SyncStatusBar {
  private readonly statusBarEl: HTMLElement;

  constructor(plugin: Plugin) {
    this.statusBarEl = plugin.addStatusBarItem();
    this.statusBarEl.addClass('lark-sync-status');
    this.setIdle();
  }

  setIdle(): void {
    this.setContent('Lark Sync: idle');
  }

  setStarting(): void {
    this.setContent('Lark Sync: starting...');
  }

  setBlocked(message: string): void {
    this.setContent(`Lark Sync: blocked | ${message}`, message);
  }

  setCancelled(): void {
    this.setContent('Lark Sync: cancelled');
  }

  setProgress(progress: SyncProgress): void {
    const titleParts: string[] = [];
    if (progress.currentPath) {
      titleParts.push(progress.currentPath);
    }

    if (progress.phase === 'scanning') {
      this.setContent('Lark Sync: scanning vault...', titleParts[0]);
      return;
    }

    const statusParts = [this.formatPhase(progress), this.formatCounts(progress)];
    const resultCounts = this.formatResultCounts(progress);
    if (resultCounts) {
      statusParts.push(resultCounts);
    }

    if (progress.phase === 'cooldown') {
      statusParts.push(
        this.formatCooldown(progress.cooldownRemainingMs, progress.cooldownReason),
      );
    }

    const title = titleParts.length > 0 ? titleParts.join(' | ') : statusParts.join(' | ');
    this.setContent(`Lark Sync: ${statusParts.join(' | ')}`, title);
  }

  setSummary(summary: StoredSyncSummary | null): void {
    if (!summary) {
      this.setIdle();
      return;
    }

    if (summary.status === 'preview') {
      this.setContent(
        `Lark Sync: preview | ${summary.candidateCount} candidate(s)`,
        summary.message,
      );
      return;
    }

    if (summary.status === 'blocked') {
      this.setBlocked(summary.message);
      return;
    }

    this.setContent(`Lark Sync: ${summary.message}`, summary.message);
  }

  destroy(): void {
    this.statusBarEl.remove();
  }

  private formatPhase(progress: SyncProgress): string {
    const laneLabel = this.formatLane(progress);

    if (progress.phase === 'ensuring-folders') {
      return 'ensuring folders';
    }

    if (progress.phase === 'writing-state') {
      return 'writing state';
    }

    if (progress.phase === 'completed') {
      return 'completed';
    }

    if (progress.phase === 'cooldown') {
      return laneLabel ? `${laneLabel} cooling down` : 'cooling down';
    }

    if (progress.phase === 'uploading') {
      return laneLabel ? `${laneLabel} uploading` : 'uploading';
    }

    return progress.phase;
  }

  private formatLane(progress: SyncProgress): string {
    if (!progress.channel) {
      return '';
    }

    const channelLabel = progress.channel === 'documents' ? 'docs' : 'files';
    if (!progress.batchIndex || !progress.batchCount) {
      return channelLabel;
    }

    return `${channelLabel} ${progress.batchIndex}/${progress.batchCount}`;
  }

  private formatCounts(progress: SyncProgress): string {
    return `${progress.processedCount}/${progress.totalCount} files`;
  }

  private formatResultCounts(progress: SyncProgress): string {
    const parts = [`${progress.uploadedCount} uploaded`, `${progress.skippedCount} skipped`];

    if (progress.failedCount > 0) {
      parts.push(`${progress.failedCount} failed`);
    }

    return parts.join(' | ');
  }

  private formatCooldown(
    cooldownRemainingMs?: number,
    cooldownReason: 'batch' | 'rate-limit' = 'batch',
  ): string {
    if (!cooldownRemainingMs || cooldownRemainingMs <= 0) {
      return cooldownReason === 'rate-limit' ? 'rate limited' : 'cooling down';
    }

    if (cooldownReason === 'rate-limit') {
      return `rate limited, retry in ${Math.ceil(cooldownRemainingMs / 1000)}s`;
    }

    return `next batch in ${Math.ceil(cooldownRemainingMs / 1000)}s`;
  }

  private setContent(text: string, title?: string): void {
    this.statusBarEl.textContent = text;
    this.statusBarEl.setAttribute('aria-label', title || text);
    this.statusBarEl.title = title || text;
  }
}
