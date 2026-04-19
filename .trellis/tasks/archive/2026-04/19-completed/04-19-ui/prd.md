# UI 组件模块

## Goal

实现用户友好的同步控制界面，包括左侧边栏同步按钮、进度显示组件和通知管理器，提供流畅的用户体验。

## Requirements

### 左侧边栏同步按钮

- **Ribbon 图标**
  - 在 Obsidian 左侧边栏添加同步图标
  - 图标显示当前同步状态（空闲/同步中/成功/失败）
  - 支持点击触发同步
  - 鼠标悬停显示当前状态和提示

- **状态图标设计**
  - ☁️ 空闲状态
  - 🔄 同步中
  - ✅ 同步成功
  - ❌ 同步失败
  - ⚠️ 需要配置或授权

### 可配置快捷键

- **命令注册**
  - 注册"开始同步"命令到 Obsidian 命令面板
  - 支持用户在快捷键设置中配置
  - 提供多个同步相关命令（开始/暂停/恢复/取消）

- **命令列表**
  - 开始同步
  - 暂停同步
  - 恢复同步
  - 取消同步
  - 打开飞书同步设置
  - 显示同步状态

### 进度显示组件

- **实时进度显示**
  - 当前同步文件名
  - 进度百分比
  - 上传速度
  - 剩余时间估算
  - 已上传/跳过/失败文件数

- **显示方式**
  - 状态栏文本（简洁版）
  - 弹窗进度条（详细版）
  - 通知摘要（完成时）

### 通知管理器

- **同步通知**
  - 同步开始通知
  - 同步完成摘要（成功/失败/部分成功）
  - 同步失败详细错误信息
  - 重要状态变化提醒

- **通知级别**
  - info：同步开始、完成
  - warning：部分失败、需要关注
  - error：同步失败、配置错误

## Acceptance Criteria

* [ ] 左侧边栏显示同步图标，图标反映当前状态
* [ ] 点击图标可以触发同步，同步中图标显示动画
* [ ] 支持 Obsidian 快捷键配置，用户可以自定义同步快捷键
* [ ] 同步过程中显示实时进度（当前文件、进度百分比、速度）
* [ ] 同步完成后发送通知，显示详细摘要
* [ ] 同步失败时发送错误通知，提供恢复建议
* [ ] 进度显示不阻塞用户操作，可以最小化或关闭
* [ ] 通知内容清晰明确，包含关键信息和操作建议

## Technical Approach

### 模块结构

```
src/ui/
├── sync-button.ts         # 同步按钮组件
├── progress-display.ts    # 进度显示组件
└── notification-manager.ts # 通知管理器
```

### 核心接口

```typescript
interface SyncButtonState {
  status: 'idle' | 'syncing' | 'success' | 'error' | 'warning';
  enabled: boolean;
  tooltip: string;
}

interface ProgressData {
  currentFile: string;
  percentage: number;
  speed: string;
  uploadedCount: number;
  skippedCount: number;
  failedCount: number;
  estimatedTimeRemaining: string;
}

interface NotificationConfig {
  level: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  duration?: number; // 毫秒，0 表示不自动关闭
  actions?: NotificationAction[];
}
```

### 实现策略

1. **Ribbon 图标**：使用 Obsidian 的 `addRibbonIcon()` API
2. **命令注册**：使用 `addCommand()` API 创建可配置快捷键的命令
3. **进度显示**：创建模态对话框或悬浮组件显示进度
4. **通知管理**：使用 Obsidian 的 Notice API，封装为通知管理器

## Implementation Plan

1. **同步按钮组件**：实现 Ribbon 图标和状态管理
2. **命令注册**：注册所有同步相关命令
3. **进度显示组件**：创建进度对话框或悬浮组件
4. **通知管理器**：封装通知逻辑，提供统一接口
5. **与同步引擎集成**：接收同步引擎的进度消息
6. **用户体验优化**：动画、提示、快捷操作

## Out of Scope

* 自定义图标设计（使用 Emoji 或简单图标）
* 高级进度可视化（图表、统计图）
* 通知历史记录
- 自定义通知样式（使用 Obsidian 默认样式）

## Technical Notes

### Obsidian API 参考

* `addRibbonIcon()` - 添加左侧边栏图标
* `addCommand()` - 注册命令和快捷键
* `Notice` - 显示通知
* `Modal` - 创建模态对话框

### 设计参考

* Obsidian 内置插件的 UI 设计
* 其他同步插件的 UI 设计（如 Remotely Save）
* Material Design 规范

### 关键技术点

* Obsidian UI 组件的使用
* 状态管理和 UI 更新
* 事件处理和用户交互
* 动画和视觉反馈

### 依赖关系

* 依赖：同步引擎模块（接收同步状态和进度）
* 依赖：OAuth 模块（接收授权状态）
* 依赖：配置模块（读取配置）

### 开发优先级

**P0（核心功能）**：
- Ribbon 同步按钮
- 基本命令注册（开始同步）
- 简单进度显示
- 基础通知功能

**P1（重要功能）**：
- 完整命令列表
- 详细进度显示
- 通知管理器
- 状态图标和动画

**P2（增强功能）**：
- 高级进度可视化
- 快捷操作
- 自定义通知样式
- 通知历史记录

### UI/UX 考虑

* **简洁性**：不要过度复杂化界面
* **直观性**：用户可以快速理解当前状态
* **反馈性**：每个操作都有明确的反馈
* **一致性**：与 Obsidian 的设计风格保持一致
* **可访问性**：支持键盘操作和屏幕阅读器