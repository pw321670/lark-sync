import type { RemoteFileRef, FileState, SyncStateMap } from './types';

export interface StateStore {
  load(): Promise<SyncStateMap>;
  save(state: SyncStateMap): Promise<void>;
}

class MemoryStateStore implements StateStore {
  private state: SyncStateMap = {};

  async load(): Promise<SyncStateMap> {
    return { ...this.state };
  }

  async save(state: SyncStateMap): Promise<void> {
    this.state = { ...state };
  }
}

export interface StateTrackerOptions {
  store?: StateStore;
}

export class StateTracker {
  private readonly store: StateStore;
  private state: SyncStateMap = {};
  private dirty = false;

  constructor(options: StateTrackerOptions = {}) {
    this.store = options.store ?? new MemoryStateStore();
  }

  async load(): Promise<void> {
    this.state = await this.store.load();
    this.dirty = false;
  }

  async save(): Promise<void> {
    if (!this.dirty) {
      return;
    }

    await this.store.save(this.state);
    this.dirty = false;
  }

  getFileState(relPath: string): FileState | undefined {
    return this.state[relPath];
  }

  updateFileStates(
    entries: Array<{ relPath: string; size: number; mtimeMs: number; remote?: RemoteFileRef }>,
  ): void {
    const uploadedAt = new Date().toISOString();

    for (const entry of entries) {
      this.state[entry.relPath] = {
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        uploadedAt,
        remote: entry.remote,
      };
    }

    this.dirty = entries.length > 0;
  }

  clear(): void {
    this.state = {};
    this.dirty = true;
  }
}
