# 飞书同步功能使用指南

## 🎉 恭喜！同步引擎已实现完成

通过多智能体并行开发，以下功能已全部实现：

### ✅ 已实现的功能

1. **飞书 API 客户端** (`src/sync/feishu-api.ts`)
   - 文件上传（支持大文件分块上传）
   - 创建文件夹
   - 搜索文件
   - 列出文件夹内容
   - 删除文件

2. **文件扫描器** (`src/sync/scanner.ts`)
   - 扫描所有 markdown 文件
   - 获取文件元数据（大小、修改时间）
   - 快速文件查询

3. **文件过滤器** (`src/sync/filter.ts`)
   - 排除模式：同步所有文件，除了排除列表
   - 白名单模式：只同步指定文件
   - 文件大小限制检查
   - Glob 模式匹配

4. **进度跟踪器** (`src/sync/progress.ts`)
   - 实时进度显示
   - 计算速度和剩余时间
   - 事件监听

5. **同步协调器** (`src/sync/sync-coordinator.ts`)
   - 编排完整同步流程
   - 并发控制（默认 3 个并发上传）
   - 错误处理和重试
   - 暂停/恢复/取消功能

## 📋 使用步骤

### 1. 配置飞书应用

在插件设置中填写：

1. **飞书应用配置**
   - Feishu Root Folder Token: 飞书云文档中的文件夹 token
   - App ID: 飞书应用的 App ID
   - App Secret: 飞书应用的 App Secret
   - Redirect URI: 默认 `http://127.0.0.1:3333/callback`

2. **同步策略**
   - File Match Mode: 选择 "exclude"（排除模式）或 "include"（白名单模式）
   - Exclude/Include List: 配置文件列表（支持 glob 模式）
   - Max Direct Upload (MB): 单文件最大大小（默认 20MB）

3. **高级配置**
   - Concurrent Uploads: 并发上传数（默认 3）
   - Retry Attempts: 失败重试次数（默认 3）
   - Retry Delay (ms): 重试延迟（默认 1000ms）

### 2. 获取飞书文件夹 Token

1. 登录飞书云文档：https://.feishu.cn/drive/home
2. 打开要用作同步目标的文件夹
3. 从 URL 中复制 folder token：

   ```
   URL 示例: https://feishu.cn/drive/folder/fxlcn*********
   Token: fxlcn*********
   ```

### 3. 完成授权

1. 点击设置中的 **"测试连接"** 按钮
2. 浏览器会打开飞书授权页面
3. 同意授权
4. 看到"授权成功"提示

### 4. 开始同步

有两种方式启动同步：

#### 方式 1: 点击白云按钮
- 在左侧边栏找到云朵图标按钮
- 点击即可开始同步

#### 方式 2: 使用命令
1. 按 `Ctrl+P` (或 `Cmd+P`)
2. 输入 "Feishu sync: start"
3. 按回车执行

### 5. 查看同步状态

同步过程中：
- **状态栏**：显示当前状态（"同步中..."）
- **白云按钮**：显示加载图标
- **通知**：显示进度更新

同步完成后：
- 查看通知中的同步摘要
- 包括：扫描文件数、上传数、跳过数、失败数

## 🔧 配置示例

### 排除模式（推荐）

同步所有文件，除了排除列表：

```json
{
  "fileMatchMode": "exclude",
  "exclude": [
    ".trash",
    ".obsidian/workspace.json",
    ".obsidian/workspaces.json",
    "node_modules/**",
    "*.tmp"
  ],
  "maxDirectUploadMB": 20
}
```

### 白名单模式

只同步指定文件：

```json
{
  "fileMatchMode": "include",
  "exclude": [
    "Documents/**/*.md",
    "Notes/**/*.md",
    "!**/private/**"
  ],
  "maxDirectUploadMB": 20
}
```

**注意**：白名单模式中，`!` 前缀表示排除。

## 🚀 高级功能

### 暂停/恢复同步

1. **暂停**
   - 命令: "Feishu sync: pause"
   - 当前文件上传完成后暂停

2. **恢复**
   - 命令: "Feishu sync: resume"
   - 从暂停位置继续

3. **取消**
   - 命令: "Feishu sync: cancel"
   - 立即停止同步

### 查看同步摘要

1. **查看上次同步**
   - 命令: "Show last Feishu sync summary"
   - 显示详细统计信息

2. **预览同步范围**
   - 命令: "Preview Feishu sync scope"
   - 不实际上传，只扫描和统计

## 🛡️ 安全说明

### 不会上传的文件（默认排除）

- `.trash/` - 回收站
- `.obsidian/workspace.json` - 工作区配置
- `.obsidian/workspaces.json` - 多工作区配置

### 文件大小限制

- 默认最大 20MB
- 超过限制的文件会被跳过
- 可在设置中调整

## 🐛 故障排除

### 问题：授权失败

**解决**：
1. 确认飞书应用配置正确
2. 检查 Redirect URI: `http://127.0.0.1:3333/callback`
3. 确保 App ID 和 App Secret 正确

### 问题：上传失败

**可能原因**：
1. 网络问题 - 会自动重试
2. 文件过大 - 调整 `maxDirectUploadMB`
3. 飞书 API 错误 - 查看控制台日志

**解决方法**：
1. 打开开发者控制台（`Ctrl+Shift+I`）
2. 查看 Console 标签中的错误信息
3. 调整配置后重试

### 问题：同步速度慢

**优化建议**：
1. 增加并发数：`Concurrent Uploads: 5`
2. 减少重试次数：`Retry Attempts: 2`
3. 检查网络连接

## 📊 技术架构

```
SyncCoordinator (协调器)
  ├── VaultScanner (扫描文件)
  ├── FileFilter (过滤文件)
  ├── ChangeDetector (检测变更)
  ├── UploadManager (上传队列)
  │   ├── FeishuClient (飞书 API)
  │   └── 并发控制 (3 并发)
  ├── StateTracker (状态跟踪)
  └── ProgressTracker (进度报告)
```

## 🔗 相关文件

- `src/sync/feishu-api.ts` - 飞书 API 客户端
- `src/sync/scanner.ts` - 文件扫描器
- `src/sync/filter.ts` - 文件过滤器
- `src/sync/progress.ts` - 进度跟踪器
- `src/sync/sync-coordinator.ts` - 同步协调器
- `src/main.ts` - 插件入口（集成协调器）

## 🎯 下一步计划

未来可能的功能：
- [ ] 双向同步（飞书 → 本地）
- [ ] 文件删除同步
- [ ] 冲突解决策略
- [ ] 增量备份和版本控制
- [ ] 定时自动同步

---

**享受同步吧！** 🎉
