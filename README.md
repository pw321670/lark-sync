# sync-obsidian-feishu

一个用于将 Obsidian 本地资料单向同步到飞书文件库的 Node.js 小工具。

## 文件说明

- `auth.js`：发起飞书 OAuth 授权并写入 `config.json`
- `sync.js`：扫描本地 Obsidian 目录并增量上传到飞书文件库
- `config.example.json`：配置模板

## 使用方式

1. 复制 `config.example.json` 为 `config.json`
2. 按实际情况填写飞书应用信息、本地 Obsidian 路径和飞书根目录 token
3. 执行 `node auth.js` 完成授权
4. 执行 `node sync.js` 开始同步

## 注意事项

- `config.json` 和 `state.json` 已加入 `.gitignore`，避免将密钥和运行状态提交到仓库
- 建议使用 Node.js 18+ 运行本项目
