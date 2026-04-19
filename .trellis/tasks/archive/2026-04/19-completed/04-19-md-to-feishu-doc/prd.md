# PRD: Markdown 文件转飞书在线文档功能

## 需求描述

将 Obsidian 中的 Markdown 文件同步到飞书时，不再上传为普通文件，而是创建为飞书在线文档。

## 技术方案

### 集成方式

使用飞书官方 API 直接创建文档，分为两个步骤：

1. **创建空文档**：`POST /open-apis/docx/v1/documents`
2. **添加内容块**：`POST /open-apis/docx/v1/documents/{document_id}/blocks/{parent_id}/children`

### 优势

1. **无需外部依赖**：不需要安装 CLI 工具
2. **错误处理清晰**：直接获取 API 错误，便于调试
3. **性能更好**：避免启动 Node 进程的开销
4. **架构简单**：Plugin → Feishu API（仅 2 层）
5. **权限明确**：直接使用现有的 `docx:document:create` 权限

### 实现范围

**阶段 1（当前）**：基础功能
- ✅ 仅处理 `.md` 文件
- ✅ 使用 CLI 创建飞书在线文档
- ✅ 保存文档 ID 用于后续更新
- ✅ 其他文件类型继续使用原有文件上传方式

**阶段 2（未来）**：增强功能
- ⏳ 支持文档更新（非新建）
- ⏳ 图片处理和上传
- ⏳ 文档移动到指定文件夹

## 技术实现

### 1. 新增模块：`src/sync/feishu-doc-client.ts`

```typescript
export class FeishuDocClient {
  async createDocument(
    title: string,
    markdownContent: string,
    options?: {
      parentFolderToken?: string;
    }
  ): Promise<{
    docId: string;
    docUrl: string;
  }>;

  async updateDocument(
    docId: string,
    markdownContent: string
  ): Promise<void>;
}
```

### 2. 修改 `src/sync/upload-manager.ts`

```typescript
async uploadFile(file: FileEntry, parentFolderToken: string): Promise<number> {
  const fileName = this.getFileName(file.relPath);

  // 如果是 Markdown 文件，使用在线文档创建
  if (fileName.endsWith('.md')) {
    return this.uploadAsDocument(file, parentFolderToken);
  }

  // 其他文件使用原有文件上传逻辑
  return this.uploadAsFile(file, parentFolderToken);
}
```

### 3. 状态管理

需要在 `state.json` 中记录：
- 文档 ID（对应文件路径）
- 文档创建时间
- 文档最后更新时间

```typescript
interface DocumentState {
  relPath: string;
  docId: string;
  createdAt: string;
  lastUpdatedAt: string;
}
```

### 4. CLI 依赖检查

在插件加载时检查 `lark-cli` 是否可用：

```typescript
async checkCliAvailability(): Promise<boolean> {
  try {
    const { exec } = require('child_process');
    await new Promise((resolve, reject) => {
      exec('lark-cli --version', (error: any) => {
        if (error) reject(error);
        else resolve(true);
      });
    });
    return true;
  } catch {
    return false;
  }
}
```

## 配置选项

### 新增设置项

```typescript
interface FeishuSyncConfig {
  // ... 现有配置

  // 新增：文档同步模式
  markdownSyncMode: 'file' | 'document' | 'auto';
  // 'file' - 上传为文件（原有方式）
  // 'document' - 创建为在线文档（新方式）
  // 'auto' - 根据文件大小/类型自动选择
}
```

### 默认值

```typescript
markdownSyncMode: 'file' // 保持原有行为，避免影响现有用户
```

## 实现步骤

### Step 1: 创建 FeishuDocClient 类 ✅

- 封装 `lark-cli` 命令调用
- 处理命令执行结果和错误
- 提供 Promise 化的接口

### Step 2: 修改上传管理器 ⏳

- 区分 `.md` 文件和其他文件
- 调用不同的上传逻辑
- 统一错误处理

### Step 3: 状态存储扩展 ⏳

- 扩展 `state.json` 结构
- 保存文档 ID 和元数据
- 支持后续更新

### Step 4: 配置 UI 添加 ⏳

- 在设置页面添加同步模式选择
- 添加 CLI 可用性检查提示

### Step 5: 测试和验证 ⏳

- 测试纯文本 Markdown 转换
- 测试带代码块的文档
- 测试中英文混合内容
- 验证错误处理

## 验收标准

### 功能验收

- [x] `.md` 文件能成功创建为飞书在线文档
- [x] 非 `.md` 文件仍使用文件上传方式
- [x] 文档标题使用文件名（不含扩展名）
- [x] 文档内容正确转换，保留基本格式
- [x] 错误处理完善，CLI 不可用时不影响原有功能

### 质量验收

- [x] 代码符合现有架构规范
- [x] 无 TypeScript 错误
- [x] 添加必要的调试日志
- [x] 通过基本的冒烟测试

## 实施状态

✅ **已完成 - 2026-04-19**

### 已完成的工作

1. **飞书 API 集成模块** (`src/sync/feishu-doc-client.ts`)
   - 使用飞书官方 DocX API 创建文档
   - 两步创建流程：创建空文档 → 添加内容块
   - Markdown 转飞书块格式的转换逻辑
   - 支持文本、标题、列表、代码块等基本格式

2. **上传管理器增强** (`src/sync/upload-manager.ts`)
   - 区分 `.md` 文件和其他文件
   - 根据配置选择上传策略（文件 vs 文档）
   - 保持向后兼容性

3. **OAuth 权限系统完善** (`src/oauth/feishu-oauth.ts`)
   - 修复 OAuth scope 配置
   - 添加 `docx:document` 和 `docx:document:write_only` 权限
   - 支持权限状态显示

4. **配置系统扩展**
   - 添加 `markdownSyncMode` 配置选项
   - 更新类型定义和默认值
   - 设置页面新增 UI 控件和权限状态显示

5. **测试验证**
   - API 功能测试通过
   - 成功创建测试文档:
     - [adf.md](https://www.feishu.cn/docx/PnEZdiNL9o1qRExIdO6c9TYYnYe)
     - [inbox.md](https://www.feishu.cn/docx/NYxRdgHProFSIJxr8dmcdqjwn3c)
   - 编译无错误

### 关键技术突破

1. **OAuth 权限问题解决**
   - 发现 `docx:document:create` 只能创建空文档的陷阱
   - 正确配置 `docx:document` 和 `docx:document:write_only` 权限
   - 解决 HTTP 400 错误问题

2. **Obsidian API 使用规范**
   - 修正 `requestUrl` 的 `contentType` 参数使用
   - 避免在 headers 中设置 `Content-Type`

3. **飞书 API 格式要求**
   - 使用数字格式的 `block_type`（2, 3, 4...）
   - 使用下划线格式的字段名（`text_run`, `code_run`）

### 使用方式

1. **重新授权插件**:
   - 打开插件设置 → Feishu App
   - 点击 "Authorize" 按钮重新授权
   - 确认权限状态显示所需的权限都已获取 ✅

2. **配置插件**:
   - 打开插件设置 → Sync Strategy
   - 找到 "Markdown file sync mode"
   - 选择 "Create as online documents"

3. **开始同步**:
   - 所有 `.md` 文件将创建为飞书在线文档
   - 其他文件继续使用文件上传方式
   - 文档会创建在指定的飞书文件夹中

## 依赖和限制

### 依赖

- **外部依赖**：无（使用飞书官方 API）
- **权限要求**：`docx:document` 和 `docx:document:write_only`（需要在授权时明确声明）

### 限制

- **文档更新**：阶段 1 仅支持新建，不支持更新已有文档
- **图片处理**：Markdown 中的本地图片无法自动上传
- **高级语法**：部分 Obsidian 特有语法（如 Wikilinks）可能无法完美转换
- **块格式支持**：目前支持基本的文本、标题、列表、代码块、引用等格式

## 风险评估

### 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| OAuth 权限不足 | HTTP 400 错误 | 添加权限状态显示，明确所需权限 |
| API 格式变化 | 兼容性问题 | 遵循官方 API 文档，添加详细错误处理 |
| 转换质量损失 | 格式显示问题 | 在设置中说明限制，保留文件上传选项 |

### 用户体验风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 行为变化 | 用户困惑 | 默认为文件模式，明确说明新功能 |
| 错误提示不清 | 排障困难 | 提供详细错误信息和解决建议 |
| 权限配置复杂 | 授权失败 | 简化授权流程，提供权限状态可视化 |

## 后续优化方向

1. **文档更新**：支持增量更新已有文档（而非每次新建）
2. **图片处理**：自动上传图片并插入文档引用
3. **高级语法**：支持 Wikilinks、Tags 等 Obsidian 特性
4. **批量操作**：优化性能，支持批量创建文档
5. **文件夹组织**：支持将文档移动到指定文件夹

## 参考资料

- [飞书 CLI GitHub](https://github.com/larksuite/cli)
- [飞书 CLI 安装与使用指南](https://www.feishu.cn/content/article/7623291503305083853)
- [飞书文档 API 文档](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/create)
