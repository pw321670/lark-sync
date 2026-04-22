# 飞书 API 限频修复与同步进度可视化

## Goal

修复批量同步大量文件时，飞书 API 返回 `99991400` 限频错误导致大量文件同步失败的问题，并在 Obsidian 下方状态栏显示实时同步进度。

## What Failed In The Previous Plan

上一版 PRD 的方向不够准确，主要有两个问题：

1. 它假设“只要加一个固定 5 QPS 的 RateLimiter 就够了”，但没有要求限流器必须在并发下串行发号。
2. 它把限频处理几乎都当成“预防问题”，没有把飞书实际返回的 `99991400` / `429` / `Retry-After` 作为全局退避信号来利用。

结果是：

- 多个并发 worker 仍可能在同一时间窗口一起发请求，穿透所谓“全局限流”
- 某个请求触发限频后，其他 worker 仍按原节奏继续打 API
- 用户只能看到失败结果，看不到同步到底卡在什么阶段、已经完成了多少

## Requirements

- 实现一个真正并发安全的共享 `RateLimiter`
- `FeishuClient` 和 `FeishuDocClient` 必须共享同一个限流器实例
- 限流器不仅要做固定节流，还要在收到限频响应后执行全局退避
- 继续保留现有请求级 / 文件级重试逻辑作为安全网，但不能再让它成为主要限频策略
- 在状态栏显示实时同步状态，至少包含：
  - 当前阶段
  - 已处理文件数 / 总文件数
  - 已上传数
  - 已跳过数
  - 失败数（如果有）
- 状态栏进度必须消费 sync runtime 的结构化进度事件，不能在 UI 层自己猜

## Acceptance Criteria

- [ ] 大批量同步时，`99991400` 不再导致成片失败
- [ ] 限流器在并发上传下仍能保持全局请求间隔
- [ ] `99991400`、HTTP `429`、`Retry-After` 会触发共享退避
- [ ] `FeishuClient` 与 `FeishuDocClient` 的请求都走同一套限流 / 退避
- [ ] Obsidian 下方状态栏能显示 `已处理/总数` 和当前阶段
- [ ] 构建成功

## Technical Approach

### 1. 修正限流器契约

`src/sync/rate-limiter.ts`

- `acquire()` 必须对并发调用串行排队，不能只靠 `lastAcquireTime` 做乐观判断
- 增加 `noteRateLimit()`，用于在限频响应后把全局 `nextAvailableAt` 往后推
- 增加 `noteSuccess()`，用于在成功请求后清空连续限频计数

### 2. 让客户端真正消费限频信号

`src/sync/feishu-client.ts`

- 改为可检查 HTTP 状态 / Feishu `code` / `Retry-After`
- 识别 `99991400`、HTTP `429`、`frequency limit`
- 命中限频时，调用共享限流器的退避逻辑，而不是只做本地 sleep

`src/sync/feishu-doc-client.ts`

- 与 `FeishuClient` 使用同一套共享限频反馈思路
- 保留现有 DocX typed error 契约，但补上 `retryAfterMs` / `isRateLimit`

### 3. 把真实进度从 runtime 暴露给 UI

`src/sync/types.ts`

- 新增 `SyncProgress`

`src/sync/upload-manager.ts`

- 在每个文件完成后发出结构化进度

`src/sync/sync-coordinator.ts`

- 按阶段发出进度事件：
  - `scanning`
  - `ensuring-folders`
  - `uploading`
  - `writing-state`
  - `completed`

### 4. 在状态栏显示实时进度

`src/ui/sync-status-bar.ts`

- 新增独立状态栏组件
- 显示 `processed/total`、`uploaded`、`skipped`、`failed`
- 当前文件路径放到 tooltip，不把状态栏文本撑爆

`src/main.ts`

- 创建状态栏组件
- 消费 `SyncCoordinator` 的进度事件
- 在 blocked / cancelled / completed 后同步更新状态栏

## Decision (ADR-lite)

**Context**: 单纯靠请求失败后的指数退避不能解决批量同步的限频问题，因为多个 worker 会一起恢复，形成新的突发流量。  
**Decision**: 使用“并发安全的共享限流器 + 限频反馈驱动的全局退避”作为主策略，并把进度显式暴露到状态栏。  
**Consequences**: 同步速度会比完全放开并发更保守，但整体成功率和可观察性会显著更高。

## Out Of Scope

- 用户可配置的限流速率
- 自动调并发
- 后台自动同步
- 更细粒度到“单个远端请求”的可视化

## Implementation Plan

1. 修复 `RateLimiter` 并发穿透问题
2. 统一 Feishu Drive / Doc 客户端的限频反馈处理
3. 在 sync runtime 中补结构化进度事件
4. 新增状态栏 UI 并接入主插件
5. 手工验证大批量同步与状态显示
