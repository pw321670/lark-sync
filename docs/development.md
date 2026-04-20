# 开发说明

## 推荐目录结构

当前项目按 Obsidian 插件的常见结构组织：

```text
lark-sync/
  manifest.json
  main.js
  styles.css
  package.json
  build/
  config/
  docs/
  src/
    main.ts
    oauth/
    settings/
    sync/
    ui/
    utils/
```

说明：

- `manifest.json`、`main.js`、`styles.css` 必须位于插件目录根部，Obsidian 才会加载。
- 业务源码集中在 `src/`。
- `config/config.example.json` 只提供字段契约示例，不参与插件运行。
- 项目已经不再保留 standalone 脚本模式，所有运行与测试都以插件形态为准。

## 本地开发流

1. 准备一个测试 vault。
2. 把仓库挂到 `<vault>/.obsidian/plugins/lark-sync`。
3. 在仓库根目录执行 `npm run dev`。
4. 在 Obsidian 里启用插件。
5. 每次修改后重新加载插件，或配合 Hot Reload 使用。

如果不想持续监听，也可以手动执行一次：

```bash
npm run build
```

如果你之前安装的是旧插件 ID `sync-obsidian-feishu`，首次加载 `lark-sync` 时会尝试复用旧插件目录中的本地数据。

## 开发期测试清单

每次改完授权或同步相关逻辑，至少做这些检查：

1. 设置页能正常保存 `appId`、`appSecret`、`feishuRootFolderToken`、过滤规则等配置。
2. OAuth 能完成浏览器授权，并把 `refreshToken` 写回插件数据。
3. `Preview Lark Sync scope` 的结果和 vault 实际文件范围一致。
4. 点击左侧同步按钮后，样本文档可以成功同步到飞书。
5. 再次同步未改动文件时，不应重复上传。
6. 修改一个文件后再次同步，只验证这批变更是否按预期处理。

## 当前活跃运行链路

```text
src/main.ts
  -> src/oauth/*
  -> src/sync/sync-coordinator.ts
      -> src/sync/obsidian-adapter.ts
      -> src/sync/upload-manager.ts
      -> src/sync/feishu-client.ts
      -> src/sync/feishu-doc-client.ts
  -> src/ui/*
```

如果一个文件不在这条链路上，就要优先判断它是不是已经冗余。

## 当前明确不再保留的模式

- 不再维护 `node auth.js` / `node sync.js` 这类 standalone 运行入口。
- 不再把仓库根目录 JSON 文件视为运行时配置来源。
- 不再把旧脚本行为当成额外的“第二事实来源”。

当前唯一事实来源是：

- 代码：`src/`
- 字段契约：`config/config.example.json`
- 规范：`.trellis/spec/`
