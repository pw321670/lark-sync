# 测试配置模板说明

本目录包含测试配置模板，用于快速设置测试环境。

## 📁 文件说明

### `api-request.template.json`
飞书文档创建请求的模板配置。

**使用方法**:
1. 复制模板：`cp api-request.template.json my-config.json`
2. 编辑配置，填入实际的 `folder_token`
3. 在测试脚本中引用该配置

**配置字段**:
```json
{
  "title": "测试文档",
  "folder_token": "YOUR_FOLDER_TOKEN_HERE"
}
```

## 🔧 配置步骤

### 1. 准备 Folder Token

在飞书云空间中找到目标文件夹，获取其 token：
- 在飞书云空间中右键点击文件夹
- 选择"复制链接"
- 从链接中提取 `folder_token` 参数（格式：`folder_xxxxxxxxx`）

### 2. 获取 Access Token

**方法 1**: 从 Obsidian 插件数据获取
- 打开 `data.json` 文件
- 复制 `auth.userAccessToken` 字段值

**方法 2**: 从插件设置获取
- 在插件设置中点击"Authorize"完成授权
- 使用开发者工具查看存储的 token

### 3. 运行测试

```bash
# 设置环境变量
export FEISHU_ACCESS_TOKEN="your_token_here"
export FEISHU_DOC_ID="your_doc_id_here"

# 运行测试
cd ../scripts
bash test-api-call.template.sh
```

## ⚠️ 安全提示

- **不要提交包含真实 token 的配置文件**
- **使用 `.template.` 文件作为模板，复制并重命名后使用**
- **测试完成后清理包含敏感信息的临时文件**
- **定期轮换测试 token**

## 🧹 清理测试文件

```bash
# 清理包含敏感信息的临时文件
rm -f my-config.json
rm -f test-api-call.sh
rm -f test-feishu-api.cjs

# 恢复模板文件
git checkout test/
```

## 📝 测试检查清单

运行测试前确认：
- [ ] Access token 有效且未过期
- [ ] 文档 ID 存在且可访问
- [ ] 网络连接正常
- [ ] 有足够的权限创建文档块
