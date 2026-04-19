/**
 * 状态跟踪器 - 管理同步状态的持久化和恢复
 */

import type { FileState, SyncStateMap, SyncResult } from './types';

// ============================================================================
// 内存状态存储（用于 Obsidian 插件环境）
// ============================================================================

class MemoryStateStore implements StateStore {
  private state: SyncStateMap = {};

  async load(): Promise<SyncStateMap> {
    return { ...this.state };
  }

  async save(state: SyncStateMap): Promise<void> {
    this.state = { ...state };
  }
}

// ============================================================================
// 状态存储接口
// ============================================================================

export interface StateStore {
  load(): Promise<SyncStateMap>;
  save(state: SyncStateMap): Promise<void>;
}

// ============================================================================
// 文件系统状态存储
// ============================================================================

export interface FileSystemStoreConfig {
  /** 状态文件路径 */
  statePath: string;
}

class FileStateStore implements StateStore {
  constructor(private config: FileSystemStoreConfig) {}

  async load(): Promise<SyncStateMap> {
    const fs = await import('fs');

    try {
      const content = await fs.promises.readFile(this.config.statePath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        // 文件不存在，返回空状态
        return {};
      }
      throw error;
    }
  }

  async save(state: SyncStateMap): Promise<void> {
    const fs = await import('fs');
    await fs.promises.writeFile(
      this.config.statePath,
      JSON.stringify(state, null, 2),
      'utf-8'
    );
  }
}

// ============================================================================
// 状态跟踪器
// ============================================================================

export interface StateTrackerOptions {
  /** 状态存储 */
  store?: StateStore;
  /** 自动保存间隔（毫秒） */
  autoSaveInterval?: number;
}

export class StateTracker {
  private store: StateStore;
  private state: SyncStateMap;
  private dirty: boolean;
  private autoSaveInterval: number | null;
  private autoSaveTimer: ReturnType<typeof setInterval> | null;

  constructor(options: StateTrackerOptions = {}) {
    // 默认使用内存存储（Obsidian 环境不支持 fs）
    this.store = options.store || new MemoryStateStore();
    this.state = {};
    this.dirty = false;
    this.autoSaveInterval = options.autoSaveInterval ?? null;
    this.autoSaveTimer = null;
  }

  /**
   * 加载状态
   */
  async load(): Promise<void> {
    this.state = await this.store.load();
    this.dirty = false;
  }

  /**
   * 保存状态
   */
  async save(): Promise<void> {
    if (!this.dirty) {
      return;
    }

    await this.store.save(this.state);
    this.dirty = false;
  }

  /**
   * 启动自动保存
   */
  startAutoSave(): void {
    if (this.autoSaveInterval === null || this.autoSaveTimer !== null) {
      return;
    }

    this.autoSaveTimer = setInterval(async () => {
      await this.save();
    }, this.autoSaveInterval);
  }

  /**
   * 停止自动保存
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * 获取文件状态
   */
  getFileState(relPath: string): FileState | undefined {
    return this.state[relPath];
  }

  /**
   * 更新文件状态
   */
  updateFileState(relPath: string, size: number, mtimeMs: number): void {
    this.state[relPath] = {
      size,
      mtimeMs,
      uploadedAt: new Date().toISOString(),
    };
    this.dirty = true;
  }

  /**
   * 批量更新文件状态
   */
  updateFileStates(entries: Array<{ relPath: string; size: number; mtimeMs: number }>): void {
    for (const entry of entries) {
      this.state[entry.relPath] = {
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        uploadedAt: new Date().toISOString(),
      };
    }
    this.dirty = true;
  }

  /**
   * 删除文件状态
   */
  deleteFileState(relPath: string): void {
    delete this.state[relPath];
    this.dirty = true;
  }

  /**
   * 获取所有状态
   */
  getAllStates(): SyncStateMap {
    return { ...this.state };
  }

  /**
   * 清空所有状态
   */
  clear(): void {
    this.state = {};
    this.dirty = true;
  }

  /**
   * 获取状态数量
   */
  size(): number {
    return Object.keys(this.state).length;
  }

  /**
   * 检查是否有未保存的更改
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * 清理不再存在的文件状态
   */
  async cleanup(existingPaths: string[]): Promise<void> {
    const toDelete: string[] = [];

    for (const path in this.state) {
      if (!existingPaths.includes(path)) {
        toDelete.push(path);
      }
    }

    for (const path of toDelete) {
      delete this.state[path];
    }

    if (toDelete.length > 0) {
      this.dirty = true;
    }
  }
}

// ============================================================================
// 同步会话状态
// ============================================================================

export interface SyncSessionState {
  /** 会话 ID */
  sessionId: string;
  /** 开始时间 */
  startTime: number;
  /** 当前状态 */
  status: 'running' | 'paused' | 'completed' | 'cancelled' | 'error';
  /** 总文件数 */
  totalFiles: number;
  /** 已处理文件数 */
  processedFiles: number;
  /** 已上传文件数 */
  uploadedFiles: number;
  /** 失败文件数 */
  failedFiles: number;
  /** 最后结果 */
  lastResult?: SyncResult;
  /** 错误信息 */
  error?: string;
}

const DEFAULT_SESSION_STATE: Omit<SyncSessionState, 'sessionId' | 'startTime'> = {
  status: 'running',
  totalFiles: 0,
  processedFiles: 0,
  uploadedFiles: 0,
  failedFiles: 0,
};

/**
 * 同步会话管理器
 */
export class SessionManager {
  private currentSession: SyncSessionState | null = null;
  private sessionHistory: SyncSessionState[] = [];

  /**
   * 创建新会话
   */
  createSession(totalFiles: number): string {
    const sessionId = this.generateSessionId();

    this.currentSession = {
      sessionId,
      startTime: Date.now(),
      ...DEFAULT_SESSION_STATE,
      totalFiles,
    };

    return sessionId;
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): SyncSessionState | null {
    return this.currentSession;
  }

  /**
   * 更新会话进度
   */
  updateProgress(processed: number, uploaded: number, failed: number): void {
    if (!this.currentSession) {
      return;
    }

    this.currentSession.processedFiles = processed;
    this.currentSession.uploadedFiles = uploaded;
    this.currentSession.failedFiles = failed;
  }

  /**
   * 完成会话
   */
  completeSession(result: SyncResult): void {
    if (!this.currentSession) {
      return;
    }

    this.currentSession.status = result.success ? 'completed' : 'error';
    this.currentSession.lastResult = result;
    this.currentSession.error = result.error;

    // 保存到历史记录
    this.sessionHistory.push({ ...this.currentSession });

    // 清除当前会话
    this.currentSession = null;
  }

  /**
   * 取消会话
   */
  cancelSession(): void {
    if (!this.currentSession) {
      return;
    }

    this.currentSession.status = 'cancelled';

    // 保存到历史记录
    this.sessionHistory.push({ ...this.currentSession });

    // 清除当前会话
    this.currentSession = null;
  }

  /**
   * 获取会话历史
   */
  getSessionHistory(): SyncSessionState[] {
    return [...this.sessionHistory];
  }

  /**
   * 清空历史记录
   */
  clearHistory(): void {
    this.sessionHistory = [];
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `sync-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
