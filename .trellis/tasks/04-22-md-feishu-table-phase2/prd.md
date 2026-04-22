# MD 转飞书表格 Phase 2

## 背景

在 [`04-21-md-feishu-rich-format`](../04-21-md-feishu-rich-format/prd.md) 中，Phase 1 已经覆盖了：

- 行内加粗、斜体、高亮
- 行内代码
- Obsidian 双链样式化
- DocX text element payload 对齐

Markdown 表格没有在该阶段实现，原因不是“不重要”，而是它对应的是另一类 DocX block contract：

- 表格 block 自身的创建方式
- 单元格 block 的组织方式
- 单元格内文本写入方式

这部分需要单独定义和验证，避免和 Phase 1 的行内样式解析混在一起。

---

## Goal

将标准 Markdown 表格在飞书在线文档模式下转换为真正的飞书表格块，而不是普通文本段落。

---

## In Scope

### 1. 标准 Markdown 表格识别

支持识别以下结构：

- 表头行
- 分隔行（`---` / `:---` / `---:` / `:---:`）
- 数据行

示例：

```md
| Name | Status |
| --- | --- |
| Task A | Done |
| Task B | Todo |
```

### 2. 飞书表格 block 创建

将标准 Markdown 表格创建为飞书表格 block，而不是多行普通 text block。

### 3. 单元格文本写入

Phase 2 的首版只要求单元格写入纯文本内容。

- 不要求单元格内支持完整行内样式
- 不要求单元格内支持多 block 嵌套

### 4. 容错与降级

当输入不满足“标准 Markdown 表格”条件时：

- 不应抛错
- 不应生成非法 DocX schema
- 应回退为普通文本块解析

---

## Out Of Scope

以下内容不在本次表格 Phase 2 范围内：

- 单元格内富文本样式
- 单元格内列表、引用、Todo、代码块
- 多行单元格
- 转义管道符（如 `\\|`）的完整兼容
- 表格对齐信息在飞书中的视觉映射
- 合并单元格
- 表格与图片、附件、公式等复杂内容混排

---

## Functional Requirements

### Requirement 1: 表格识别必须是连续块级结构

只有当连续多行共同满足标准表格结构时，才能进入表格分支。

### Requirement 2: 非法表格必须回退

以下情况必须按普通文本处理：

- 只有一行 pipe 文本，没有分隔行
- 表头列数与数据列数不一致
- 分隔行不合法

### Requirement 3: 单元格内容写入稳定

单元格内容至少应满足：

- 顺序正确
- 行列数正确
- 空单元格允许为空文本

### Requirement 4: 不破坏现有块级语义

表格识别不能误伤已有块类型：

- 标题
- 列表
- 引用
- Todo
- 代码块
- 分割线

---

## Technical Approach

### 方案方向

在 [`src/sync/feishu-doc-client.ts`](../../../src/sync/feishu-doc-client.ts) 中新增表格解析分支：

1. 在 `convertMarkdownToOperations()` 中先识别标准 Markdown table 片段
2. 普通块继续走 `children` create 路径，表格块切到 `descendant` create 路径
3. 将表格片段解析为 `rows / cells`，一次性组装 `Table(31)`、`TableCell(32)` 与 cell text child
4. 单元格内首版只写入纯文本，并保证空单元格也有合法 text child

### 前置 contract 要求

开始实现前，必须先确认以下官方 contract：

- 表格 block 的 `block_type` 与 payload key
- 单元格 block 的 `block_type` 与父子关系
- 是使用普通 children create 还是 descendant create 更合适
- 单元格文本的最小合法写法

如果 contract 仍不清晰，则先产出一个最小 spike，而不是直接承诺完整实现。

---

## Files To Modify

主要文件：

- [`src/sync/feishu-doc-client.ts`](../../../src/sync/feishu-doc-client.ts)

可能需要补充的文档：

- [`../../spec/backend/feishu-drive-sync.md`](../../spec/backend/feishu-drive-sync.md)
- [`../../spec/backend/quality-and-safety.md`](../../spec/backend/quality-and-safety.md)

---

## Acceptance Criteria

- [x] 标准 Markdown 表格会在飞书中渲染为真实表格，而不是普通段落
- [x] 表头、数据行、列数与原表格一致
- [x] 空单元格不会导致 schema 错误
- [x] 非法或残缺表格会安全回退为普通文本
- [x] 非表格 Markdown 内容行为不回归
- [x] 文档更新路径与新建路径都能正确写入表格

---

## Manual Verification

已手工验证通过以下样例：

1. 2 列 2 行的最小表格
2. 带空单元格的表格
3. 3 列多行表格
4. 非法表格输入回退
5. 同一文档重复同步时表格更新正常

补充验证：

- `npm run build` 通过
- 针对 parser / payload 的最小回归已通过：
  - 标准 table 会走 `descendant` 路径
  - 空单元格会生成空 text child
  - 普通含 `|` 文本不会被误判成表格

---

## Completion Status

已完成 - 2026-04-22

### 已完成的工作

1. 在 [`src/sync/feishu-doc-client.ts`](../../../src/sync/feishu-doc-client.ts) 中实现标准 Markdown table 识别与表格写入分支
2. 确认并接入飞书官方 DocX `Table(31)` / `TableCell(32)` contract，使用 `POST /documents/:document_id/blocks/:block_id/descendant`
3. 将文档写入路径拆成 mixed flow：
   - 普通 Markdown block 继续使用 `children`
   - 表格 block 使用 `descendant`
4. 为每个 table cell 固定生成一个 text child，确保空单元格也能稳定落盘
5. 同步更新 backend spec：[`../../spec/backend/feishu-drive-sync.md`](../../spec/backend/feishu-drive-sync.md)

### 当前边界

- 单元格内内容仍然是纯文本，不解析行内 rich text
- 不支持 merged cells、多行单元格、单元格内嵌列表/引用/code block
- 非标准或不完整 Markdown table 继续按普通文本回退

---

## Risks

### Risk 1: DocX 表格 contract 与普通文本块差异较大

如果 block 结构判断错误，很容易触发 `schema mismatch`。

### Risk 2: 单元格父子关系不清晰

如果 cell block 的层级关系不对，可能表格创建成功但内容为空，或直接创建失败。

### Risk 3: 表格识别误伤普通文本

如果 pipe 文本识别过宽，可能把原本的普通段落错误识别为表格。
