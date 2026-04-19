# Sync Obsidian to Feishu

桌面优先的 Obsidian 插件，用来把当前 vault 的笔记单向同步到飞书云空间。

## 当前状态

- 已有可用的 Obsidian 插件入口、设置页、OAuth 授权流和手动同步入口。
- 当前活跃同步链路已经收敛为 `main -> SyncCoordinator -> UploadManager -> FeishuClient`。
- `legacy/` 保留了最初的参考实现，只作为迁移锚点，不参与当前插件运行。

## 开发方式

推荐把仓库通过 junction / 符号链接挂到测试 vault：

```text
<vault>/.obsidian/plugins/sync-obsidian-feishu -> D:\projects\sync-obsidian-feishu
```

然后在仓库根目录运行：

```bash
npm install
npm run dev
```

Obsidian 中启用插件后，每次改动都会重新构建到根目录的 `main.js`。

## 仓库结构

- `src/main.ts`: 插件入口，负责设置、命令、授权和同步启动
- `src/oauth/`: 飞书 OAuth 和 token 生命周期
- `src/sync/`: 当前实际使用的同步核心
- `src/ui/`: ribbon 按钮和通知
- `legacy/`: 原始脚本版实现，仅供对照
- `docs/`: 配置、开发和排障文档

## 文档

- [开发说明](docs/development.md)
- [飞书 OAuth 配置](docs/oauth-setup.md)
- [排障记录](docs/troubleshooting.md)

## 构建与分发

- 本地安装或 BRAT 发布都需要根目录这三个产物：
  - `manifest.json`
  - `main.js`
  - `styles.css`
- 正式构建：

```bash
npm run build
```

## 当前已知改进点

- 现在的同步状态仍是内存态，插件重载后不会保留增量上传状态。
- 密钥和 token 还保存在插件数据中，后续可以按 Obsidian 的 `SecretStorage` 指南迁移。
- 自动同步、定时同步和更完整的同步结果校验还没有做完。
