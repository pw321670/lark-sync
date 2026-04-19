import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from 'obsidian';

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
  Code = 14,
  Quote = 15,
  Todo = 17,
  Divider = 22,
}

type TextElement = {
  type: 'text_run';
  text_run: {
    content: string;
    style: Record<string, unknown>;
  };
};

type TextBlockContent = {
  elements: TextElement[];
  style?: Record<string, unknown>;
  language?: number;
  wrap?: boolean;
  done?: boolean;
};

type DividerBlockContent = Record<string, never>;

type BlockContentKey =
  | 'text'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'bullet'
  | 'ordered'
  | 'code'
  | 'quote'
  | 'todo'
  | 'divider';

type DocBlock = {
  block_type: number;
} & Partial<Record<BlockContentKey, TextBlockContent | DividerBlockContent>>;

interface ApiEnvelope<T> {
  code: number;
  msg?: string;
  data?: T;
}

interface CreateDocumentData {
  document?: {
    document_id: string;
    revision_id: number;
    title: string;
  };
}

interface DocumentInfoData {
  document?: {
    document_id: string;
    revision_id: number;
    title: string;
  };
}

interface ChildBlockItem {
  block_id: string;
  children?: string[];
  block_type?: number;
  parent_id?: string;
}

interface ChildBlockListData {
  items?: ChildBlockItem[];
  has_more?: boolean;
  page_token?: string;
}

interface BlockMutationData {
  document_revision_id?: number;
  client_token?: string;
  children?: Array<{
    block_id?: string;
    parent_id?: string;
    block_type?: number;
  }>;
}

interface CreateDocumentRequest {
  title: string;
  folder_token?: string;
}

interface CreateBlockRequest {
  children: DocBlock[];
  index?: number;
}

interface DeleteBlockChildrenRequest {
  start_index: number;
  end_index: number;
}

export interface CreateDocumentOptions {
  parentFolderToken?: string;
}

export interface CreateDocumentResult {
  docId: string;
  docUrl: string;
}

export interface UpdateDocumentOptions {
  parentBlockId?: string;
}

export class FeishuDocClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly apiCode?: number,
    readonly apiMessage?: string,
    readonly isMissing = false,
    readonly responseText?: string,
  ) {
    super(message);
    this.name = 'FeishuDocClientError';
  }
}

export class FeishuDocClient {
  private readonly baseUrl = 'https://open.feishu.cn/open-apis/docx/v1';

  constructor(private readonly userAccessToken: string) {}

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async documentExists(docId: string): Promise<boolean> {
    const document = await this.getDocumentInfo(docId);
    return Boolean(document);
  }

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

    const docId = await this.createEmptyDocument(title, options?.parentFolderToken);
    await this.replaceDocumentContent(docId, markdownContent, {
      parentBlockId: docId,
    });

    return {
      docId,
      docUrl: this.buildDocumentUrl(docId),
    };
  }

  async updateDocument(
    docId: string,
    markdownContent: string,
    options?: UpdateDocumentOptions,
  ): Promise<void> {
    const document = await this.getDocumentInfo(docId);
    if (!document) {
      throw new FeishuDocClientError(
        `Document not found: ${docId}`,
        404,
        1770002,
        'not found',
        true,
      );
    }

    await this.replaceDocumentContent(docId, markdownContent, options);
  }

  invalidateAvailabilityCache(): void {}

  private async createEmptyDocument(title: string, folderToken?: string): Promise<string> {
    const payload: CreateDocumentRequest = {
      title: title.substring(0, 800),
    };

    if (folderToken) {
      payload.folder_token = folderToken;
    }

    const data = await this.requestApi<CreateDocumentData>(
      {
        url: `${this.baseUrl}/documents`,
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'Create empty document',
    );

    const docId = data.document?.document_id;
    if (!docId) {
      throw new FeishuDocClientError(
        'Create empty document returned no document_id',
        200,
        undefined,
        undefined,
        false,
      );
    }

    console.log('[FeishuDocClient] 空文档创建成功:', {
      docId,
      title: data.document?.title,
    });

    return docId;
  }

  private async getDocumentInfo(
    docId: string,
  ): Promise<{ documentId: string; revisionId: number; title: string } | null> {
    try {
      const data = await this.requestApi<DocumentInfoData>(
        {
          url: `${this.baseUrl}/documents/${docId}`,
          method: 'GET',
        },
        'Get document info',
      );

      const document = data.document;
      if (!document?.document_id) {
        return null;
      }

      return {
        documentId: document.document_id,
        revisionId: document.revision_id,
        title: document.title,
      };
    } catch (error) {
      if (error instanceof FeishuDocClientError && error.isMissing) {
        return null;
      }

      throw error;
    }
  }

  private async replaceDocumentContent(
    docId: string,
    markdownContent: string,
    options?: UpdateDocumentOptions,
  ): Promise<void> {
    const parentBlockId = options?.parentBlockId ?? docId;
    const existingChildren = await this.listChildBlocks(docId, parentBlockId);

    if (existingChildren.length > 0) {
      await this.deleteChildRange(docId, parentBlockId, 0, existingChildren.length);
      console.log('[FeishuDocClient] 已清空文档旧内容块:', {
        docId,
        removedChildren: existingChildren.length,
      });
    }

    const blocks = this.convertMarkdownToBlocks(markdownContent);
    console.log('[FeishuDocClient] Markdown 转换完成，生成块数:', blocks.length);

    if (blocks.length === 0) {
      return;
    }

    await this.addBlocksToDocument(docId, parentBlockId, blocks);
    console.log('[FeishuDocClient] 内容块添加成功');
  }

  private async listChildBlocks(docId: string, parentId: string): Promise<ChildBlockItem[]> {
    const items: ChildBlockItem[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(`${this.baseUrl}/documents/${docId}/blocks/${parentId}/children`);
      url.searchParams.set('page_size', '500');
      url.searchParams.set('document_revision_id', '-1');

      if (pageToken) {
        url.searchParams.set('page_token', pageToken);
      }

      const data = await this.requestApi<ChildBlockListData>(
        {
          url: url.toString(),
          method: 'GET',
        },
        'List child blocks',
      );

      items.push(...(data.items || []));
      pageToken = data.has_more ? data.page_token : undefined;
    } while (pageToken);

    return items;
  }

  private async deleteChildRange(
    docId: string,
    parentId: string,
    startIndex: number,
    endIndex: number,
  ): Promise<void> {
    const url = new URL(
      `${this.baseUrl}/documents/${docId}/blocks/${parentId}/children/batch_delete`,
    );
    url.searchParams.set('document_revision_id', '-1');

    await this.requestApi<BlockMutationData>(
      {
        url: url.toString(),
        method: 'DELETE',
        body: JSON.stringify({
          start_index: startIndex,
          end_index: endIndex,
        } satisfies DeleteBlockChildrenRequest),
      },
      'Delete child blocks',
    );
  }

  private async addBlocksToDocument(
    docId: string,
    parentId: string,
    blocks: DocBlock[],
  ): Promise<void> {
    await this.requestApi<BlockMutationData>(
      {
        url: `${this.baseUrl}/documents/${docId}/blocks/${parentId}/children`,
        method: 'POST',
        body: JSON.stringify({
          children: blocks,
          index: 0,
        } satisfies CreateBlockRequest),
      },
      'Create document blocks',
    );
  }

  private async requestApi<TData>(
    init: Omit<RequestUrlParam, 'headers' | 'contentType' | 'throw'>,
    action: string,
  ): Promise<TData> {
    const response = await requestUrl({
      ...init,
      throw: false,
      headers: {
        Authorization: `Bearer ${this.userAccessToken}`,
      },
      contentType: 'application/json; charset=utf-8',
    });

    const payload = response.json as ApiEnvelope<TData>;

    if (response.status >= 400) {
      throw this.buildError(action, response, payload);
    }

    if (payload.code !== 0) {
      throw this.buildError(action, response, payload);
    }

    return (payload.data ?? {}) as TData;
  }

  private buildError(
    action: string,
    response: RequestUrlResponse,
    payload?: ApiEnvelope<unknown>,
  ): FeishuDocClientError {
    const apiCode = payload?.code;
    const apiMessage = payload?.msg || response.text;
    const isMissing =
      response.status === 404 || apiCode === 1770002 || apiCode === 1770003;
    const detail = apiCode ? `code=${apiCode}, msg=${apiMessage || 'unknown error'}` : response.text;

    console.error('[FeishuDocClient] 请求失败:', {
      action,
      status: response.status,
      apiCode,
      apiMessage,
      responseText: response.text,
    });

    return new FeishuDocClientError(
      `${action} failed: ${detail || `HTTP ${response.status}`}`,
      response.status,
      apiCode,
      apiMessage,
      isMissing,
      response.text,
    );
  }

  private convertMarkdownToBlocks(markdown: string): DocBlock[] {
    const blocks: DocBlock[] = [];
    const lines = markdown.split('\n');
    let index = 0;

    while (index < lines.length) {
      const currentLine = lines[index];
      if (currentLine === undefined) {
        break;
      }

      const trimmedLine = currentLine.trim();
      if (!trimmedLine) {
        index += 1;
        continue;
      }

      if (trimmedLine.startsWith('```')) {
        const codeBlock = this.parseCodeBlock(lines, index);
        blocks.push(codeBlock.block);
        index = codeBlock.nextIndex;
        continue;
      }

      if (trimmedLine.startsWith('#')) {
        const headingBlock = this.parseHeading(trimmedLine);
        if (headingBlock) {
          blocks.push(headingBlock);
        }
        index += 1;
        continue;
      }

      if (trimmedLine.startsWith('>')) {
        blocks.push(this.createQuoteBlock(trimmedLine.substring(1).trim()));
        index += 1;
        continue;
      }

      const todoMatch = trimmedLine.match(/^- \[( |x|X)\]\s+(.+)$/);
      if (todoMatch) {
        blocks.push(this.createTodoBlock(todoMatch[2]!, todoMatch[1]!.toLowerCase() === 'x'));
        index += 1;
        continue;
      }

      if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
        blocks.push(this.createBulletBlock(trimmedLine.substring(2).trim()));
        index += 1;
        continue;
      }

      const orderedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
      if (orderedMatch) {
        blocks.push(this.createOrderedBlock(orderedMatch[1]!));
        index += 1;
        continue;
      }

      if (trimmedLine === '---' || trimmedLine === '***') {
        blocks.push(this.createDividerBlock());
        index += 1;
        continue;
      }

      blocks.push(this.createTextBlock(trimmedLine));
      index += 1;
    }

    return blocks;
  }

  private parseCodeBlock(
    lines: string[],
    startIndex: number,
  ): { block: DocBlock; nextIndex: number } {
    const firstLine = lines[startIndex];
    const language = firstLine?.substring(3).trim() || 'plain_text';
    const codeLines: string[] = [];

    let index = startIndex + 1;
    while (index < lines.length) {
      const line = lines[index];
      if (line !== undefined && line.trim().startsWith('```')) {
        break;
      }

      codeLines.push(line || '');
      index += 1;
    }

    return {
      block: {
        block_type: BlockType.Code,
        code: {
          elements: [this.createTextRunElement(codeLines.join('\n'))],
          language: this.toFeishuCodeLanguage(language),
          wrap: false,
        },
      },
      nextIndex: Math.min(index + 1, lines.length),
    };
  }

  private parseHeading(line: string): DocBlock | null {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) {
      return null;
    }

    const level = match[1]!.length;
    const text = match[2]!;

    const blockTypeMap: Record<
      number,
      {
        type: number;
        key: Extract<
          BlockContentKey,
          'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6'
        >;
      }
    > = {
      1: { type: BlockType.Heading1, key: 'heading1' },
      2: { type: BlockType.Heading2, key: 'heading2' },
      3: { type: BlockType.Heading3, key: 'heading3' },
      4: { type: BlockType.Heading4, key: 'heading4' },
      5: { type: BlockType.Heading5, key: 'heading5' },
      6: { type: BlockType.Heading6, key: 'heading6' },
    };

    const headingType = blockTypeMap[level];
    if (!headingType) {
      return null;
    }

    return {
      block_type: headingType.type,
      [headingType.key]: this.createTextContent(text),
    };
  }

  private createTextBlock(text: string): DocBlock {
    return {
      block_type: BlockType.Text,
      text: this.createTextContent(text),
    };
  }

  private createBulletBlock(text: string): DocBlock {
    return {
      block_type: BlockType.Bullet,
      bullet: this.createTextContent(text),
    };
  }

  private createOrderedBlock(text: string): DocBlock {
    return {
      block_type: BlockType.Ordered,
      ordered: this.createTextContent(text),
    };
  }

  private createQuoteBlock(text: string): DocBlock {
    return {
      block_type: BlockType.Quote,
      quote: this.createTextContent(text),
    };
  }

  private createTodoBlock(text: string, done: boolean): DocBlock {
    return {
      block_type: BlockType.Todo,
      todo: {
        ...this.createTextContent(text),
        done,
      },
    };
  }

  private createDividerBlock(): DocBlock {
    return {
      block_type: BlockType.Divider,
      divider: {},
    };
  }

  private createTextContent(text: string): TextBlockContent {
    return {
      elements: [this.createTextRunElement(text)],
      style: {},
    };
  }

  private createTextRunElement(text: string): TextElement {
    return {
      type: 'text_run',
      text_run: {
        content: text,
        style: {},
      },
    };
  }

  private toFeishuCodeLanguage(language: string): number {
    const normalized = language.trim().toLowerCase();
    const map: Record<string, number> = {
      bash: 7,
      sh: 60,
      shell: 60,
      c: 10,
      cpp: 9,
      'c++': 9,
      css: 12,
      go: 22,
      graphql: 71,
      html: 24,
      java: 29,
      javascript: 30,
      js: 30,
      json: 28,
      markdown: 39,
      md: 39,
      nginx: 40,
      objectivec: 41,
      php: 43,
      plaintext: 1,
      plain_text: 1,
      powershell: 46,
      proto: 48,
      protobuf: 48,
      python: 49,
      py: 49,
      rust: 53,
      scss: 55,
      sql: 56,
      swift: 61,
      toml: 75,
      ts: 63,
      typescript: 63,
      xml: 66,
      yaml: 67,
      yml: 67,
    };

    return map[normalized] ?? 1;
  }

  private buildDocumentUrl(docId: string): string {
    return `https://www.feishu.cn/docx/${docId}`;
  }
}
