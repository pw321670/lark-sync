# Obsidian 飞书同步插件

这是一个正在迁移中的 Obsidian 到飞书的同步项目。

该仓库目前包含两个层级：

- 传统独立脚本：
  - `auth.js` 引导飞书 OAuth 并将令牌写入 `config.json`
  - `sync.js` 扫描本地保险库并将更改的文件上传到飞书云空间
- 新的 Obsidian 插件脚手架：
  - `manifest.json`、`package.json`、`tsconfig.json`、`esbuild.config.mjs`
  - `src/` 包含第一个插件外壳、设置模型、状态 UI 和迁移安全的共享助手

## 当前状态

- 独立脚本仍然是认证和远程同步行为的权威来源
- 插件脚手架是未来迁移工作的新入口点
- 第一个脚手架尚未在 Obsidian 内执行完整的飞书 OAuth 和上传流程
- 它提供了插件设置、状态栏项目和本地同步范围预览命令

## 传统独立脚本使用方法

1. 将 `config.example.json` 复制为 `config.json`
2. 填写您的飞书应用凭据和根文件夹令牌
3. 运行 `node auth.js`
4. 运行 `node sync.js`

## 推荐的本地插件开发流程

使用仓库本身作为插件目录的真实来源，然后通过 Windows 联结点将其挂载到保险库中。

推荐布局：

```text
D:\projects\sync-obsidian-feishu\          <- 源仓库和构建输出
D:\OneDrive\test\.obsidian\plugins\
  sync-obsidian-feishu\                    <- 指向仓库根目录的联结点
```

为什么使用这种布局：

- 您只需在 `D:\projects\sync-obsidian-feishu` 中编辑代码
- `npm run dev` 会就地重新构建 `main.js`
- Obsidian 通过保险库插件目录加载相同的文件
- 开发过程中无需手动复制循环

### 一次性设置

1. 安装依赖：

```bash
npm install
```

2. 显式创建保险库链接：

```bash
npm run vault:link -- -VaultPath "D:\OneDrive\test"
```

可选的便捷设置：

- 将 `dev-vault.example.json` 复制为 `dev-vault.json`
- 更改 `vaultPath`
- 然后 `npm run vault:link` 和 `npm run vault:status` 可以无需额外参数运行

3. 检查链接：

```bash
npm run vault:status -- -VaultPath "D:\OneDrive\test"
```

### 日常开发循环

1. 启动监视模式：

```bash
npm run dev
```

2. 使用测试保险库打开 Obsidian

3. 在 Obsidian 中：
   - 打开 `设置 -> 社区插件`
   - 如需要，禁用安全模式
   - 启用 `Sync Obsidian to Feishu`

4. 每次代码更改后：
   - 如果您使用热重载，让它自动重新加载
   - 否则禁用/启用插件或手动重新加载 Obsidian

## 构建一次

```bash
npm run build
```

## 重要的本地文件

- `config.json`：仅限本地的独立运行时配置
- `state.json`：仅限本地的独立增量同步状态
- `dev-vault.json`：仅限本地的保险库链接助手配置
- Obsidian 保存的插件数据：仅限本地的插件设置和运行时元数据

请勿提交密钥或运行时状态。