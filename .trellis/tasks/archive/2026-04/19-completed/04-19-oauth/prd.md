# OAuth 授权模块

## Goal

实现完整的飞书 OAuth 2.0 授权流程，支持跨设备同步和自动 token 刷新，为插件提供安全可靠的授权管理。

## Requirements

### 核心功能

- **完整的 OAuth 2.0 授权流程**
  - 支持飞书开放平台的授权码模式
  - 在 Obsidian 内处理 OAuth 回调
  - 正确获取 access_token 和 refresh_token

- **跨设备同步**
  - 授权信息存储在插件数据中，随 OneDrive 同步
  - 新设备自动检测已有授权，无需重复授权
  - 提供授权状态检查和验证功能

- **Token 管理**
  - 自动刷新过期的 access_token
  - 刷新失败时提示用户重新授权
  - 提供"清除授权"功能，支持重新授权

### 技术实现

- **本地 HTTP 服务器**：用于接收 OAuth 回调
- **Token 存储**：使用 Obsidian 的 `saveData()` API
- **状态管理**：实时跟踪授权状态和 token 有效期

## Acceptance Criteria

* [ ] 用户可以点击"开始授权"按钮启动 OAuth 流程
* [ ] 浏览器自动打开飞书授权页面
* [ ] 授权成功后，access_token 和 refresh_token 正确保存
* [ ] 授权信息通过 OneDrive 同步，在其他设备上可用
* [ ] Token 过期时自动刷新，刷新失败时提示用户
* [ ] 提供"清除授权"功能，清除后可以重新授权
* [ ] 设置界面显示当前授权状态（未授权/已授权/过期）

## Technical Approach

### 模块结构

```
src/oauth/
├── feishu-oauth.ts       # 飞书 OAuth 流程管理
├── token-manager.ts      # Token 刷新和状态管理
└── auth-storage.ts       # 授权数据持久化
```

### 核心接口

```typescript
interface FeishuOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface AuthState {
  userAccessToken: string;
  refreshToken: string;
  connectedAt: string | null;
  expiresAt: string | null;
}
```

### 实现策略

1. **复用现有逻辑**：参考 `legacy/auth.js` 的实现
2. **本地服务器**：在 Obsidian 插件中启动 HTTP 服务器接收回调
3. **Token 刷新**：后台定期检查并刷新 token
4. **错误处理**：完善的错误处理和用户提示

## Implementation Plan

1. **创建 OAuth 服务类**：管理整个授权流程
2. **实现本地 HTTP 服务器**：处理 OAuth 回调
3. **Token 管理器**：自动刷新和状态跟踪
4. **存储管理**：与 Obsidian 数据存储集成
5. **UI 集成**：与设置界面的命令和按钮集成

## Out of Scope

* 飞书 API 的完整功能覆盖（仅覆盖授权部分）
* 高级授权策略（如多账号管理）
* 加密存储（依赖 Obsidian 的数据存储机制）

## Technical Notes

### 参考实现

- `legacy/auth.js` - 现有的飞书 OAuth 授权实现
- 飞书开放平台文档：https://open.feishu.cn/document/common-capabilities/sso/api/get-user-info

### 关键技术点

* OAuth 2.0 授权码模式
* 本地 HTTP 服务器创建和回调处理
* Token 刷新机制
* 跨设备数据同步（通过 OneDrive）

### 依赖关系

* 依赖：设置界面模块（提供配置输入）
* 被依赖：同步引擎模块（需要有效的 access_token）

### 开发优先级

**P0（核心功能）**：
- 基本 OAuth 授权流程
- Token 存储和读取
- 授权状态显示

**P1（重要功能）**：
- Token 自动刷新
- 跨设备同步
- 错误处理和用户提示

**P2（增强功能）**：
- 授权状态实时检查
- 详细的错误信息
- 授权日志记录