# OAuth 授权修复测试指南

## 📋 测试目的

验证OAuth授权数据保存修复是否有效，确保：
1. 授权数据能够正确保存到插件数据中
2. 授权信息可以通过OneDrive跨设备同步
3. 授权状态检查功能正常工作

## 🚀 测试步骤

### 步骤 1：重新加载插件

1. 在Obsidian中按 `Ctrl+Shift+I` 打开开发者控制台
2. 在控制台中输入并回车：
   ```javascript
   app.plugins.loadManifest('sync-obsidian-feishu').then(() => app.plugins.enablePlugin('sync-obsidian-feishu'))
   ```
3. 或者简单重启Obsidian

### 步骤 2：清除旧授权数据（如果有）

1. 打开命令面板 (`Ctrl/Cmd + P`)
2. 输入 "Feishu"，选择 "Refresh Feishu access token"
3. 检查控制台输出，看是否有错误信息

如果需要重新授权，在控制台执行：
```javascript
app.plugins.plugins['sync-obsidian-feishu'].clearAuthorization()
```

### 步骤 3：执行授权流程

1. 打开命令面板 (`Ctrl/Cmd + P`)
2. 输入 "Feishu"，选择 "Start Feishu authorization"
3. 浏览器会自动打开飞书授权页面
4. 完成授权并关闭浏览器页面
5. 返回Obsidian查看通知消息

### 步骤 4：验证授权数据保存

**方法 1：使用命令检查**
1. 打开命令面板 (`Ctrl/Cmd + P`)
2. 选择 "Check Feishu authorization status"
3. 查看通知消息，应该显示 "✅ 已授权 (授权时间: 具体时间)"

**方法 2：通过控制台检查**
1. 打开开发者控制台 (`Ctrl+Shift+I`)
2. 输入以下代码：
   ```javascript
   const plugin = app.plugins.plugins['sync-obsidian-feishu'];
   const authData = plugin.getPluginData().auth;
   console.log('授权数据:', {
     hasRefreshToken: !!authData.refreshToken,
     hasAccessToken: !!authData.userAccessToken,
     connectedAt: authData.connectedAt,
     refreshTokenLength: authData.refreshToken?.length || 0
   });
   ```
3. 检查输出，应该看到：
   - `hasRefreshToken: true`
   - `hasAccessToken: true`
   - `connectedAt: "2025-04-19T..."`
   - `refreshTokenLength: > 0`

**方法 3：检查状态栏**
1. 查看Obsidian底部状态栏
2. 应该显示 "Feishu Sync: auth saved"

### 步骤 5：验证跨设备同步（如果有OneDrive设置）

1. 等待OneDrive同步完成（通常几分钟）
2. 在另一台设备上打开同一个Obsidian保险库
3. 重复步骤4的检查
4. 应该看到相同的授权状态，无需重新授权

### 步骤 6：测试Token刷新功能

1. 打开命令面板 (`Ctrl/Cmd + P`)
2. 选择 "Refresh Feishu access token"
3. 应该看到 "访问令牌刷新成功！" 的通知
4. 再次检查授权状态，确认仍然有效

## 🔍 调试信息

如果遇到问题，请收集以下信息：

### 控制台日志

在开发者控制台中执行：
```javascript
// 获取详细授权信息
const plugin = app.plugins.plugins['sync-obsidian-feishu'];
console.log('完整插件数据:', plugin.getPluginData());
console.log('OAuth实例:', plugin.oauth ? '已初始化' : '未初始化');

// 检查配置
const config = plugin.getPluginData().config;
console.log('配置检查:', {
  hasAppId: !!config.appId,
  hasAppSecret: !!config.appSecret,
  hasRedirectUri: !!config.redirectUri,
  hasRootFolder: !!config.feishuRootFolderToken
});
```

### 常见问题排查

**问题 1：授权后仍然显示未授权**
- 检查控制台是否有错误信息
- 清除授权后重新执行授权流程
- 确认OneDrive同步已完成

**问题 2：授权失败，提示配置错误**
- 检查设置中的App ID和App Secret是否正确
- 确认飞书应用权限已审核通过
- 检查网络连接

**问题 3：Token刷新失败**
- 检查refreshToken是否存在
- 尝试重新授权
- 查看控制台的具体错误信息

## ✅ 测试成功的标准

如果看到以下结果，说明修复成功：
- ✅ 授权成功通知显示 "✅ 飞书授权完成！可以开始同步了。"
- ✅ 授权状态检查显示 "✅ 已授权 (授权时间: 具体时间)"
- ✅ 控制台显示授权数据完整（refreshToken长度 > 0）
- ✅ 状态栏显示 "Feishu Sync: auth saved"
- ✅ Token刷新功能正常工作

## 🐛 问题反馈

如果测试失败，请记录：
1. 具体的错误消息
2. 控制台的输出信息
3. 执行的步骤和预期结果
4. Obsidian版本和操作系统信息

---

**修复说明**：
- 修复了 `AuthStorage` 对象引用不一致的问题
- 优化了授权流程，避免重复保存和重载
- 确保授权数据正确持久化到插件存储中
