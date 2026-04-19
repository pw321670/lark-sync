# True Incremental Feishu Doc Sync

## Goal

为 Markdown 文档模式实现真正的增量更新能力，避免重复创建同名飞书文档，并在插件重载后继续基于已保存的远端对象身份执行稳定更新。

## Requirements

- 以本地 `relPath` 作为唯一主键，持久化对应远端文档身份，而不是只依赖“同目录 + 同标题”推断。
- 文档模式同步时，优先复用已知远端 `docId` 做原位更新。
- 只有在已知远端文档不存在、身份失效、或状态缺失时，才允许回退到“同目录 + 同标题”查找/清理/重建。
- 不同路径下允许存在同标题 Markdown 文件，不能因为标题相同而互相覆盖或互删。
- 未改动文件在插件重载后仍应继续被跳过。
- 状态更新必须只在远端操作成功后持久化，不能把失败更新写成成功。
- 当前实现和 spec 需要统一，明确“文档模式已支持基于远端身份的增量更新”。

## Acceptance Criteria

- [ ] `syncState` 能持久化每个 Markdown 文件对应的远端文档身份信息
- [ ] 同一 vault 中两个不同路径但同标题的 Markdown 文件可以稳定同步到各自对应的远端文档
- [ ] 对已同步过的 Markdown 文件，二次修改后不会新建重复文档，而是更新原文档
- [ ] 插件 reload 后，不改文件再次同步不会重复创建文档
- [ ] 远端文档被手工删除后，下一次同步能自动恢复
- [ ] `npm run build` 通过
- [ ] 相关 backend spec 已更新

## Technical Notes

- 涉及 cross-layer contract：
  - `src/utils/contracts.ts` 中的 `PluginData.syncState`
  - `src/sync/types.ts` 中的状态模型
  - `src/sync/state-tracker.ts` 的持久化结构
  - `src/sync/upload-manager.ts` 的 Markdown 文档分支
  - `src/sync/feishu-doc-client.ts` 的文档查找/清空/重写逻辑
- 目标 contract：
  - 状态至少包含 `remoteType=document`、`remoteId/docId`、`remoteTitle`
  - 更新路径先按 `docId` 尝试
  - 回退路径才按 `parentFolderToken + title` 查找
- 需要定义清晰的错误矩阵：
  - 远端 docId 存在且可更新
  - 远端 docId 不存在
  - 远端标题冲突但 relPath 不同
  - 添加块失败 / 清空失败 / 重建失败
