# 修复 Feishu `99991400` 限频导致的大批量同步失败问题

## Goal

在大量文件同步场景下，显著降低 Feishu `99991400` / HTTP `429` 触发频率，避免整批同步失败；同时在 Obsidian 底部状态栏持续展示可理解的同步进度、批次阶段和限频冷却状态。

## Problem

当前方案即使引入共享限流器，仍然可能在大量文件场景下命中限频，主要原因不只是全局 QPS 偏高，而是：

1. Markdown 转飞书在线文档的单文件请求链路过重，一个文件背后往往包含多次 DocX 读写请求。
2. 同一远端文件夹的目录清单会被重复拉取，导致请求总量被放大。
3. DocX 写接口和普通 Drive 文件接口混在同一节奏下执行，没有区分高成本链路和低成本链路。
4. 命中限频后只有局部重试，没有按 Feishu 返回的限频信号做全局降档和批间冷却。
5. 用户只能看到最终失败提示，看不到“已处理多少 / 总共多少”“当前卡在哪个阶段”“是否正在等待限频恢复”。

## Goals

- 在 200+ 文件同步场景下，显著降低 `99991400` / `429` 的出现频率。
- 让同步在限频下“变慢但继续跑”，而不是整批失败。
- Markdown 在线文档同步采用保守节奏，优先保证成功率。
- 同一远端文件夹在单轮同步内不重复无谓地 `list`。
- 底部状态栏持续显示当前通道、当前阶段、已处理数量和冷却状态。
- 不破坏现有目录结构、增量同步、Markdown 转在线文档的正确性。

## Non-goals

- 不追求同步吞吐最大化。
- 不引入跨会话的远端目录持久缓存。
- 不做用户可配置的复杂限流策略面板。
- 不重构整套同步状态模型，只在现有 runtime 上增量增强。
- 不保证对所有 Feishu API 找到理论最优参数，只做稳定优先的保守策略。

## External Constraints

本任务依赖的官方限制和建议如下：

- DocX block 写接口：
  - 单应用频率上限：`3 req/s`
  - 单文档并发编辑上限：`3 req/s`
- Drive 上传文件接口：`5 QPS`
- Drive 创建文件夹接口：`5 次/秒`
- 命中限频时，优先遵循响应头 `x-ogw-ratelimit-reset`
- Feishu 可能以 HTTP `429` 或业务码 `99991400` 体现限频

参考文档：

- https://open.feishu.cn/document/server-docs/api-call-guide/frequency-control
- https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document-block/create
- https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/document-docx/docx-v1/document-block-descendant/create
- https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/upload_all
- https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/create_folder

说明：

- 上述限制是官方已确认信息。
- 本 PRD 后续提出的并发数、批大小、冷却时间属于工程上的保守建议值，不是 Feishu 官方保证的“最佳值”。

## Proposed Strategy

采用三层叠加策略，而不是继续只靠“一个全局 limiter”：

1. 两条同步通道
   - 通道 A：Markdown -> 飞书在线文档
   - 通道 B：普通文件上传
2. 单轮同步内的远端目录缓存
   - 同一个远端文件夹的目录清单只拉一次
   - 后续查重、清理遗留 `.md`、恢复 token 均复用缓存
3. 分批执行与限频后降档
   - 大批量同步拆分成多个批次
   - 命中限频后按响应头等待，并自动切换到更保守的参数

## Execution Policy

### Channel A: Markdown -> Online Document

- 文件级并发：`1`
- 目标请求节奏：平均 `1~2 req/s`
- 每批大小：`10` 个文档
- 批间冷却：`15s`

设计意图：

- 这里的“串行”不是整个同步都串行，而是 Markdown 在线文档链路一次只处理一个文档。
- 这样可以避免多个高成本 DocX 写链路同时打到 Feishu 文档接口。

### Channel B: Regular File Upload

- 文件级并发：`2`
- 目标请求节奏：平均 `2~3 req/s`
- 每批大小：`25` 个文件
- 批间冷却：`5s`

设计意图：

- 普通文件接口的上限比 DocX 宽一些，但仍保守运行，避免和 DocX 链路混跑时互相挤占配额。

### Batch Ordering

首版优先采用简单稳定策略：

1. 先完成 Markdown 文档批次
2. 再执行普通文件批次

如果后续验证发现整体耗时过长，再考虑更复杂的“交替批次”策略；本期先以稳定为先。

## Adaptive Degrade Policy

当任一通道收到 `99991400` 或 HTTP `429` 时：

1. 优先读取 `x-ogw-ratelimit-reset`
2. 按该值整体暂停当前通道
3. 若无该响应头，则保守等待 `10~30s`
4. 下一批自动降档

降档策略：

- 通道 A：
  - 批间冷却从 `15s` 提升到 `30~60s`
  - 保持文件并发 `1`
- 通道 B：
  - 文件并发从 `2` 降到 `1`
  - 批间冷却从 `5s` 提升到 `10~20s`

连续多次命中限频时：

- 优先暂停普通文件通道
- 让 Markdown 文档通道独占执行

## Folder Cache Contract

### Scope

- 缓存只存在于当前同步运行期间
- 不跨插件重启保存

### Key

- 远端 `folderToken`

### Value

- 该远端文件夹当前的项目清单
- 名称到远端项目的索引
- 必要时包含按类型分类的索引，用于区分 doc / file / folder

### Read Scenarios

- 查找同名普通文件是否存在
- 查找同名在线文档是否存在
- 查找遗留 `.md` 文件是否存在
- 辅助恢复远端 token

### Write Scenarios

- 创建远端文件后，更新缓存
- 删除远端文件后，更新缓存
- 创建远端文档后，更新缓存
- 清理遗留 `.md` 文件后，更新缓存

### Constraints

- 缓存必须只作为“本轮同步内的远端目录快照”
- 不能假设缓存跨轮仍然有效
- 不能因为缓存命中而跳过本轮内必要的状态更新

## UX / Status Bar

底部状态栏必须展示以下信息：

- 当前阶段
  - `准备中`
  - `文档批次 1/3`
  - `文件批次 2/5`
  - `冷却中`
  - `写入状态`
  - `已完成`
- 当前通道
  - `文档`
  - `文件`
- 已处理数量
  - `37 / 245`
- 结果统计
  - `uploaded 18 | skipped 14 | failed 5`
- 如处于限频等待
  - `rate limited, retry in 23s`

状态栏的目标是让用户明确知道：

- 当前是否仍在同步
- 现在跑的是文档还是文件
- 已经完成了多少
- 是正在处理，还是正在等待限频恢复

## Acceptance Criteria

- [ ] 200+ 文件同步时，不再频繁出现整批失败
- [ ] Markdown 在线文档同步一次只处理一个文档
- [ ] 普通文件同步与文档同步使用不同的执行策略
- [ ] 同一远端文件夹在单轮同步中不会为每个文件重复 `list`
- [ ] 命中 `99991400` / `429` 后，会按响应头或保守等待策略自动继续后续批次
- [ ] 底部状态栏可持续显示 `已处理 / 总数`、当前通道、当前阶段、失败数和冷却状态
- [ ] 现有目录结构、Markdown 转在线文档逻辑、增量同步逻辑不回归
- [ ] 构建通过，且大批量手工测试结果优于当前版本

## Technical Approach

### 1. Split Execution Lanes

`src/sync/sync-coordinator.ts`

- 在扫描完成后，将待同步文件按类型分成两类：
  - Markdown 文档任务
  - 普通文件任务
- 分别交给不同的执行策略
- 首版按“先文档，后文件”的顺序运行

### 2. Introduce Batch Scheduler

`src/sync/upload-manager.ts`

- 为两类任务分别增加批处理调度器
- 支持：
  - 固定批大小
  - 批间冷却
  - 命中限频后的降档
  - 当前批次信息回传给 UI

### 3. Add Per-run Folder Inventory Cache

`src/sync/feishu-client.ts`

- 为远端文件夹清单增加本轮运行期缓存
- `findExistingItems()`、重复 `listFolderItems()`、遗留 `.md` 清理等逻辑优先复用缓存
- 创建 / 删除 / 恢复成功后，必须同步刷新缓存内容

### 4. Keep DocX Writes Conservative

`src/sync/feishu-doc-client.ts`

- 继续遵循共享限频器
- 在 DocX 通道中以更保守节奏执行请求
- 对 `99991400` / `429` / `x-ogw-ratelimit-reset` 做统一反馈，驱动上层批调度器降档

### 5. Surface Batch-aware Progress To UI

`src/sync/types.ts`

- 扩展进度事件结构，增加：
  - 当前通道
  - 当前批次序号 / 总批次数
  - 当前是否处于冷却
  - 剩余等待秒数

`src/ui/sync-status-bar.ts`

- 基于结构化进度事件渲染状态栏
- 不在 UI 层猜测同步阶段

## Decision (ADR-lite)

**Context**
现有问题并非单一“QPS 太高”，而是“高成本链路混跑 + 重复远端扫描 + 命中限频后缺乏全局降档”叠加导致。

**Decision**
采用“分通道执行 + 单轮目录缓存 + 分批执行 + 限频后自动降档”的组合策略，而不是继续只强化全局 RateLimiter。

**Consequences**

- 同步整体速度会更保守
- 代码复杂度会增加，尤其在批调度和缓存一致性上
- 但大批量同步的成功率、可观察性和可控性会显著提升

## Out Of Scope

- 用户自定义批大小、并发数和冷却时间
- 跨会话持久化远端目录缓存
- 基于历史统计自动学习最佳节奏
- 后台自动同步
- 多租户维度的高级频控分析面板

## Manual Verification

- 在 200+ 文件的 vault 中执行全量同步
- 验证状态栏能持续展示：
  - 当前通道
  - 批次阶段
  - 已处理 / 总数
  - 失败数
  - 限频冷却倒计时
- 验证同一远端目录下多个文件同步时，不再出现明显的重复 `list`
- 验证命中限频后，同步不会整轮中止，而是等待后继续
- 验证 Markdown 文档仍然同步为飞书在线文档，而不是普通 `.md` 文件
- 验证普通文件上传路径、目录结构和增量同步结果不回归

## Open Questions

- Markdown 批大小 `10` 是否仍偏大，是否需要首版直接从 `5` 起步
- 普通文件并发 `2` 在某些租户下是否仍偏激进
- 是否需要在后续版本中为 regular file 持久化 remote token，进一步减少查重请求
- 若“先文档、后文件”导致感知耗时过长，是否需要在下一阶段引入交替批次策略

## Implementation Plan

1. 重写 PRD 与执行策略，明确分通道、分批、缓存与降档契约
2. 在 sync runtime 中引入任务分流和批调度
3. 为远端目录清单增加单轮缓存及一致性更新
4. 将限频反馈接入批调度器，支持自动冷却与降档
5. 扩展状态栏进度展示
6. 进行大批量手工验证并根据真实结果微调参数
