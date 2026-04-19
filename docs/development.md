# 开发说明

## 推荐目录形态

本项目现在按 Obsidian 插件常见结构组织：

```text
sync-obsidian-feishu/
  manifest.json
  main.js
  styles.css
  package.json
  build/
  src/
    main.ts
    oauth/
    sync/
    ui/
    utils/
  legacy/
  docs/
```

说明：

- `manifest.json`、`main.js`、`styles.css` 必须位于插件目录根部，Obsidian 才会加载。
- 业务源码集中在 `src/`，不要再把“候选实现”“实验性 worker”“示例代码”直接放进活跃路径。
- `legacy/` 只保留原始参考实现，迁移完成后可以继续裁剪。

## 本地开发流

1. 准备单独的测试 vault，不要直接在主 vault 上做插件开发。
2. 把插件目录挂到 `<vault>/.obsidian/plugins/sync-obsidian-feishu`。
3. 在仓库根目录执行 `npm run dev`。
4. 在 Obsidian 里启用插件。
5. 每次修改后重载插件，或配合 Hot Reload 使用。

## 开发期测试清单

每次改完同步相关逻辑，至少做这几项：

1. 设置页能正常保存 `appId`、`appSecret`、`root folder token`、过滤规则。
2. OAuth 能走完整流程，并把 `refreshToken` 写回插件数据。
3. `Preview Feishu sync scope` 结果和 vault 实际文件数一致。
4. 点击左侧 ribbon 按钮后，小样本文件可以成功上传到飞书。
5. 再次同步未改动文件时，不应该重复报错。
6. 改动一个文件后再次同步，只验证这一批变更是否正常。

## 当前活跃运行链路

```text
src/main.ts
  -> src/oauth/*
  -> src/sync/sync-coordinator.ts
      -> src/sync/obsidian-adapter.ts
      -> src/sync/upload-manager.ts
      -> src/sync/feishu-client.ts
  -> src/ui/*
```

如果一个文件不在这条链路上，就应该优先怀疑它是不是已经冗余。

## 当前刻意保留的边界

- `legacy/auth.js`
- `legacy/sync.js`

这两个文件仍然有参考价值，因为它们代表了最小可工作的旧实现。做架构调整时，优先保证当前 TypeScript 版本不要偏离它们的核心行为。
