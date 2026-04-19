#!/usr/bin/env node

/**
 * 快速测试配置验证脚本
 * 用于验证飞书 API 集成的基本配置是否正确
 */

const https = require('https');

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',     // 蓝色
    success: '\x1b[32m',  // 绿色
    warning: '\x1b[33m',  // 黄色
    error: '\x1b[31m',    // 红色
    reset: '\x1b[0m'      // 重置
  };

  const color = colors[type] || colors.info;
  console.log(`${color}${message}${colors.reset}`);
}

function validateEnv() {
  log('=== 环境变量验证 ===\n');

  const token = process.env.FEISHU_ACCESS_TOKEN;
  const docId = process.env.FEISHU_DOC_ID;

  if (!token || token === 'YOUR_ACCESS_TOKEN_HERE') {
    log('❌ FEISHU_ACCESS_TOKEN 未设置', 'error');
    log('请设置环境变量: export FEISHU_ACCESS_TOKEN="your_token"', 'info');
    return false;
  }

  if (token.length < 100) {
    log('❌ FEISHU_ACCESS_TOKEN 格式不正确（太短）', 'error');
    return false;
  }

  log('✅ FEISHU_ACCESS_TOKEN 已设置', 'success');

  if (!docId || docId === 'YOUR_DOC_ID_HERE') {
    log('⚠️  FEISHU_DOC_ID 未设置', 'warning');
    log('可以跳过文档测试，但建议设置以进行完整测试', 'info');
    return true;
  }

  if (docId.length !== 25) {
    log('❌ FEISHU_DOC_ID 格式不正确（应为25位字符串）', 'error');
    return false;
  }

  log('✅ FEISHU_DOC_ID 已设置', 'success');
  return true;
}

function testTokenFormat(token) {
  log('\n=== Token 格式验证 ===\n');

  // 检查 JWT 格式
  const parts = token.split('.');
  if (parts.length !== 3) {
    log('❌ Token 不是有效的 JWT 格式', 'error');
    return false;
  }

  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    log('✅ Token header 解析成功', 'success');
    log(`   算法: ${header.alg}`, 'info');
    log(`   类型: ${header.typ}`, 'info');
  } catch (e) {
    log('❌ Token header 解析失败', 'error');
    return false;
  }

  return true;
}

async function testApiConnection(token) {
  log('\n=== API 连接测试 ===\n');

  return new Promise((resolve) => {
    const options = {
      hostname: 'open.feishu.cn',
      port: 443,
      path: '/open-apis/docx/v1/documents',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      timeout: 10000,
    };

    const testData = JSON.stringify({
      title: '配置验证测试',
    });

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            if (result.code === 0) {
              log('✅ API 连接成功', 'success');
              log(`   创建了测试文档: ${result.data.document.document_id}`, 'info');
              resolve(true);
            } else {
              log(`❌ API 返回错误: code=${result.code}, msg=${result.msg}`, 'error');
              resolve(false);
            }
          } catch (e) {
            log('❌ 响应解析失败', 'error');
            log(`   响应内容: ${data.substring(0, 100)}...`, 'info');
            resolve(false);
          }
        } else {
          log(`❌ HTTP 错误: status=${res.statusCode}`, 'error');
          log(`   响应: ${data.substring(0, 100)}...`, 'info');
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      log(`❌ 网络错误: ${error.message}`, 'error');
      resolve(false);
    });

    req.on('timeout', () => {
      log('❌ 请求超时', 'error');
      req.destroy();
      resolve(false);
    });

    req.write(testData);
    req.end();
  });
}

async function main() {
  console.log('\n🔍 飞书 API 配置验证工具\n');

  // 验证环境变量
  if (!validateEnv()) {
    log('\n❌ 配置验证失败，请检查环境变量设置', 'error');
    process.exit(1);
  }

  const token = process.env.FEISHU_ACCESS_TOKEN;

  // 验证 token 格式
  if (!testTokenFormat(token)) {
    log('\n❌ Token 格式验证失败', 'error');
    process.exit(1);
  }

  // 测试 API 连接
  const apiOk = await testApiConnection(token);

  // 总结
  log('\n=== 验证结果总结 ===\n');

  if (apiOk) {
    log('🎉 所有验证通过！配置正确，可以开始测试', 'success');
    log('\n下一步:', 'info');
    log('  1. 使用完整测试脚本: test/scripts/test-feishu-api.template.cjs', 'info');
    log('  2. 在 Obsidian 中测试插件功能', 'info');
    log('  3. 查看测试文档: docs/api-testing.md', 'info');
  } else {
    log('⚠️  部分验证失败，请检查配置', 'warning');
    log('\n常见问题:', 'info');
    log('  1. Access token 过期 → 在插件设置中重新授权', 'info');
    log('  2. OAuth 权限不足 → 确保包含 docx:document 权限', 'info');
    log('  3. 网络问题 → 检查网络连接和代理设置', 'info');
    log('  4. 查看详细文档: docs/api-testing.md', 'info');
  }
}

main().catch((error) => {
  console.error('验证过程出错:', error);
  process.exit(1);
});