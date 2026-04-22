# MD 转飞书文档增强 Phase 1：行内样式、代码块语言、双链样式化

## 背景

当前 [`src/sync/feishu-doc-client.ts`](../../../src/sync/feishu-doc-client.ts) 里的 `convertMarkdownToBlocks()` 是一个手写的逐行解析器。
它已经支持块级元素：

- 标题
- 列表
- 代码块
- 引用
- 分割线
- Todo

但普通文本仍然通过单个 `text_run` 输出，`style` 始终为空。
这会导致 Markdown 中的行内语法在飞书文档里以原始字符显示，而不是以富文本样式显示。

本 PRD 的目标是做一个可交付、可验证、风险可控的 Phase 1，而不是一次性覆盖全部 Markdown 能力。

---

## Goal

在不引入第三方 Markdown 解析库的前提下，增强当前 Markdown -> 飞书 DocX block 的转换流程，使以下能力可用：

1. 行内加粗、斜体、高亮
2. 行内代码
3. Obsidian 双链的样式化显示
4. 代码块语言显示修复或完成可执行排查

同时保证现有块级解析和增量同步语义不回归。

---

## In Scope

### 1. 行内样式

支持以下语法转为多个 `text_run`：

- `**bold**` -> `bold: true`
- `*italic*` -> `italic: true`
- `==highlight==` -> 使用飞书支持的高亮背景色
- `` `inline code` `` -> `inline_code: true`

### 2. Obsidian 双链样式化

支持：

- `[[Page Name]]`
- `[[target|display]]`

Phase 1 中双链仅做“显示文本 + 蓝色文字样式”处理：

- `[[Page Name]]` 显示为 `Page Name`
- `[[target|display]]` 显示为 `display`
- 不生成真实超链接
- 不做目标页存在性校验

### 3. 代码块语言修复

保留当前 fenced code block 路径，但要完成以下其中之一：

- 修复 payload，使 ` ```python ` 在飞书中显示为 `Python`
- 如果官方 DocX contract 与当前写法不一致，则明确记录正确 contract，并按该 contract 修复实现

这一项不能只停留在“猜测字段位置”，必须落到可验证的请求结构或运行结果。

### 4. 嵌套样式的最小支持

支持有限嵌套：

- `**bold *italic* tail**`

只要求在单行内正确拆分为多个 `text_run`。

---

## Out Of Scope

以下内容不在本次 Phase 1 交付范围内：

- Markdown 表格转飞书表格块
- 跨行行内样式
- 转义语法的完整兼容
- 图片、附件、脚注、数学公式
- Obsidian callout、自定义语法、高级插件语法
- 双链转真实链接
- 单元格内富文本
- 引入 `remark`、`markdown-it` 等第三方依赖

表格能力保留到 Phase 2，前提是先确认官方 DocX table block contract。

---

## Functional Requirements

### Requirement 1: 行内解析入口

新增一个明确的行内解析入口，例如：

```ts
parseInlineElements(text: string): TextElement[]
```

要求：

- 用它替代当前单一的 `createTextRunElement(text)` 直出路径
- `createTextContent(text)` 改为承载多个 `elements`
- 标题、段落、引用、列表、Todo 都复用同一套行内解析
- 代码块内容不走普通行内样式解析

### Requirement 2: 行内代码优先级最高

行内代码优先级必须最高：

- `` `code` `` 内部不再继续解析 `**`、`*`、`==`、`[[...]]`

### Requirement 3: 未闭合或无法识别的标记原样保留

例如：

- `**unclosed`
- `[[broken`
- `==half`

都不应抛错，也不应吞字，必须按普通文本输出。

### Requirement 4: 双链与普通样式同处一条解析链

双链样式化不能单独在 UI 层或 block 组装层硬编码，必须作为行内解析的一部分输出为 `text_run`。

### Requirement 5: 现有块级语义保持不变

以下行为必须保持：

- 标题仍输出 heading block
- `- item` / `1. item` 仍输出列表 block
- `> quote` 仍输出 quote block
- `- [ ]` / `- [x]` 仍输出 todo block
- `---` / `***` 仍输出 divider block

---

## Technical Approach

### 方案方向

采用“轻量 tokenizer + 单行递归/分段解析”的方式实现，不引入第三方 Markdown parser。

建议顺序：

1. 先识别并切出行内代码片段
2. 再处理双链
3. 再处理强调样式：
   - `**...**`
   - `*...*`
   - `==...==`
4. 其余文本按普通 `text_run` 输出

### 关键约束

- 所有样式解析仅在单行内生效
- 不支持跨行嵌套
- 未闭合标记原样保留
- 普通文本顺序必须和原文一致
- 不允许因样式解析改变现有 block 边界

### 代码块语言修复

在当前 [`parseCodeBlock()`](../../../src/sync/feishu-doc-client.ts) 基础上排查：

- `language` 字段是否应位于 `code.style.language` 而非 `code.language`
- `wrap`、`style`、`elements` 是否有官方要求的固定组合
- 需要以实际飞书返回效果或明确 API contract 作为收敛依据

如果排查后发现“本次无法确认官方写法”，则本 PRD 不应承诺修复完成，而应改为“产出最小可执行 spike 结论 + 不阻塞其余行内样式能力”。

---

## Implementation Steps

1. 对齐 DocX text element contract
   - 将 `text_run.style` 收敛为官方 `text_element_style`
   - 核对 code block 的 `language` / `wrap` / `elements` 结构

2. 实现单行行内解析器
   - 新增 `parseInlineElements(text)` 入口
   - 按优先级处理行内代码、双链、粗体、斜体、高亮

3. 接入现有块级生成链
   - 让标题、段落、列表、引用、Todo 统一复用行内解析
   - 保持 code block、divider 和块级判断顺序不变

4. 做最小回归验证
   - 验证未闭合标记按普通文本输出
   - 验证嵌套样式、双链样式化、代码块语言映射和现有块级行为不回归

---

## Files To Modify

主要文件：

- [`src/sync/feishu-doc-client.ts`](../../../src/sync/feishu-doc-client.ts)

可能需要补充的文档：

- [`../spec/backend/feishu-drive-sync.md`](../../spec/backend/feishu-drive-sync.md)
- [`../spec/backend/quality-and-safety.md`](../../spec/backend/quality-and-safety.md)

---

## Acceptance Criteria

- [ ] `**加粗文本**` 在飞书文档中显示为加粗
- [ ] `*斜体文本*` 在飞书文档中显示为斜体
- [ ] `==高亮文本==` 在飞书文档中显示为高亮背景
- [ ] `` `行内代码` `` 在飞书文档中显示为行内代码样式
- [ ] `[[页面名称]]` 在飞书中显示为蓝色文本 `页面名称`
- [ ] `[[目标|显示名]]` 在飞书中显示为蓝色文本 `显示名`
- [ ] `**加粗 *含斜体* 继续**` 在单行内能正确拆分并渲染
- [ ] 未闭合标记不会报错，且会原样显示
- [ ] ` ```python ` 代码块在飞书中不再错误显示为 `Plain Text`，或本次交付中明确记录了官方 contract 与当前限制
- [ ] 现有标题、列表、引用、Todo、分割线行为不回归

---

## Manual Verification

至少手工验证以下样例文档：

1. 普通段落 + 加粗/斜体/高亮/行内代码混排
2. 标题、列表、引用、Todo 中夹带行内样式
3. `[[page]]` 与 `[[target|display]]`
4. fenced code block 带语言标记
5. 未闭合标记和脏输入
6. 修改同一 Markdown 文档后二次同步，确认仍更新同一个远端 doc

---

## Risks

### Risk 1: 代码块语言 contract 未确认

这是本次唯一允许保留为“排查后收敛”的子项，但不能影响其余行内样式能力落地。

### Risk 2: 正则方案过于脆弱

如果纯正则导致嵌套和未闭合场景难以维护，应及时收敛为更简单的单行 tokenizer，而不是继续叠加复杂 regex。

### Risk 3: 样式解析破坏现有 block 语义

所有样式增强都必须发生在 block 内文本元素层，不能改变 block 类型判断顺序。

---

## Deferred To Phase 2

以下内容在本 PRD 之后另起任务：

- Markdown 表格 -> 飞书表格块
- 更完整的 Markdown emphasis 兼容
- 真实 hyperlink 支持
- 更多 Obsidian 专属语法适配

Phase 2 开始前必须先补一份官方 DocX table block contract。
