# 飞书同步引擎核心功能

## 目标

实现 Obsidian 到飞书云文档的完整同步引擎，支持增量同步、文件过滤、并发上传和错误重试。

## 需求

### 核心功能

1. **文件扫描与过滤**
   - 扫描 vault 中所有 markdown 文件
   - 根据配置（排除模式/白名单模式）过滤文件
   - 检查文件大小，超过限制的文件跳过或提示

2. **增量检测**
   - 计算本地文件哈希（MD5 或修改时间）
   - 与飞书端文件对比（通过文件名或元数据）
   - 只上传有变化的文件

3. **飞书 API 集成**
   - 创建文件夹结构
   - 上传文件到飞书云文档
   - 处理文件名冲突（重命名策略）
   - 错误处理和重试机制

4. **进度跟踪**
   - 实时显示同步进度（已扫描/已上传/已跳过）
   - 状态栏显示当前状态
   - 同步完成后的摘要报告

5. **并发控制**
   - 支持并发上传（默认 3 个并发）
   - 可配置并发数
   - 避免内存溢出

### 非功能需求

- **性能**：大型 vault（1000+ 文件）在合理时间内完成扫描
- **可靠性**：网络错误自动重试，失败文件记录在日志中
- **用户体验**：后台同步，不阻塞 UI，显示实时进度
- **数据安全**：不上传敏感文件（.obsidian、.trash 等），支持用户自定义过滤

## 验收标准

- [ ] 文件扫描正确识别所有候选文件
- [ ] 排除/白名单模式正确过滤文件
- [ ] 增量检测只上传修改过的文件
- [ ] 文件成功上传到飞书云文档
- [ ] 并发上传配置生效
- [ ] 错误重试机制工作正常
- [ ] 进度显示准确
- [ ] 同步摘要报告完整

## 定义完成

- 代码通过 TypeScript 类型检查
- 单元测试覆盖核心逻辑（文件过滤、哈希计算）
- 集成测试验证飞书 API 调用
- 用户文档说明如何使用同步功能
- 性能测试：1000 文件 vault 在 30 秒内完成扫描

## 技术方案

### 架构

```
SyncCoordinator (协调器)
  ├── FileScanner (文件扫描)
  ├── FileFilter (文件过滤)
  ├── ChangeDetector (变更检测)
  ├── UploadQueue (上传队列)
  │   ├── FileUploader (文件上传器)
  │   └── RetryManager (重试管理)
  ├── ProgressTracker (进度跟踪)
  └── FeishuApiClient (飞书 API 客户端)
```

### 文件组织

```
src/sync/
  ├── coordinator.ts       # 同步协调器
  ├── scanner.ts           # 文件扫描
  ├── filter.ts            # 文件过滤
  ├── change-detector.ts   # 变更检测
  ├── upload-queue.ts      # 上传队列
  ├── file-uploader.ts     # 文件上传
  ├── progress.ts          # 进度跟踪
  └── feishu-api.ts        # 飞书 API 客户端
```

### 关键技术点

1. **哈希计算**：使用文件修改时间 + 大小作为快速哈希
2. **增量检测**：维护本地索引（文件路径 → 飞书文件 token）
3. **并发控制**：使用 p-limit 或自定义队列
4. **Web Worker**：后台执行避免阻塞 UI
5. **错误重试**：指数退避策略

## 范围外

- [ ] 双向同步（飞书 → 本地）
- [ ] 文件删除同步
- [ ] 文件重命名/移动检测
- [ ] 冲突解决策略（高级）
- [ ] 增量备份版本控制

## 技术备注

### 飞书 API 参考

- 上传文件：`POST https://open.feishu.cn/open-apis/drive/v1/files/{folder_token}/media/upload_all`
- 创建文件夹：`POST https://open.feishu.cn/open-apis/drive/v1/files/{folder_token}/children`
- 搜索文件：`GET https://open.feishu.cn/open-apis/drive/v1/files/search`

### 依赖

- `obsidian`: 插件 API
- `crypto-js`: 文件哈希计算（可选）
- `p-limit`: 并发控制

### 相关文件

- `src/utils/contracts.ts`: 配置定义
- `src/utils/path-utils.ts`: 路径工具
- `src/oauth/token-manager.ts`: Token 管理
- `src/main.ts`: 插件入口

## 子任务分解

### PR1: 基础设施和飞书 API 客户端
- 创建 `src/sync/` 目录结构
- 实现 `FeishuApiClient`（上传、创建文件夹、搜索）
- 实现基础的进度跟踪
- 单元测试

### PR2: 文件扫描和过滤
- 实现 `FileScanner`
- 实现 `FileFilter`（排除/白名单模式）
- 实现文件大小检查
- 单元测试

### PR3: 增量检测和上传队列
- 实现 `ChangeDetector`
- 实现 `UploadQueue` 和 `FileUploader`
- 实现并发控制
- 实现错误重试机制
- 单元测试

### PR4: 协调器和集成
- 实现 `SyncCoordinator`
- 集成到 `main.ts`
- 实现后台同步（Web Worker）
- UI 更新和通知
- 端到端测试

### PR5: 文档和优化
- 用户文档
- 性能优化
- 错误处理完善
- 日志和调试工具
