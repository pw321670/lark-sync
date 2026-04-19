# Sync Obsidian to Feishu

一个桌面优先的 Obsidian 插件，用来把当前 vault 中符合规则的文件同步到飞书云空间。

## 当前状态

- 当前唯一运行形态是 Obsidian 插件，不再维护 standalone 脚本入口。
- 插件已经具备：
  - 设置页与本地配置持久化
  - Feishu OAuth 授权与 token 刷新
  - 同步范围预览
  - 手动触发同步 / 取消同步
  - 同步结果摘要与 Notice 反馈
- 当前活跃同步链路是：
  - `src/main.ts`
  - `src/sync/sync-coordinator.ts`
  - `src/sync/upload-manager.ts`
  - `src/sync/feishu-client.ts`
  - `src/sync/feishu-doc-client.ts`

## 开发方式

推荐把仓库通过 junction 或符号链接挂到测试 vault：

```text
<vault>/.obsidian/plugins/sync-obsidian-feishu -> D:\projects\sync-obsidian-feishu
```

然后在仓库根目录执行：

```bash
npm install
npm run dev
```

`npm run dev` 会持续监听 `src/` 改动，并自动重新构建根目录的 `main.js`。  
改完代码后，回到 Obsidian 里重新加载插件即可测试。

## 仓库结构

- `src/main.ts`: 插件入口，负责设置、命令、授权和同步启动
- `src/oauth/`: Feishu OAuth、token 刷新与本地授权状态存储
- `src/sync/`: Vault 扫描、同步协调、上传、飞书 API 客户端
- `src/settings/`: 设置页渲染与动作
- `src/ui/`: ribbon 按钮、Notice 与命令注册
- `src/utils/`: 配置契约、预览与路径辅助逻辑
- `config/`: 示例配置字段契约
- `docs/`: 开发说明、OAuth 配置、排障记录
- `.trellis/spec/`: 项目约束与可执行规范

## 文档

- [开发说明](docs/development.md)
- [飞书 OAuth 配置](docs/oauth-setup.md)
- [排障记录](docs/troubleshooting.md)

## 构建与发布

本地安装或 BRAT 发布都依赖根目录的三个产物：

- `manifest.json`
- `main.js`
- `styles.css`

正式构建：

```bash
npm run build
```

## 当前已知边界

- 增量同步状态当前会持久化到插件数据中，插件重载后仍可继续跳过未改动文件。
- `appSecret`、`userAccessToken`、`refreshToken` 仍保存在本地插件数据中，后续可以迁到更专门的 secret storage。
- 自动同步、定时同步和更完整的同步回执仍待后续扩展。
