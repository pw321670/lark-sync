import { Notice } from 'obsidian';

export interface SyncSummary {
  status: 'success' | 'failed' | 'partial';
  startTime?: number;
  endTime?: number;
  filesScanned: number;
  uploadedCount: number;
  skippedCount: number;
  failedCount: number;
  firstFailedPath?: string;
  errorMessage?: string;
}

export class NotificationManager {
  info(message: string, duration = 5000): Notice {
    return new Notice(message, duration);
  }

  warning(message: string, duration = 6000): Notice {
    return new Notice(`Warning: ${message}`, duration);
  }

  error(message: string, duration = 8000): Notice {
    return new Notice(`Error: ${message}`, duration);
  }

  syncStarted(): Notice {
    return this.info('Starting sync to Feishu...', 3000);
  }

  syncCompleted(summary: SyncSummary): Notice {
    const parts: string[] = [];

    if (summary.uploadedCount > 0) {
      parts.push(`${summary.uploadedCount} uploaded`);
    }

    if (summary.skippedCount > 0) {
      parts.push(`${summary.skippedCount} skipped`);
    }

    if (summary.failedCount > 0) {
      parts.push(`${summary.failedCount} failed`);
    }

    if (parts.length === 0) {
      parts.push('No files changed');
    }

    if (summary.firstFailedPath) {
      parts.push(`first failure: ${summary.firstFailedPath}`);
    }

    if (summary.errorMessage) {
      parts.push(summary.errorMessage);
    }

    if (summary.status === 'failed') {
      return this.error(parts.join(' | '), 10000);
    }

    if (summary.status === 'partial') {
      return this.warning(parts.join(' | '), 10000);
    }

    return this.info(parts.join(' | '), 6000);
  }

  needsConfiguration(missingFields: string[]): Notice {
    return this.warning(`Missing required settings: ${missingFields.join(', ')}`, 8000);
  }

  needsAuthorization(): Notice {
    return this.warning('Please authorize with Feishu first.', 6000);
  }

  syncCancelled(): Notice {
    return this.info('Sync cancelled.', 3000);
  }

  concurrentSyncBlocked(): Notice {
    return this.warning('A sync is already in progress.', 5000);
  }
}
