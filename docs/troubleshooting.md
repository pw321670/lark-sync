# 排障记录

## 1. 点击同步后目录创建了，但文件全部上传失败

现象：

- 飞书里能看到目录结构
- 文件一个都没成功
- 控制台出现：

```text
The "path" argument must be of type string. Received undefined
```

原因：

- 之前的插件实现把 Obsidian 的 vault 相对路径当成了本地绝对路径来处理。
- 文件读取层没有统一走 `vault.adapter.readBinary(vault-relative-path)`。
- 结果是同步器能拿到“文件条目”，但真正读取内容时 path 已经失真了。

当前修复：

- `ObsidianFileReader` 统一使用 vault 相对路径读取二进制内容。
- 同步器内部只传标准化后的 vault 路径，不再混用“绝对路径”和“vault 路径”。

## 2. 日志过多，错误重复打印

原因：

- 之前堆了多层实验性同步抽象，很多地方各打各的日志。
- 单次失败会穿过读取层、上传层、协调层重复输出。

当前处理：

- 活跃同步路径已经收敛。
- 删除了未接线的 scanner / filter / worker / progress 层。
- 同步核心日志只保留必要的错误和重试信息。

## 3. 状态栏里一直出现 `Feishu Sync`

原因：

- 旧 UI 层里保留了状态栏实现，即使主入口不再使用，它仍然会把状态文本写到 status bar。

当前处理：

- 已从活跃代码里移除状态栏集成。
- 现在只保留左侧 ribbon 按钮和 Notice 通知。

## 4. 授权已经做过，但同步时 token 还是可能失效

原因：

- 同步开始前如果直接使用旧的 `userAccessToken`，可能会命中过期 token。

当前处理：

- 同步开始前会先通过 OAuth 层拿一次有效 access token。
- 配置更新后会重新初始化 OAuth，避免继续引用旧配置对象。

## 5. 目前还没彻底解决的问题

- 同步状态仍然是内存态，插件重载后不会保留“上次已上传文件”的索引。
- 密钥和 token 还没有迁移到 Obsidian 官方推荐的 `SecretStorage`。
- 还没有自动同步与定时同步。
