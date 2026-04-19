# 测试文件说明

本目录包含用于测试飞书 API 集成的脚本和配置模板。

## 📁 目录结构

```
test/
├── fixtures/           # 测试配置模板
│   └── api-request.template.json
├── scripts/            # 测试脚本模板
│   ├── test-api-call.template.sh
│   └── test-feishu-api.template.cjs
└── README.md           # 本文件
```

## 🔧 使用方法

### 1. 准备测试环境

在使用测试脚本之前，需要设置环境变量：

```bash
# 设置 access token（从 data.json 或插件设置中获取）
export FEISHU_ACCESS_TOKEN="your_access_token_here"

# 设置文档 ID（可以是一个已存在的文档 ID）
export FEISHU_DOC_ID="your_document_id_here"
```

### 2. 运行测试脚本

#### Bash 脚本测试
```bash
cd test/scripts
cp test-api-call.template.sh test-api-call.sh
chmod +x test-api-call.sh
./test-api-call.sh
```

#### Node.js 脚本测试
```bash
cd test/scripts
cp test-feishu-api.template.cjs test-feishu-api.cjs
node test-feishu-api.cjs
```

### 3. 使用测试配置

```bash
cd test/fixtures
cp api-request.template.json api-request.json
# 编辑 api-request.json，填入实际的 folder_token
```

## ⚠️ 安全注意事项

1. **不要提交敏感信息**: 永远不要将包含真实 access token 或文档 ID 的文件提交到版本控制
2. **使用模板文件**: 所有 `.template` 文件都是安全的，可以提交
3. **环境变量**: 使用环境变量来传递敏感信息，而不是硬编码在脚本中
4. **测试用文档**: 建议创建专门的测试文档，而不是使用生产文档

## 📝 测试覆盖范围

这些测试脚本主要用于验证：

- ✅ 飞书 API 请求格式正确性
- ✅ OAuth token 有效性
- ✅ 文档块创建功能
- ✅ 错误处理和响应解析

## 🛠️ 故障排除

### HTTP 400 错误
- 检查 OAuth scope 是否包含 `docx:document` 和 `docx:document:write_only`
- 检查 block_type 是否使用数字格式（2, 3, 4...）
- 检查字段名是否使用下划线格式（`text_run`, `code_run`）

### HTTP 401 错误
- 检查 access token 是否过期
- 检查 token 格式是否正确（Bearer token）

### 权限错误
- 确保在 Obsidian 插件设置中重新授权
- 检查飞书开放平台的应用权限配置

## 📚 相关文档

- [飞书文档创建 API](https://open.feishu.cn/document/server-docs/docs/docs-docx-v1/document/create)
- [飞书块创建 API](https://open.feishu.cn/document/server-docs/docs/docs-docx-v1/document-block/create)
- [OAuth 权限配置](../../docs/oauth-setup.md)
- [故障排除指南](../../docs/troubleshooting.md)
