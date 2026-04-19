#!/bin/bash

# 从环境变量获取 credentials
ACCESS_TOKEN="${FEISHU_ACCESS_TOKEN:-YOUR_ACCESS_TOKEN_HERE}"
DOC_ID="${FEISHU_DOC_ID:-YOUR_DOC_ID_HERE}"

echo "Testing Feishu API - Create Block"
echo "=================================="
echo ""

# 测试 1: 最简单的请求（只有 block_type）
echo "Test 1: Minimal request (only block_type)"
curl -X POST \
  "https://open.feishu.cn/open-apis/docx/v1/documents/${DOC_ID}/blocks/${DOC_ID}/children" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "children": [
      {
        "block_type": 2,
        "text": {
          "elements": [
            {
              "type": "text_run",
              "text_run": {
                "content": "Test"
              }
            }
          ]
        }
      }
    ],
    "index": 0
  }' \
  -v

echo ""
echo ""
echo "=================================="
