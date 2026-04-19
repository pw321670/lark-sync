# API 测试指南

本文档说明如何测试和验证飞书 API 集成功能。

## 🎯 测试目标

- 验证飞书 API 调用格式正确性
- 测试 OAuth 权限配置
- 调试 API 响应问题
- 验证文档创建功能

## 🔧 测试准备

### 1. 获取测试凭证

1. **Access Token**:
   - 在 Obsidian 插件设置中点击 "Authorize" 完成授权
   - 从 `data.json` 中复制 `userAccessToken` 字段

2. **文档 ID**:
   - 使用插件创建一个测试文档
   - 从日志中复制 `docId`，格式如 `UUnodDnS7oCgiJxOupfcr0LDnsb`

### 2. 环境变量设置

```bash
# Linux/macOS
export FEISHU_ACCESS_TOKEN="your_token_here"
export FEISHU_DOC_ID="your_doc_id_here"

# Windows PowerShell
$env:FEISHU_ACCESS_TOKEN="your_token_here"
$env:FEISHU_DOC_ID="your_doc_id_here"

# Windows CMD
set FEISHU_ACCESS_TOKEN=your_token_here
set FEISHU_DOC_ID=your_doc_id_here
```

## 🧪 测试脚本使用

### Bash 测试

位于 `test/scripts/test-api-call.template.sh`

```bash
cd test/scripts
bash test-api-call.template.sh
```

**预期输出**:
- HTTP 状态码 200
- 响应包含 `code: 0`
- 创建的块信息

### Node.js 测试

位于 `test/scripts/test-feishu-api.template.cjs`

```bash
cd test/scripts
node test-feishu-api.template.cjs
```

**预期输出**:
- 详细的请求和响应信息
- JSON 格式的响应解析结果

## 🐛 常见问题调试

### HTTP 400 - Bad Request

**可能原因**:
1. OAuth 权限不足
   - 检查方法: 查看插件设置中的权限状态
   - 解决方案: 重新授权，确保包含 `docx:document` 和 `docx:document:write_only`

2. API 格式错误
   - 检查方法: 查看请求体格式
   - 解决方案: 确保使用数字 `block_type` 和下划线字段名

3. 文档 ID 无效
   - 检查方法: 确认文档 ID 格式正确
   - 解决方案: 使用插件创建的新文档 ID

### HTTP 401 - Unauthorized

**可能原因**:
1. Access token 过期
   - 解决方案: 在插件设置中重新授权

2. Token 格式错误
   - 检查方法: 确认包含 `Bearer` 前缀
   - 解决方案: 使用 `Authorization: Bearer ${token}` 格式

### HTTP 403 - Forbidden

**可能原因**:
1. 应用权限不足
   - 解决方案: 在飞书开放平台检查应用权限配置

2. Token 权限范围不够
   - 解决方案: 重新授权，确保包含所需 scope

## 📋 验证清单

测试飞书文档创建功能时，请验证以下项目：

- [ ] Access token 未过期
- [ ] 包含正确的 OAuth scope（`docx:document`, `docx:document:write_only`）
- [ ] 文档 ID 格式正确（25位字符串）
- [ ] API 请求格式正确（`block_type` 为数字，字段名为下划线）
- [ ] 使用 `requestUrl` API（在 Obsidian 中）而非 `fetch`
- [ ] 响应状态码为 200 且 `code` 为 0

## 🔍 日志分析

### 正常成功的日志模式

```
[FeishuDocClient] 创建空文档响应: {status: 200, ...}
[FeishuDocClient] 添加块响应: {status: 200, ...}
[FeishuDocClient] 文档创建完成: {docId: '...', docUrl: '...'}
```

### 异常失败的日志模式

```
[FeishuDocClient] 添加块 HTTP 错误详情: {errorStatus: 400, ...}
[FeishuDocClient] 文档创建失败: {error: 'Request failed, status 400'}
```

## 🛡️ 安全最佳实践

1. **不要提交敏感信息**: 将真实 token 替换为占位符后再提交
2. **使用环境变量**: 通过环境变量传递敏感信息
3. **及时清理**: 测试完成后清理本地环境变量
4. **专用测试账户**: 建议使用专门的测试账户和测试空间

## 📚 相关资源

- [飞书开放平台文档](https://open.feishu.cn/document/server-docs/docs/docs-docx-v1/document/create)
- [OAuth 设置指南](./oauth-setup.md)
- [故障排除指南](./troubleshooting.md)
- [测试文件 README](../test/README.md)
