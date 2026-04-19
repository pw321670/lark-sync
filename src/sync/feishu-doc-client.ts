import { requestUrl } from 'obsidian';

/**
 * 飞书文档块类型（数字格式）
 * 参考文档：https://open.feishu.cn/document/server-docs/docs/docs-docx-v1/document-block/create
 */
enum BlockType {
  Page = 1,
  Text = 2,
  Heading1 = 3,
  Heading2 = 4,
  Heading3 = 5,
  Heading4 = 6,
  Heading5 = 7,
  Heading6 = 8,
  Bullet = 12,
  Ordered = 13,
  Code = 15,
  Quote = 17,
  Todo = 18,
  Divider = 19,
  Table = 22,
  View = 23,
}

/**
 * 飞书文档块元素
 */
interface BlockElement {
  type: BlockType;
  // 文本块的内容
  text_run?: {
    content: string;
    elements?: Array<{
      type: 'text_run' | 'mention_user' | 'mention_doc' | 'file' | 'emoji';
      text_run?: {
        content: string;
        style?: Record<string, unknown>;
      };
    }>;
  };
  // 代码块的内容
  code?: {
    language: string;
    style?: Record<string, unknown>;
    elements: Array<{
      type: 'run';
      code_run: {
        language: string;
        content: string;
      };
    }>;
  };
  // 其他块类型的内容...
}

/**
 * 创建块请求
 */
interface CreateBlockRequest {
  children: Array<{
    block_type: number;
    [key: string]: unknown;
  }>;
  index?: number;
}

/**
 * 创建块响应
 */
interface CreateBlockResponse {
  code: number;
  msg: string;
  data?: {
    items?: Array<{
      block_type: number;
      block_id: string;
      parent_id: string;
    }>;
  };
}

/**
 * 创建文档请求
 */
interface CreateDocumentRequest {
  title: string;
  folder_token?: string;
}

/**
 * 创建文档响应
 */
interface CreateDocumentResponse {
  code: number;
  msg: string;
  data?: {
    document?: {
      document_id: string;
      revision_id: number;
      title: string;
    };
  };
}

export interface CreateDocumentOptions {
  parentFolderToken?: string;
}

export interface CreateDocumentResult {
  docId: string;
  docUrl: string;
}

export interface UpdateDocumentOptions {
  // 未来扩展：文档更新选项
}

/**
 * 飞书在线文档客户端（API 版本）
 * 使用飞书官方 API 创建和更新飞书在线文档
 *
 * 参考文档：
 * - 创建文档：https://open.feishu.cn/document/server-docs/docs/docs-docx-v1/document/create
 * - 创建块：https://open.feishu.cn/document/server-docs/docs/docs-docx-v1/document-block/create
 */
export class FeishuDocClient {
  constructor(private readonly userAccessToken: string) {}

  /**
   * 检查可用性（API 模式总是可用）
   */
  async checkAvailability(): Promise<boolean> {
    return true;
  }

  /**
   * 创建飞书在线文档
   * @param title 文档标题
   * @param markdownContent Markdown 格式的文档内容
   * @param options 创建选项
   * @returns 文档 ID 和 URL
   */
  async createDocument(
    title: string,
    markdownContent: string,
    options?: CreateDocumentOptions,
  ): Promise<CreateDocumentResult> {
    console.log('[FeishuDocClient] 准备创建文档:', {
      title,
      contentLength: markdownContent.length,
      parentFolderToken: options?.parentFolderToken,
    });

    try {
      // 步骤 1: 创建空文档
      const docId = await this.createEmptyDocument(title, options?.parentFolderToken);
      console.log('[FeishuDocClient] 空文档创建成功:', { docId, title });

      // 步骤 2: 将 Markdown 转换为文档块
      const blocks = this.convertMarkdownToBlocks(markdownContent);
      console.log('[FeishuDocClient] Markdown 转换完成，生成块数:', blocks.length);
      console.log('[FeishuDocClient] 生成的块结构:', JSON.stringify(blocks, null, 2));

      // 步骤 3: 批量添加块到文档
      if (blocks.length > 0) {
        await this.addBlocksToDocument(docId, docId, blocks);
        console.log('[FeishuDocClient] 内容块添加成功');
      }

      const result: CreateDocumentResult = {
        docId,
        docUrl: `https://www.feishu.cn/docx/${docId}`,
      };

      console.log('[FeishuDocClient] 文档创建完成:', {
        docId: result.docId,
        docUrl: result.docUrl,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[FeishuDocClient] 文档创建失败:', {
        title,
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`创建飞书文档失败 (${title}): ${errorMsg}`);
    }
  }

  /**
   * 创建空文档
   */
  private async createEmptyDocument(title: string, folderToken?: string): Promise<string> {
    const url = 'https://open.feishu.cn/open-apis/docx/v1/documents';

    const requestBody: CreateDocumentRequest = {
      title: title.substring(0, 800), // 标题最长 800 字符
    };

    if (folderToken) {
      requestBody.folder_token = folderToken;
    }

    console.log('[FeishuDocClient] 创建空文档请求:', {
      url,
      body: requestBody,
    });

    let response;
    try {
      response = await requestUrl({
        url,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.userAccessToken}`,
        },
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(requestBody),
      });
    } catch (error: any) {
      console.error('[FeishuDocClient] HTTP 请求失败:', {
        message: error.message,
        status: error.status,
        errorCode: error.errorCode,
        responseText: error.responseText,
      });
      throw error;
    }

    console.log('[FeishuDocClient] 创建空文档响应:', {
      status: response.status,
      text: response.text,
      json: response.json,
    });

    const data = response.json as CreateDocumentResponse;

    if (response.status !== 200) {
      console.error('[FeishuDocClient] 创建空文档失败 - HTTP 错误:', {
        status: response.status,
        responseText: response.text,
        responseJson: data,
      });
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    if (data.code !== 0) {
      console.error('[FeishuDocClient] 创建空文档失败 - API 错误:', {
        code: data.code,
        msg: data.msg,
        fullResponse: data,
      });
      throw new Error(`API 错误 ${data.code}: ${data.msg}`);
    }

    if (!data.data?.document?.document_id) {
      console.error('[FeishuDocClient] 创建空文档失败 - 缺少 document_id:', {
        fullResponse: data,
      });
      throw new Error(`响应中缺少 document_id: ${JSON.stringify(data)}`);
    }

    return data.data.document.document_id;
  }

  /**
   * 添加块到文档
   */
  private async addBlocksToDocument(
    docId: string,
    parentId: string,
    blocks: Array<{ block_type: number; [key: string]: unknown }>,
  ): Promise<void> {
    const url = `https://open.feishu.cn/open-apis/docx/v1/documents/${docId}/blocks/${parentId}/children`;

    // 飞书 API 要求的请求体格式
    const requestBody = {
      children: blocks,
      index: 0,
    };

    console.log('[FeishuDocClient] 添加块请求详情:', {
      url,
      requestBody: JSON.stringify(requestBody, null, 2),
      blocksCount: blocks.length,
      firstBlock: blocks[0],
    });

    let response;
    try {
      response = await requestUrl({
        url,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.userAccessToken}`,
        },
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(requestBody),
      });
    } catch (error: any) {
      console.error('[FeishuDocClient] 添加块 HTTP 错误详情:', {
        errorMessage: error.message,
        errorStatus: error.status,
        errorCode: error.errorCode,
        errorName: error.name,
        errorStack: error.stack,
      });
      throw error;
    }

    console.log('[FeishuDocClient] 添加块响应:', {
      status: response.status,
      statusText: response.text,
      json: response.json,
    });

    const data = response.json as CreateBlockResponse;

    if (response.status !== 200) {
      console.error('[FeishuDocClient] 添加块失败 - HTTP 错误:', {
        status: response.status,
        responseText: response.text,
        responseJson: data,
      });
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    if (data.code !== 0) {
      console.error('[FeishuDocClient] 添加块失败 - API 错误:', {
        code: data.code,
        msg: data.msg,
        fullResponse: data,
      });
      throw new Error(`API 错误 ${data.code}: ${data.msg}`);
    }
  }

  /**
   * 将 Markdown 内容转换为飞书文档块
   * 目前支持基本的 Markdown 语法：
   * - 标题（# ## ### 等）
   * - 文本段落
   * - 无序列表（- 或 *）
   * - 有序列表（1. 2. 等）
   * - 代码块（```）
   * - 引用（>）
   * - 分割线（---）
   */
  private convertMarkdownToBlocks(markdown: string): Array<{ block_type: number; [key: string]: unknown }> {
    const blocks: Array<{ block_type: number; [key: string]: unknown }> = [];
    const lines = markdown.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (!line) {
        i += 1;
        continue;
      }

      const trimmedLine = line.trim();

      // 空行跳过
      if (!trimmedLine) {
        i += 1;
        continue;
      }

      // 代码块
      if (trimmedLine.startsWith('```')) {
        const codeBlock = this.parseCodeBlock(lines, i);
        blocks.push(codeBlock.block);
        i = codeBlock.nextIndex;
        continue;
      }

      // 标题
      if (trimmedLine.startsWith('#')) {
        const headingBlock = this.parseHeading(trimmedLine);
        if (headingBlock) {
          blocks.push(headingBlock);
        }
        i += 1;
        continue;
      }

      // 引用
      if (trimmedLine.startsWith('>')) {
        const quoteText = trimmedLine.substring(1).trim();
        blocks.push(this.createTextBlock(quoteText));
        i += 1;
        continue;
      }

      // 无序列表
      if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
        const listText = trimmedLine.substring(2).trim();
        blocks.push(this.createBulletBlock(listText));
        i += 1;
        continue;
      }

      // 有序列表
      const orderedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
      if (orderedMatch) {
        blocks.push(this.createOrderedBlock(orderedMatch[1]!));
        i += 1;
        continue;
      }

      // 分割线
      if (trimmedLine === '---' || trimmedLine === '***') {
        blocks.push(this.createDividerBlock());
        i += 1;
        continue;
      }

      // 普通文本
      blocks.push(this.createTextBlock(trimmedLine));
      i += 1;
    }

    return blocks;
  }

  /**
   * 解析代码块
   */
  private parseCodeBlock(lines: string[], startIndex: number): { block: { block_type: number; [key: string]: unknown }; nextIndex: number } {
    const firstLine = lines[startIndex];
    if (!firstLine) {
      return {
        block: { block_type: BlockType.Text, text: { elements: [] } },
        nextIndex: startIndex + 1,
      };
    }

    const language = firstLine.substring(3).trim() || 'plain_text';
    const codeLines: string[] = [];

    let i = startIndex + 1;
    while (i < lines.length && !lines[i]!.trim().startsWith('```')) {
      codeLines.push(lines[i]!);
      i += 1;
    }

    const code = codeLines.join('\n');

    return {
      block: {
        block_type: BlockType.Code,
        code: {
          language,
          style: {},
          elements: [
            {
              type: 'run',
              code_run: {
                language,
                content: code,
              },
            },
          ],
        },
      },
      nextIndex: i + 1,
    };
  }

  /**
   * 解析标题
   */
  private parseHeading(line: string): { block_type: number; [key: string]: unknown } | null {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) {
      return null;
    }

    const level = match[1]!.length;
    const text = match[2]!;

    const blockTypeMap: Record<number, number> = {
      1: BlockType.Heading1,
      2: BlockType.Heading2,
      3: BlockType.Heading3,
      4: BlockType.Heading4,
      5: BlockType.Heading5,
      6: BlockType.Heading6,
    };

    const headingType = blockTypeMap[level]!;
    const element = this.createTextRunElement(text);

    return {
      block_type: headingType,
      [headingType]: { elements: [element] },
    };
  }

  /**
   * 创建文本块
   */
  private createTextBlock(text: string): { block_type: number; [key: string]: unknown } {
    return {
      block_type: BlockType.Text,
      text: {
        elements: [this.createTextRunElement(text)],
      },
    };
  }

  /**
   * 创建无序列表块
   */
  private createBulletBlock(text: string): { block_type: number; [key: string]: unknown } {
    return {
      block_type: BlockType.Bullet,
      bullet: {
        elements: [this.createTextRunElement(text)],
      },
    };
  }

  /**
   * 创建有序列表块
   */
  private createOrderedBlock(text: string): { block_type: number; [key: string]: unknown } {
    return {
      block_type: BlockType.Ordered,
      ordered: {
        elements: [this.createTextRunElement(text)],
      },
    };
  }

  /**
   * 创建分割线块
   */
  private createDividerBlock(): { block_type: number; [key: string]: unknown } {
    return {
      block_type: BlockType.Divider,
    };
  }

  /**
   * 创建文本运行元素
   */
  private createTextRunElement(text: string): Record<string, unknown> {
    return {
      type: 'text_run',
      text_run: {
        content: text,
        style: {},
      },
    };
  }

  /**
   * 更新飞书在线文档
   * 注意：此功能暂未实现，保留接口用于未来扩展
   */
  async updateDocument(
    docId: string,
    markdownContent: string,
    options?: UpdateDocumentOptions,
  ): Promise<void> {
    // TODO: 实现文档更新逻辑
    throw new Error('文档更新功能暂未实现，请使用创建文档功能');
  }

  /**
   * 清除可用性缓存（API 模式不需要）
   */
  invalidateAvailabilityCache(): void {
    // API 模式总是可用，无需清除缓存
  }
}
