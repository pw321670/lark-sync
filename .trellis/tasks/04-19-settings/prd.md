# 设置界面模块

## Goal

扩展现有设置界面，提供完整的核心功能配置选项，支持配置验证、导入导出和用户体验优化。

## Requirements

### 核心功能配置

- **飞书应用配置**
  - App ID 和 App Secret 输入（密码形式）
  - 根目录 Token 配置
  - OAuth 回调 URI 配置
  - 配置验证功能（测试连接）

- **同步策略配置**
  - 文件排除规则（支持多行输入和通配符）
  - 文件大小限制配置
  - 同步模式选择（手动/自动/定时）

- **高级配置**
  - 并发上传数量控制
  - 重试策略配置
  - 日志级别设置

### 用户体验优化

- **配置验证**
  - "测试连接"功能，验证飞书 API 连接
  - 实时配置验证，检查必填项
  - 错误提示和修复建议

- **配置管理**
  - 导出配置（JSON 格式）
  - 导入配置（支持验证和覆盖确认）
  - 恢复默认配置
  - 配置版本管理

### 界面设计要求

- 整洁清晰，符合 Obsidian Material Design 规范
- 分组合理，相关配置项集中显示
- 提供配置说明和帮助提示
- 响应式设计，适配不同屏幕尺寸

## Acceptance Criteria

* [ ] 设置界面包含所有核心功能配置项
* [ ] 配置项分组合理，界面整洁清晰
* [ ] 提供"测试连接"功能，验证飞书 API 连接
* [ ] 支持配置导入/导出，便于备份和迁移
* [ ] 提供"恢复默认配置"功能
* [ ] 实时配置验证，检查必填项和格式
* [ ] App Secret 以密码形式显示，支持切换显示/隐藏
* [ ] 文件排除规则支持多行输入，提供使用说明
* [ ] 所有配置项提供清晰的说明和提示

## Technical Approach

### 模块结构

```
src/settings.ts (扩展)
├── 飞书应用配置组
├── 同步策略配置组
├── 高级配置组
└── 配置管理功能（导入/导出/验证）
```

### 配置数据结构

```typescript
interface ExtendedPluginConfig {
  // 飞书应用配置
  appId: string;
  appSecret: string;
  feishuRootFolderToken: string;
  redirectUri: string;

  // 同步策略
  exclude: string[];
  maxDirectUploadMB: number;
  syncMode: 'manual' | 'auto' | 'scheduled';
  scheduledSyncInterval: number; // 分钟

  // 高级配置
  concurrentUploads: number;
  retryAttempts: number;
  retryDelay: number; // 毫秒
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}
```

### 实现策略

1. **扩展现有设置界面**：在 `src/settings.ts` 基础上添加新配置项
2. **配置分组**：使用 Setting 组件的 heading 功能分组
3. **验证逻辑**：创建配置验证器，检查必填项和格式
4. **导入导出**：使用 Blob 和 FileReader API
5. **UI 反馈**：使用 Notice API 提供操作反馈

## Implementation Plan

1. **扩展配置数据结构**：添加新的配置项
2. **创建配置验证器**：验证配置完整性和正确性
3. **实现飞书应用配置组**：App ID、Secret、Token 等
4. **实现同步策略配置组**：排除规则、文件大小等
5. **实现高级配置组**：并发、重试、日志等
6. **添加配置管理功能**：导入、导出、恢复默认
7. **实现测试连接功能**：验证飞书 API 连接
8. **优化界面布局**：分组、说明、提示

## Out of Scope

* 配置文件加密（依赖 Obsidian 的数据存储）
* 云端配置同步（依赖 OneDrive）
* 配置模板和预设
* 高级配置的详细说明文档

## Technical Notes

### 现有代码

* `src/settings.ts` - 现有设置界面，包含基础配置项
* `src/utils/contracts.ts` - 现有数据类型定义

### 设计参考

* Obsidian 内置插件的设置界面设计
* Material Design 规范
* 其他 Obsidian 同步插件的设置界面

### 关键技术点

* Obsidian Setting 组件的使用
* 表单验证和错误处理
* 文件导入导出（File API）
* 异步操作的 UI 反馈

### 依赖关系

* 依赖：数据类型定义模块（contracts.ts）
* 被依赖：所有需要配置的模块（OAuth、同步引擎）

### 开发优先级

**P0（核心功能）**：
- 扩展核心配置项（飞书应用配置）
- 配置验证和错误提示
- 测试连接功能

**P1（重要功能）**：
- 同步策略配置
- 配置导入导出
- 界面优化和说明

**P2（增强功能）**：
- 高级配置选项
- 配置历史管理
- 配置搜索和过滤