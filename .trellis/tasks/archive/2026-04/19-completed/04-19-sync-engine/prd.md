# 同步引擎模块

## Goal

实现基于 Web Worker 的后台文件同步引擎，支持增量上传、进度跟踪和错误恢复，提供流畅的用户体验。

## Requirements

### 核心同步功能

- **文件扫描和变化检测**
  - 扫描本地保险库文件系统
  - 基于文件大小和修改时间的变化检测
  - 支持排除规则和文件大小限制

- **Web Worker 后台同步**
  - 在独立线程中执行同步操作
  - 完全不阻塞主线程，界面保持流畅
  - 支持大文件和长时间同步操作

- **增量上传管理**
  - 只上传有变化的文件
  - 支持文件覆盖和冲突处理
  - 维护同步状态和文件映射

- **进度跟踪和通知**
  - 实时进度更新（当前文件、进度百分比）
  - 详细的同步统计（上传数、跳过数、失败数）
  - 同步完成后的通知摘要

### 错误处理和恢复

- **网络错误处理**
  - 自动重试机制（可配置重试次数和延迟）
  - 网络超时处理
  - 连接失败提示

- **文件错误处理**
  - 文件读取错误处理
  - 上传失败文件的记录和提示
  - 大文件跳过和提示

- **同步状态管理**
  - 同步状态持久化
  - 断点续传支持
  - 同步历史记录

## Acceptance Criteria

* [ ] Web Worker 在独立线程中执行同步，不阻塞主线程
* [ ] 实时显示同步进度（当前文件、进度百分比、速度）
* [ ] 支持暂停/恢复/取消同步操作
* [ ] 正确处理文件变化检测和增量上传
* [ ] 同步完成后发送详细通知（成功/失败/部分成功）
* [ ] 网络错误时自动重试，达到重试上限后提示用户
* [ ] 大文件超限时跳过并记录
* [ ] 维护同步状态，支持断点续传
* [ ] 提供详细的同步日志和错误信息

## Technical Approach

### 模块结构

```
src/sync/
├── sync-coordinator.ts    # 同步协调器（主线程）
├── file-scanner.ts        # 文件扫描和变化检测
├── upload-manager.ts      # 文件上传管理
└── state-tracker.ts       # 同步状态跟踪

src/workers/
└── sync-worker.ts         # Web Worker 实现
```

### 核心接口

```typescript
// 主线程与 Worker 通信协议
interface WorkerCommand {
  type: 'start-sync' | 'pause-sync' | 'resume-sync' | 'cancel-sync' | 'check-status';
  config?: SyncConfig;
}

interface WorkerMessage {
  type: 'sync-progress' | 'sync-complete' | 'sync-error' | 'sync-status';
  data?: ProgressData | SyncResult | ErrorInfo | SyncStatus;
}

interface SyncConfig {
  vaultPath: string;
  feishuRootFolderToken: string;
  userAccessToken: string;
  exclude: string[];
  maxDirectUploadMB: number;
}

interface ProgressData {
  currentFile: string;
  processedCount: number;
  totalCount: number;
  uploadedCount: number;
  skippedCount: number;
  percentage: number;
  speed: string; // "1.2 MB/s"
}
```

### 实现策略

1. **复用现有逻辑**：参考 `legacy/sync.js` 的核心实现
2. **Web Worker 架构**：将同步逻辑迁移到 Worker 中
3. **渐进式实现**：先实现基础版本，确保功能正确性，再优化性能
4. **错误恢复**：完善的错误处理和重试机制

## Implementation Plan

1. **创建同步协调器**：管理主线程与 Worker 的通信
2. **实现 Web Worker**：将同步逻辑迁移到独立线程
3. **文件扫描模块**：高效的文件系统扫描和变化检测
4. **上传管理器**：文件上传的批处理和并发控制
5. **状态跟踪器**：同步状态持久化和恢复
6. **进度反馈**：实时进度更新和通知
7. **错误处理**：重试机制和错误恢复
8. **性能优化**：并发控制、内存管理、速度优化

## Out of Scope

* 文件内容哈希（基于时间戳和大小）
* 高级冲突解决策略
* 增量同步（仅同步文件变化部分）
* 分布式同步（多设备同时编辑）

## Technical Notes

### 参考实现

* `legacy/sync.js` - 现有的同步脚本，包含完整的同步逻辑
* 飞书开放平台 API 文档：https://open.feishu.cn/document/server-docs/docs/docs/doc

### 关键技术点

* Web Worker API 和线程间通信
* 文件系统遍历和变化检测
* HTTP 请求并发控制
* 进度跟踪和状态管理

### 性能优化

* 并发上传控制（避免 API 限流）
* 内存管理（大文件处理）
* 进度更新频率控制（避免主线程过载）

### 依赖关系

* 依赖：OAuth 模块（提供 access_token）
* 依赖：配置模块（提供同步配置）
* 被依赖：UI 组件模块（显示进度）

### 开发优先级

**P0（核心功能）**：
- Web Worker 基础架构
- 文件扫描和上传逻辑
- 主线程与 Worker 通信

**P1（重要功能）**：
- 进度跟踪和实时更新
- 错误处理和重试机制
- 同步状态持久化

**P2（增强功能）**：
- 暂停/恢复/取消功能
- 性能优化和并发控制
- 详细的同步日志

### 渐进式实现策略

**阶段1：基础异步版本**
- 先在主线程实现异步版本
- 验证同步逻辑的正确性
- 确保与现有代码的兼容性

**阶段2：Web Worker 迁移**
- 将同步逻辑迁移到 Worker
- 保持接口不变，确保兼容性
- 优化错误处理和进度反馈

**阶段3：性能优化**
- 并发控制
- 内存管理
- 速度优化