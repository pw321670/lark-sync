# Lark Sync

Lark Sync 是一个桌面端 Obsidian 插件，用来把当前 vault 里的笔记和文件同步到飞书 / Lark 云空间。

它适合这样的场景：

- 你主要在 Obsidian 里写 Markdown，但希望在飞书里也能看到一份在线文档。
- 你想把一个 vault 或 vault 中的某个文件夹同步成飞书云空间里的同样目录结构。
- 你希望后续同步只处理改动过的文件，而不是每次全量重传。

当前版本是桌面端优先的 Obsidian 插件，不再维护 standalone 脚本入口。

## 功能概览

- 手动触发同步当前 vault。
- 通过飞书 OAuth 授权，不需要手工粘贴 access token。
- 保持 Obsidian 的文件夹层级，在飞书目标文件夹下创建对应目录。
- Markdown 默认同步为飞书在线文档，也可以切换为普通 `.md` 文件上传。
- 普通文件按原文件上传，例如图片、PDF、附件等。
- 支持排除或只包含指定路径。
- 支持增量同步：未变化且已有远端身份的文件会跳过。
- 同步过程中在 Obsidian 底部状态栏显示进度。
- 内置飞书限频保护：请求级重试、共享限速器、遇到真实限频时自动等待。

## 安装方式

### 方式一：用 BRAT 安装

这是给普通用户最方便的方式。

1. 在 Obsidian 打开 `Settings -> Community plugins`。
2. 关闭 `Restricted mode`。
3. 搜索并安装 `BRAT` 插件。
4. 启用 `BRAT`。
5. 打开 `BRAT` 设置。
6. 点击 `Add Beta plugin`。
7. 输入仓库地址：

```text
https://github.com/pw321670/lark-sync
```

8. 安装完成后，回到 `Community plugins`，启用 `Lark Sync`。

如果 BRAT 提示找不到文件，请确认 GitHub 仓库里已经有这三个文件：

- `manifest.json`
- `main.js`
- `styles.css`

### 方式二：手动安装

1. 在你的 vault 里打开插件目录：

```text
<你的 vault>/.obsidian/plugins/
```

2. 新建文件夹：

```text
lark-sync
```

3. 把下面三个文件放进去：

```text
manifest.json
main.js
styles.css
```

4. 重启 Obsidian，或者刷新插件列表。
5. 在 `Settings -> Community plugins` 里启用 `Lark Sync`。

### 方式三：本地开发安装

适合你要改代码或自己打包。

```bash
npm install
npm run build
```

构建产物会写到仓库根目录：

- `main.js`
- `manifest.json`
- `styles.css`

开发时可以把仓库目录链接到测试 vault：

```text
<vault>/.obsidian/plugins/lark-sync -> <repo-root>
```

然后运行：

```bash
npm run dev
```

每次改完代码后，在 Obsidian 里重新加载插件。

## 第一次使用：准备飞书应用

同步前需要准备一个飞书开放平台应用。插件需要用这个应用完成授权，并把文件写入你的飞书云空间。

### 1. 创建飞书应用

1. 打开飞书开放平台。
2. 创建一个自建应用。
3. 进入应用后台，找到应用凭证。
4. 记录这两个值：

```text
App ID
App Secret
```

`App ID` 通常长得像：

```text
cli_xxxxxxxxxxxxxxxx
```

### 2. 配置 OAuth 回调地址

在飞书应用后台添加 OAuth 重定向地址：

```text
http://127.0.0.1:3333/callback
```

这个地址必须和插件设置里的 `Redirect URI` 完全一致。建议使用 `127.0.0.1`，不要一边写 `localhost`，另一边写 `127.0.0.1`。

### 3. 开通权限

至少需要这些权限概念：

- 读写云空间文件。
- 读取云空间文件夹内容。
- 创建 / 更新飞书新版文档。
- 获取 refresh token，用于后续刷新授权。

当前代码请求的 scope 包括：

```text
offline_access
drive:drive
drive:drive:readonly
docx:document
docx:document:write_only
```

飞书后台的权限名称可能会用中文展示，可以按 `drive`、`docx`、`document` 等关键词搜索。权限修改后，通常需要发布或重新启用应用，并在插件里重新授权。

### 4. 获取目标文件夹 token

在飞书云空间里找到你想同步到的目标文件夹。

推荐按这个方式复制：

1. 在飞书里右键目标文件夹。
2. 选择复制链接。
3. 把链接粘贴到浏览器并打开。
4. 从浏览器地址栏里复制 `/drive/folder/` 后面的最后一段字符串。

例如浏览器地址是：

```text
https://mcnqbcqdhxju.feishu.cn/drive/folder/SFWFfrCAzlpTcidrkxxxxxxxxxxxx
```

那么插件里 `Root Folder Token` 要填写的是：

```text
NTWFfrCANlpTcidrkxxxxxxxxxxxx
```

注意：不要填写完整 URL，只填写 `/drive/folder/` 后面的 token 字符串。

建议第一次测试时先新建一个空文件夹，例如：

```text
Obsidian Sync Test
```

确认流程没问题后，再同步正式目录。

## 配置插件

打开 Obsidian：

```text
Settings -> Community plugins -> Lark Sync -> Options
```

### Feishu App

填写这些字段：

| 设置项 | 怎么填 |
|---|---|
| `App ID` | 飞书应用后台的 App ID |
| `App Secret` | 飞书应用后台的 App Secret |
| `Root Folder Token` | 飞书目标文件夹 token |
| `Redirect URI` | 默认保持 `http://127.0.0.1:3333/callback` |

填好后点击 `Authorize`。

授权时会打开浏览器。你确认授权后，浏览器会跳回本地回调地址，插件会保存授权状态。成功后设置页会显示授权时间和权限信息。

如果你改了 `App ID`、`App Secret`、`Redirect URI` 或飞书权限，请点击 `Re-authorize` 重新授权。

### Sync Strategy

#### Markdown file sync mode

推荐保持默认：

```text
Create as online documents
```

这会把 `.md` 文件创建为飞书在线文档。后续修改同一个 Markdown 文件时，插件会优先更新同一个飞书文档，而不是不断创建重复文档。

另一个选项是：

```text
Upload as files
```

这会把 `.md` 当作普通文件上传到飞书，飞书里看到的是 `.md` 文件，不是在线文档。

#### Sync mode

当前建议使用：

```text
Manual only
```

插件现在的稳定入口是手动同步。设置里可能能看到 `Auto sync` 或 `Scheduled sync`，但请不要依赖它们作为主要同步方式，除非你确认当前版本已经接入自动触发。

#### File match mode

有两种模式：

```text
Exclude listed paths
```

同步所有文件，但跳过列表里的路径。

```text
Include listed paths only
```

只同步列表里的路径。

路径规则使用 vault 相对路径，并使用 `/` 作为分隔符。例如：

```text
20-项目
20-项目/客户A
00-inbox/inbox.md
```

重要：当前匹配逻辑是“完整路径或文件夹前缀匹配”，不是真正的 glob。也就是说，`*.tmp` 这种通配写法不要当作可靠规则使用。

默认排除项包括：

```text
.trash
.obsidian/workspace.json
.obsidian/workspaces.json
```

#### Max upload size

超过这个大小的文件会被跳过，不会上传。默认是：

```text
20 MB
```

当前插件还没有实现大文件分片上传。

### Advanced

一般用户可以保持默认。

| 设置项 | 默认值 | 说明 |
|---|---:|---|
| `Concurrent uploads` | `3` | 普通文件最多并行上传几个。Markdown 在线文档为了稳定通常串行处理。 |
| `Retry attempts` | `3` | 单个飞书 API 请求最多尝试几次，不是整个文件上传链路重放几次。 |
| `Retry delay` | `1000 ms` | 普通请求失败后再次请求前等待多久。 |
| `Log level` | `info` | 控制运行日志详细程度。 |

如果你经常遇到飞书限频，可以先把 `Concurrent uploads` 调低，例如改成 `1` 或 `2`。

## 执行同步

### 1. 预览同步范围

打开命令面板：

```text
Ctrl/Cmd + P
```

运行：

```text
Preview Lark Sync scope
```

插件会告诉你：

- 扫描到多少文件。
- 有多少候选文件会同步。
- 有多少文件被排除。
- 有多少文件因为超过大小限制被跳过。

第一次配置时强烈建议先预览，确认范围没问题再正式同步。

### 2. 开始同步

有两种方式：

- 点击 Obsidian 左侧 ribbon 上的 Lark Sync 图标。
- 命令面板运行 `Start Lark Sync`。

同步开始后，底部状态栏会显示类似：

```text
Lark Sync: docs 3/13 uploading | 144/253 files | 25 uploaded | 119 skipped
```

含义是：

- `docs 3/13 uploading`：正在处理 Markdown 在线文档通道的第 3 个批次，共 13 个批次。
- `144/253 files`：当前已经处理 144 个候选文件，总共 253 个候选文件。
- `25 uploaded`：本轮实际上传或更新成功 25 个。
- `119 skipped`：本轮判断无需重新上传 119 个。

如果看到：

```text
rate limited, retry in 8s
```

表示飞书返回了限频信号，插件正在等待后继续同步。这不是卡死。

### 3. 取消同步

打开命令面板，运行：

```text
Cancel Lark Sync
```

取消是协作式的：已经发出的飞书请求不会强行中断，但后续批次会尽快停止。

### 4. 查看上次同步结果

命令面板运行：

```text
Show last Lark Sync summary
```

或者在插件设置页的 `Status` 区域查看 `Last sync`。

## 同步结果会是什么样

假设你的 Obsidian vault 里有：

```text
20-项目/
  客户A/
    会议记录.md
    附件.pdf
  项目计划.md
```

同步到飞书后，大致会变成：

```text
Root Folder Token 指向的飞书文件夹/
  20-项目/
    客户A/
      会议记录    # 飞书在线文档，默认模式
      附件.pdf    # 普通文件
    项目计划      # 飞书在线文档，默认模式
```

如果 Markdown 模式改成 `Upload as files`，那么飞书里会看到：

```text
会议记录.md
项目计划.md
```

## 增量同步规则

插件会在本地插件数据里记录同步状态。核心字段包括：

- vault 相对路径。
- 文件大小。
- 文件修改时间。
- 远端对象类型和 token。

下一次同步时：

- 文件大小和修改时间没变，并且本地记录里有可信的远端 token，就会跳过。
- 文件变了，会重新上传或更新。
- Markdown 在线文档会优先更新原来的飞书文档。
- 普通文件目前采用“删除同名远端文件，再上传新文件”的策略。

如果你从旧版本升级，第一次同步可能会重新上传一些普通文件。这是为了补齐旧状态里缺失的远端 file token，后续再同步就会更准确地跳过。

## 技术流程

一次手动同步大致会经过这些步骤：

1. 插件读取本地配置和授权状态。
2. 如果 access token 过期，先用 refresh token 刷新。
3. 通过 Obsidian API 扫描当前 vault 的文件列表。
4. 把路径统一成 vault 相对路径，例如 `Folder/Note.md`。
5. 根据 include / exclude 规则过滤文件。
6. 跳过超过 `Max upload size` 的文件。
7. 和本地 `syncState` 对比，找出需要上传或修复远端身份的文件。
8. 按本地目录结构在飞书里创建缺失文件夹。
9. 读取飞书文件夹内容时会分页获取，并在本轮同步中缓存，避免重复 list 请求。
10. 把文件分成两个通道：
    - `documents`：Markdown 在线文档，串行处理。
    - `files`：普通文件，按 `Concurrent uploads` 并行处理。
11. 所有飞书 API 请求共用一个限速器，降低 `99991400` 或 HTTP `429` 限频概率。
12. 如果飞书真的限频，插件会记录限频信号，让后续请求一起等待，而不是每个请求各自乱撞。
13. 上传成功后才写入本地同步状态。
14. 最后更新 Notice、ribbon 状态和底部状态栏。

简化成图就是：

```text
Obsidian vault
  -> scan files
  -> filter by sync rules
  -> compare syncState
  -> ensure Feishu folders
  -> upload Markdown docs / regular files
  -> save syncState
  -> show summary
```

## 常见问题

### 授权失败

优先检查：

- 飞书后台的 OAuth 回调地址是否完全等于 `http://127.0.0.1:3333/callback`。
- 插件设置里的 `Redirect URI` 是否完全一致。
- `App ID` 和 `App Secret` 是否来自同一个飞书应用。
- 权限修改后是否已经发布或启用应用。

### 提示缺少配置

请检查这些字段是否为空：

- `App ID`
- `App Secret`
- `Root Folder Token`
- `Redirect URI`

### 飞书里没有看到所有文件

先确认：

- 是否设置了 `Include listed paths only`，但 include 列表没包含目标目录。
- 文件是否超过 `Max upload size`。
- 文件是否在 exclude 列表里。
- 同步是否出现 failed，而不是 success。

如果是旧版本升级后第一次同步，建议再跑一次。当前版本会为普通文件补齐远端 token，第一次可能是在修复历史状态。

### 状态栏一直显示 retry in Ns

这是飞书限频后的等待。通常等它自动继续即可。

如果经常出现：

- 把 `Concurrent uploads` 调低到 `1` 或 `2`。
- 分几次同步大目录。
- 避免短时间内反复点击同步。

### Markdown 在飞书里不是 `.md` 文件

这是默认行为。默认 `Markdown file sync mode` 是：

```text
Create as online documents
```

如果你想保留 `.md` 文件形式，请改成：

```text
Upload as files
```

### 我删除了本地文件，飞书会自动删除吗

当前不会。

插件目前主要处理本地存在的文件：新增、修改、跳过。它不会把本地删除自动同步成远端删除。

### 我在飞书里手动改了在线文档，会怎样

如果对应的本地 Markdown 后续发生变化，插件会用本地 Markdown 重新生成文档内容。远端手工改动可能被覆盖。

建议把 Obsidian 作为主要编辑源，把飞书作为阅读、分享和协作查看端。

## 当前限制

- 仅支持 Obsidian 桌面端。
- 不是双向同步。
- 不会自动删除远端已经不存在于本地的文件。
- 大于 `Max upload size` 的文件会跳过，当前没有分片上传。
- Markdown 在线文档更新是重建内容块，不是细粒度 block patch。
- secrets 和 token 当前保存在本地插件数据中，还没有迁移到专用 secret storage。
- 自动同步和定时同步还不是推荐主路径。

## 仓库结构

```text
lark-sync/
  manifest.json
  main.js
  styles.css
  package.json
  src/
    main.ts
    oauth/
    settings/
    sync/
    ui/
    utils/
  docs/
  config/
  .trellis/spec/
```

主要目录说明：

- `src/main.ts`：Obsidian 插件入口，负责加载设置、注册命令、授权和启动同步。
- `src/oauth/`：飞书 OAuth、token 刷新和本地授权状态。
- `src/settings/`：插件设置页。
- `src/sync/`：扫描、过滤、创建文件夹、上传、限频、同步状态。
- `src/ui/`：ribbon 图标、Notice、状态栏和命令。
- `src/utils/`：配置默认值、数据合并、路径规则和预览逻辑。
- `.trellis/spec/`：项目开发规范和实现契约。

## 构建发布

正式构建：

```bash
npm run build
```

发布或安装时至少需要仓库根目录下的：

```text
manifest.json
main.js
styles.css
```

如果你把代码推到 GitHub 后想用 BRAT 安装，请确保这三个文件也已经提交并推送。
