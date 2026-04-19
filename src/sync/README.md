# 同步引擎模块

适用于 Obsidian 插件的文件同步引擎，支持增量上传、进度跟踪和错误恢复。

## 功能特性

### 核心功能
- **文件扫描和变化检测** - 高效扫描本地保险库，基于文件大小和修改时间检测变化
- **异步同步流程** - 在主线程异步执行同步，适用于 Obsidian 插件环境
- **增量上传管理** - 只上传有变化的文件，减少网络流量
- **进度跟踪和通知** - 实时进度更新，详细的同步统计
- **错误处理和恢复** - 自动重试机制，完善的错误处理

### 错误处理
- 网络错误自动重试（可配置重试次数和延迟）
- 文件读取错误处理
- 上传失败文件的记录和提示
- 大文件跳过和提示

### 状态管理
- 同步状态持久化
- 断点续传支持
- 同步历史记录

## 模块结构

```
src/sync/
├── types.ts              # 核心类型定义
├── file-scanner.ts       # 文件扫描和变化检测
├── feishu-client.ts      # 飞书 API 客户端
├── upload-manager.ts     # 文件上传管理
├── state-tracker.ts      # 同步状态跟踪
├── sync-coordinator.ts   # 同步协调器
├── obsidian-adapter.ts   # Obsidian 适配器
├── index.ts              # 模块导出
└── README.md             # 本文档
```

## 快速开始

### 在 Obsidian 插件中使用

```typescript
import {
  SyncCoordinator,
  ObsidianVaultAdapter,
  ObsidianFileReader,
  buildSyncConfig,
  toUiSyncSummary,
} from './sync';

export default class MyPlugin extends Plugin {
  private syncCoordinator: SyncCoordinator | null = null;

  async onload() {
    // 创建适配器
    const vaultAdapter = new ObsidianVaultAdapter(this.app);
    const fileReader = new ObsidianFileReader(this.app);

    // 创建协调器
    this.syncCoordinator = new SyncCoordinator(
      vaultAdapter,
      { verbose: false },
      fileReader
    );

    // 设置事件监听器
    this.syncCoordinator.onProgress((progress) => {
      this.updateStatusBar(progress);
    });

    this.syncCoordinator.onComplete((result) => {
      const summary = toUiSyncSummary(result);
      this.showNotification(summary);
    });

    // 初始化
    await this.syncCoordinator.initialize();
  }

  async startSync() {
    if (!this.syncCoordinator) return;

    const config = buildSyncConfig({
      vaultPath: this.getVaultPath(),
      config: this.settings,
      auth: this.auth,
    });

    await this.syncCoordinator.startSync(config);
  }

  onunload() {
    if (this.syncCoordinator) {
      this.syncCoordinator.destroy();
    }
  }
}
```

### 直接使用组件

```typescript
import { FileScanner } from './sync';
import { FeishuClient } from './sync';
import { UploadManager, NodeFileReader } from './sync';
import { StateTracker } from './sync';

// 创建组件实例
const scanner = new FileScanner();
const client = new FeishuClient(config);
const fileReader = new NodeFileReader();
const manager = new UploadManager(config, client, fileReader);
const tracker = new StateTracker();

// 执行同步
await tracker.load();
const scanResult = await scanner.scanVault(vaultPath, options);
const changedFiles = scanner.detectChanges(scanResult.files, tracker.getAllStates());
await manager.uploadFiles(changedFiles, folderMap, options);
await tracker.save();
```

## API 文档

### SyncCoordinator

#### 构造函数

```typescript
constructor(
  vaultAdapter: VaultAdapter,
  options?: CoordinatorOptions,
  fileReader?: FileReader
)
```

#### 方法

| 方法 | 返回类型 | 描述 |
|------|----------|------|
| `initialize()` | `Promise<void>` | 初始化协调器 |
| `startSync(config)` | `Promise<string>` | 开始同步，返回会话 ID |
| `pauseSync()` | `Promise<void>` | 暂停同步 |
| `resumeSync()` | `Promise<void>` | 恢复同步 |
| `cancelSync()` | `Promise<void>` | 取消同步 |
| `destroy()` | `Promise<void>` | 销毁协调器 |
| `getProgress()` | `SyncProgress` | 获取当前进度 |
| `isSyncing()` | `boolean` | 是否正在同步 |
| `isSyncPaused()` | `boolean` | 是否已暂停 |
| `onProgress(listener)` | `() => void` | 监听进度更新 |
| `onComplete(listener)` | `() => void` | 监听同步完成 |
| `onError(listener)` | `() => void` | 监听错误 |
| `onStatusChange(listener)` | `() => void` | 监听状态变化 |

### SyncConfig

```typescript
interface SyncConfig {
  vaultPath: string;              // 保险库路径
  feishuRootFolderToken: string;  // 飞书根目录 token
  userAccessToken: string;        // 用户访问令牌
  appId: string;                  // 应用 ID
  appSecret: string;              // 应用密钥
  refreshToken: string;           // 刷新令牌
  fileMatchMode: 'exclude' | 'include';  // 文件匹配模式
  matchList: string[];            // 匹配规则列表
  maxDirectUploadMB: number;      // 最大上传文件大小（MB）
  concurrentUploads?: number;     // 并发上传数（默认 3）
  retryAttempts?: number;         // 重试次数（默认 3）
  retryDelay?: number;            // 重试延迟（毫秒，默认 1000）
}
```

### SyncProgress

```typescript
interface SyncProgress {
  status: SyncStatus;             // 当前状态
  currentFile: string | null;     // 当前处理的文件
  processedCount: number;         // 已处理文件数
  totalCount: number;             // 总文件数
  uploadedCount: number;          // 已上传文件数
  skippedCount: number;           // 跳过文件数
  failedCount: number;            // 失败文件数
  percentage: number;             // 进度百分比 (0-100)
  speed: number;                  // 上传速度（字节/秒）
  startTime: number | null;       // 开始时间
  estimatedTimeRemaining: number | null;  // 预估剩余时间（毫秒）
}
```

### SyncResult

```typescript
interface SyncResult {
  success: boolean;               // 是否成功
  error?: string;                 // 错误信息
  filesDiscovered: number;        // 扫描到的文件数
  excludedCount: number;          // 排除的文件数
  oversizedCount: number;         // 超大文件数
  candidateCount: number;         // 候选上传文件数
  uploadedCount: number;          // 实际上传文件数
  skippedCount: number;           // 跳过未变化文件数
  failedCount: number;            // 失败文件数
  failedFiles: Array<{            // 失败文件列表
    path: string;
    error: string;
  }>;
  totalBytesUploaded: number;     // 总上传字节数
  duration: number;               // 总耗时（毫秒）
}
```

## 性能优化

- 并发上传控制，避免 API 限流
- 内存管理，大文件处理优化
- 变化检测，只上传有变化的文件
- 异步操作避免阻塞 UI

## 注意事项

1. **文件大小限制**：超过 `maxDirectUploadMB` 的文件会被跳过
2. **状态持久化**：`state.json` 文件保存同步状态，不应手动修改
3. **网络请求**：所有飞书 API 请求都会自动重试（可配置次数）
4. **路径规范**：所有相对路径都使用 `/` 作为分隔符（跨平台兼容）
5. **主线程运行**：同步在主线程异步执行，长时间操作不会阻塞 UI
