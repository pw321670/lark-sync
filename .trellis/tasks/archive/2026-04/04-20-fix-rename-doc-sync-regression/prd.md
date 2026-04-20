# Fix Rename Regression For Doc Sync

## Goal
修复插件重命名后引入的同步回归，确保 Obsidian 中的 Markdown 文件在文档模式下继续同步为飞书在线文档，并且增量同步/跳过统计与真实远端状态一致。

## Requirements
- 保持已有插件数据兼容迁移可用，不因插件名变更导致配置、认证或同步状态语义漂移。
- 在 `markdownSyncMode=document` 时，Markdown 文件必须继续走飞书在线文档创建/更新路径，而不是上传为普通 `.md` 文件。
- 增量同步必须基于正确的本地状态和远端对象判断，避免错误地把应同步文件统计为 skipped。
- 用户可见的同步提示和最终 summary 必须反映真实结果，不能掩盖“因为状态丢失/迁移错误而未执行预期同步”的情况。

## Acceptance Criteria
- [ ] 重命名后的插件能够读取旧插件数据，并保留文档模式与同步状态的有效值。
- [ ] Markdown 文档模式下，同步会在飞书创建/更新在线文档，而不是普通 `.md` 文件。
- [ ] 对同一测试 vault 重新同步时，未修改文件才会被计为 skipped；迁移或缓存异常不会导致全部错误跳过。
- [ ] `npm run build` 通过，且关键回归路径可用清晰的手工验证步骤覆盖。

## Technical Notes
- 重点排查 `src/main.ts` 的旧数据迁移、`src/utils/contracts.ts` 的插件数据合并/默认值、`src/sync/*` 的文档模式分支和状态读取链路。
- 需要特别核对最近提交 `87b06d2` 对插件名、manifest、存储键或迁移逻辑的影响。
