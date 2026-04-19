const https = require('https');

// 从环境变量或配置文件中获取 credentials
const ACCESS_TOKEN = process.env.FEISHU_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN_HERE';
const DOC_ID = process.env.FEISHU_DOC_ID || 'YOUR_DOC_ID_HERE';

function testCreateBlock() {
  const data = JSON.stringify({
    children: [
      {
        block_type: 2,
        text: {
          elements: [
            {
              type: 'text_run',
              text_run: {
                content: 'Test content',
                style: {}
              }
            }
          ]
        }
      }
    ],
    index: 0
  });

  const options = {
    hostname: 'open.feishu.cn',
    port: 443,
    path: `/open-apis/docx/v1/documents/${DOC_ID}/blocks/${DOC_ID}/children`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': data.length
    }
  };

  console.log('Testing Feishu API - Create Block');
  console.log('==================================');
  console.log('URL:', `https://${options.hostname}${options.path}`);
  console.log('Request body:', data);
  console.log('');

  const req = https.request(options, (res) => {
    console.log('Response status:', res.statusCode);
    console.log('Response headers:', JSON.stringify(res.headers, null, 2));

    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      console.log('Response body:', responseData);
      try {
        const jsonResponse = JSON.parse(responseData);
        console.log('Parsed JSON:', JSON.stringify(jsonResponse, null, 2));
      } catch (e) {
        console.log('Failed to parse JSON');
      }
    });
  });

  req.on('error', (error) => {
    console.error('Error:', error);
  });

  req.write(data);
  req.end();
}

testCreateBlock();
