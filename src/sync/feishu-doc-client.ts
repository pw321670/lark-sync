import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from 'obsidian';

import type { RateLimiter } from './rate-limiter';

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
  Table = 31,
  TableCell = 32,
}

type TextElement = {
  text_run: {
    content: string;
    text_element_style?: TextElementStyle;
  };
};

type TextElementStyle = {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  inline_code?: boolean;
  background_color?: number;
  text_color?: number;
};

type TextBlockContent = {
  elements: TextElement[];
  style?: Record<string, unknown>;
  language?: number;
  wrap?: boolean;
  done?: boolean;
};

type EmptyBlockContent = Record<string, never>;

type TableProperty = {
  row_size: number;
  column_size: number;
  column_width?: number[];
  header_row?: boolean;
  header_column?: boolean;
};

type TableBlockContent = {
  cells?: string[];
  property: TableProperty;
};

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
  | 'divider'
  | 'table'
  | 'table_cell';

type DocBlock = {
  block_type: number;
  block_id?: string;
  children?: string[];
} & Partial<Record<BlockContentKey, TextBlockContent | EmptyBlockContent | TableBlockContent>>;

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

interface CreateDescendantBlockRequest {
  children_id: string[];
  descendants: DocBlock[];
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

type BlockAppendOperation =
  | {
      kind: 'children';
      blocks: DocBlock[];
    }
  | {
      kind: 'descendant';
      childrenIds: string[];
      descendants: DocBlock[];
    };

type InlineToken =
  | {
      kind: 'code';
      content: string;
      nextIndex: number;
    }
  | {
      kind: 'wikilink';
      displayText: string;
      nextIndex: number;
    }
  | {
      kind: 'styled';
      content: string;
      style: TextElementStyle;
      nextIndex: number;
    };

export class FeishuDocClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly apiCode?: number,
    readonly apiMessage?: string,
    readonly isMissing = false,
    readonly responseText?: string,
    readonly retryAfterMs?: number,
    readonly isRateLimit = false,
  ) {
    super(message);
    this.name = 'FeishuDocClientError';
  }
}

export class FeishuDocClient {
  private readonly baseUrl = 'https://open.feishu.cn/open-apis/docx/v1';
  private readonly inlineHighlightColor = 3;
  private readonly wikiLinkTextColor = 5;
  private readonly plainTextCodeLanguage = 1;
  private readonly defaultTableColumnWidth = 100;
  private readonly maxBlocksPerCreateRequest = 50;
  private readonly maxDescendantBlocksPerRequest = 1000;
  private readonly retryAttempts = 5;

  constructor(
    private readonly userAccessToken: string,
    private readonly rateLimiter?: RateLimiter,
  ) {}

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
    }

    const operations = this.convertMarkdownToOperations(markdownContent);

    if (operations.length === 0) {
      return;
    }

    for (const operation of operations) {
      if (operation.kind === 'children') {
        await this.addBlocksToDocument(docId, parentBlockId, operation.blocks);
        continue;
      }

      await this.addDescendantBlocksToDocument(
        docId,
        parentBlockId,
        operation.childrenIds,
        operation.descendants,
      );
    }
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
    index = -1,
  ): Promise<void> {
    await this.requestApi<BlockMutationData>(
      {
        url: `${this.baseUrl}/documents/${docId}/blocks/${parentId}/children`,
        method: 'POST',
        body: JSON.stringify({
          children: blocks,
          index,
        } satisfies CreateBlockRequest),
      },
      'Create document blocks',
    );
  }

  private async addDescendantBlocksToDocument(
    docId: string,
    parentId: string,
    childrenIds: string[],
    descendants: DocBlock[],
    index = -1,
  ): Promise<void> {
    await this.requestApi<BlockMutationData>(
      {
        url: `${this.baseUrl}/documents/${docId}/blocks/${parentId}/descendant`,
        method: 'POST',
        body: JSON.stringify({
          children_id: childrenIds,
          descendants,
          index,
        } satisfies CreateDescendantBlockRequest),
      },
      'Create descendant document blocks',
    );
  }

  private async requestApi<TData>(
    init: Omit<RequestUrlParam, 'headers' | 'contentType' | 'throw'>,
    action: string,
  ): Promise<TData> {
    let lastError: FeishuDocClientError | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt += 1) {
      if (this.rateLimiter) {
        await this.rateLimiter.acquire();
      }

      const response = await requestUrl({
        ...init,
        throw: false,
        headers: {
          Authorization: `Bearer ${this.userAccessToken}`,
        },
        contentType: 'application/json; charset=utf-8',
      });

      const payload = response.json as ApiEnvelope<TData>;

      if (response.status >= 400 || payload.code !== 0) {
        lastError = this.buildError(action, response, payload);
        if (this.isRateLimitError(lastError)) {
          this.rateLimiter?.noteRateLimit({ retryAfterMs: lastError.retryAfterMs });
        }

        if (this.isRateLimitError(lastError) && attempt < this.retryAttempts) {
          continue;
        }

        if (!this.isRateLimitError(lastError)) {
          throw lastError;
        }

        throw lastError;
      }

      this.rateLimiter?.noteSuccess();
      return (payload.data ?? {}) as TData;
    }

    throw lastError || new FeishuDocClientError(`${action} failed after retries`, 0);
  }

  private isRateLimitError(error: FeishuDocClientError): boolean {
    return error.isRateLimit;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildError(
    action: string,
    response: RequestUrlResponse,
    payload?: ApiEnvelope<unknown>,
  ): FeishuDocClientError {
    const apiCode = payload?.code;
    const apiMessage = payload?.msg || response.text;
    const retryAfterMs = this.parseRetryAfterMs(response.headers);
    const isMissing =
      response.status === 404 || apiCode === 1770002 || apiCode === 1770003;
    const isRateLimit =
      response.status === 429
      || apiCode === 99991400
      || (apiMessage?.toLowerCase().includes('frequency limit') ?? false)
      || (apiMessage?.includes('限频') ?? false);
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
      retryAfterMs,
      isRateLimit,
    );
  }

  private parseRetryAfterMs(headers: Record<string, string> | undefined): number | undefined {
    if (!headers) {
      return undefined;
    }

    const rateLimitResetValue =
      headers['x-ogw-ratelimit-reset'] ?? headers['X-Ogw-Ratelimit-Reset'];
    if (rateLimitResetValue) {
      const resetSeconds = Number(rateLimitResetValue);
      if (Number.isFinite(resetSeconds) && resetSeconds >= 0) {
        return resetSeconds * 1000;
      }
    }

    const retryAfterValue = headers['retry-after'] ?? headers['Retry-After'];
    if (!retryAfterValue) {
      return undefined;
    }

    const seconds = Number(retryAfterValue);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }

    const retryAt = Date.parse(retryAfterValue);
    if (!Number.isNaN(retryAt)) {
      return Math.max(0, retryAt - Date.now());
    }

    return undefined;
  }

  private convertMarkdownToOperations(markdown: string): BlockAppendOperation[] {
    const operations: BlockAppendOperation[] = [];
    const pendingBlocks: DocBlock[] = [];
    const lines = markdown.split('\n');
    let index = 0;

    const flushPendingBlocks = (): void => {
      if (pendingBlocks.length === 0) {
        return;
      }

      operations.push({
        kind: 'children',
        blocks: pendingBlocks.splice(0, pendingBlocks.length),
      });
    };

    const pushPendingBlock = (block: DocBlock): void => {
      pendingBlocks.push(block);

      if (pendingBlocks.length >= this.maxBlocksPerCreateRequest) {
        flushPendingBlocks();
      }
    };

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
        pushPendingBlock(codeBlock.block);
        index = codeBlock.nextIndex;
        continue;
      }

      const tableBlock = this.parseMarkdownTable(lines, index);
      if (tableBlock) {
        flushPendingBlocks();
        operations.push(tableBlock.operation);
        index = tableBlock.nextIndex;
        continue;
      }

      if (trimmedLine.startsWith('#')) {
        const headingBlock = this.parseHeading(trimmedLine);
        if (headingBlock) {
          pushPendingBlock(headingBlock);
        }
        index += 1;
        continue;
      }

      if (trimmedLine.startsWith('>')) {
        pushPendingBlock(this.createQuoteBlock(trimmedLine.substring(1).trim()));
        index += 1;
        continue;
      }

      const todoMatch = trimmedLine.match(/^- \[( |x|X)\]\s+(.+)$/);
      if (todoMatch) {
        pushPendingBlock(this.createTodoBlock(todoMatch[2]!, todoMatch[1]!.toLowerCase() === 'x'));
        index += 1;
        continue;
      }

      if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
        pushPendingBlock(this.createBulletBlock(trimmedLine.substring(2).trim()));
        index += 1;
        continue;
      }

      const orderedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
      if (orderedMatch) {
        pushPendingBlock(this.createOrderedBlock(orderedMatch[1]!));
        index += 1;
        continue;
      }

      if (trimmedLine === '---' || trimmedLine === '***') {
        pushPendingBlock(this.createDividerBlock());
        index += 1;
        continue;
      }

      pushPendingBlock(this.createTextBlock(trimmedLine));
      index += 1;
    }

    flushPendingBlocks();

    return operations;
  }

  private parseCodeBlock(
    lines: string[],
    startIndex: number,
  ): { block: DocBlock; nextIndex: number } {
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
          language: this.plainTextCodeLanguage,
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

  private createPlainTextContent(text: string): TextBlockContent {
    return {
      elements: [this.createTextRunElement(text)],
      style: {},
    };
  }

  private createTextContent(text: string): TextBlockContent {
    const elements = this.parseInlineElements(text);

    return {
      elements: elements.length > 0 ? elements : [this.createTextRunElement(text)],
      style: {},
    };
  }

  private createTextRunElement(text: string, style: TextElementStyle = {}): TextElement {
    const normalizedStyle = this.normalizeTextStyle(style);

    return {
      text_run: {
        content: text,
        ...(normalizedStyle ? { text_element_style: normalizedStyle } : {}),
      },
    };
  }

  private parseMarkdownTable(
    lines: string[],
    startIndex: number,
  ): { operation: Extract<BlockAppendOperation, { kind: 'descendant' }>; nextIndex: number } | null {
    const headerLine = lines[startIndex];
    const separatorLine = lines[startIndex + 1];

    if (!headerLine || !separatorLine) {
      return null;
    }

    const headerCells = this.parseTableRow(headerLine);
    const separatorCells = this.parseTableSeparatorRow(separatorLine);

    if (!headerCells || !separatorCells || headerCells.length !== separatorCells.length) {
      return null;
    }

    const rows: string[][] = [headerCells];
    let nextIndex = startIndex + 2;

    while (nextIndex < lines.length) {
      const line = lines[nextIndex];
      if (line === undefined || !line.trim()) {
        break;
      }

      if (!line.includes('|')) {
        break;
      }

      const rowCells = this.parseTableRow(line);
      if (!rowCells || rowCells.length !== headerCells.length) {
        return null;
      }

      rows.push(rowCells);
      nextIndex += 1;
    }

    const operation = this.createTableAppendOperation(rows);
    if (!operation) {
      return null;
    }

    return {
      operation,
      nextIndex,
    };
  }

  private parseTableRow(line: string): string[] | null {
    const trimmedLine = line.trim();
    if (!trimmedLine || !trimmedLine.includes('|')) {
      return null;
    }

    const normalizedLine = trimmedLine.replace(/^\|/, '').replace(/\|$/, '');
    const cells = normalizedLine.split('|').map((cell) => cell.trim());

    return cells.length > 0 ? cells : null;
  }

  private parseTableSeparatorRow(line: string): string[] | null {
    const cells = this.parseTableRow(line);
    if (!cells) {
      return null;
    }

    return cells.every((cell) => /^:?-{3,}:?$/.test(cell)) ? cells : null;
  }

  private createTableAppendOperation(
    rows: string[][],
  ): Extract<BlockAppendOperation, { kind: 'descendant' }> | null {
    const rowSize = rows.length;
    const columnSize = rows[0]?.length ?? 0;

    if (rowSize === 0 || columnSize === 0) {
      return null;
    }

    const cellCount = rowSize * columnSize;
    const descendantCount = 1 + cellCount * 2;
    if (columnSize > 100 || cellCount > 2000 || descendantCount > this.maxDescendantBlocksPerRequest) {
      return null;
    }

    const tableBlockId = 'table_block';
    const cellIds: string[] = [];
    const descendants: DocBlock[] = [];

    rows.forEach((row, rowIndex) => {
      row.forEach((cellText, columnIndex) => {
        const cellId = `table_cell_${rowIndex}_${columnIndex}`;
        const textId = `${cellId}_text`;

        cellIds.push(cellId);
        descendants.push({
          block_id: cellId,
          block_type: BlockType.TableCell,
          table_cell: {},
          children: [textId],
        });
        descendants.push({
          block_id: textId,
          block_type: BlockType.Text,
          text: this.createPlainTextContent(cellText),
          children: [],
        });
      });
    });

    return {
      kind: 'descendant',
      childrenIds: [tableBlockId],
      descendants: [
        {
          block_id: tableBlockId,
          block_type: BlockType.Table,
          table: {
            cells: cellIds,
            property: {
              row_size: rowSize,
              column_size: columnSize,
              column_width: Array.from(
                { length: columnSize },
                () => this.defaultTableColumnWidth,
              ),
              header_row: true,
            },
          },
          children: cellIds,
        },
        ...descendants,
      ],
    };
  }

  private parseInlineElements(
    text: string,
    inheritedStyle: TextElementStyle = {},
  ): TextElement[] {
    const elements: TextElement[] = [];
    let plainTextStart = 0;
    let cursor = 0;

    while (cursor < text.length) {
      const token = this.matchInlineToken(text, cursor);
      if (!token) {
        cursor += 1;
        continue;
      }

      if (plainTextStart < cursor) {
        this.pushTextElement(elements, text.slice(plainTextStart, cursor), inheritedStyle);
      }

      if (token.kind === 'code') {
        this.pushTextElement(
          elements,
          token.content,
          this.mergeTextStyle(inheritedStyle, { inline_code: true }),
        );
      } else if (token.kind === 'wikilink') {
        this.pushTextElement(
          elements,
          token.displayText,
          this.mergeTextStyle(inheritedStyle, { text_color: this.wikiLinkTextColor }),
        );
      } else {
        elements.push(
          ...this.parseInlineElements(
            token.content,
            this.mergeTextStyle(inheritedStyle, token.style),
          ),
        );
      }

      cursor = token.nextIndex;
      plainTextStart = cursor;
    }

    if (plainTextStart < text.length) {
      this.pushTextElement(elements, text.slice(plainTextStart), inheritedStyle);
    }

    if (elements.length === 0) {
      this.pushTextElement(elements, text, inheritedStyle);
    }

    return elements;
  }

  private matchInlineToken(text: string, cursor: number): InlineToken | null {
    return (
      this.matchInlineCode(text, cursor) ||
      this.matchWikiLink(text, cursor) ||
      this.matchStyledToken(text, cursor, '**', { bold: true }) ||
      this.matchStyledToken(text, cursor, '==', {
        background_color: this.inlineHighlightColor,
      }) ||
      this.matchStyledToken(text, cursor, '*', { italic: true })
    );
  }

  private matchInlineCode(text: string, cursor: number): InlineToken | null {
    if (text[cursor] !== '`') {
      return null;
    }

    const endIndex = text.indexOf('`', cursor + 1);
    if (endIndex <= cursor + 1) {
      return null;
    }

    return {
      kind: 'code',
      content: text.slice(cursor + 1, endIndex),
      nextIndex: endIndex + 1,
    };
  }

  private matchWikiLink(text: string, cursor: number): InlineToken | null {
    if (!text.startsWith('[[', cursor)) {
      return null;
    }

    const endIndex = text.indexOf(']]', cursor + 2);
    if (endIndex === -1) {
      return null;
    }

    const rawTarget = text.slice(cursor + 2, endIndex);
    const pipeIndex = rawTarget.indexOf('|');
    const displayText = pipeIndex === -1 ? rawTarget : rawTarget.slice(pipeIndex + 1);

    if (!displayText) {
      return null;
    }

    return {
      kind: 'wikilink',
      displayText,
      nextIndex: endIndex + 2,
    };
  }

  private matchStyledToken(
    text: string,
    cursor: number,
    delimiter: '**' | '*' | '==',
    style: TextElementStyle,
  ): InlineToken | null {
    if (!text.startsWith(delimiter, cursor)) {
      return null;
    }

    const contentStart = cursor + delimiter.length;
    if (contentStart >= text.length || /\s/.test(text[contentStart]!)) {
      return null;
    }

    const endIndex = this.findClosingDelimiter(text, delimiter, contentStart);
    if (endIndex <= contentStart) {
      return null;
    }

    return {
      kind: 'styled',
      content: text.slice(contentStart, endIndex),
      style,
      nextIndex: endIndex + delimiter.length,
    };
  }

  private findClosingDelimiter(
    text: string,
    delimiter: '**' | '*' | '==',
    fromIndex: number,
  ): number {
    let searchIndex = fromIndex;

    while (searchIndex < text.length) {
      const matchIndex = text.indexOf(delimiter, searchIndex);
      if (matchIndex === -1) {
        return -1;
      }

      if (!this.isDelimiterBoundary(text, delimiter, matchIndex)) {
        searchIndex = matchIndex + delimiter.length;
        continue;
      }

      const previousChar = text[matchIndex - 1];
      if (previousChar && !/\s/.test(previousChar)) {
        return matchIndex;
      }

      searchIndex = matchIndex + delimiter.length;
    }

    return -1;
  }

  private isDelimiterBoundary(
    text: string,
    delimiter: '**' | '*' | '==',
    matchIndex: number,
  ): boolean {
    const delimiterChar = delimiter[0];
    const previousChar = text[matchIndex - 1];
    const nextChar = text[matchIndex + delimiter.length];

    if (delimiter === '*') {
      return previousChar !== delimiterChar && nextChar !== delimiterChar;
    }

    if (delimiter === '**' || delimiter === '==') {
      return previousChar !== delimiterChar && nextChar !== delimiterChar;
    }

    return true;
  }

  private pushTextElement(
    elements: TextElement[],
    content: string,
    style: TextElementStyle = {},
  ): void {
    if (!content) {
      return;
    }

    const normalizedStyle = this.normalizeTextStyle(style);
    const lastElement = elements[elements.length - 1];

    if (
      lastElement &&
      this.areTextStylesEqual(lastElement.text_run.text_element_style, normalizedStyle)
    ) {
      lastElement.text_run.content += content;
      return;
    }

    elements.push(this.createTextRunElement(content, normalizedStyle ?? {}));
  }

  private mergeTextStyle(
    baseStyle: TextElementStyle,
    nextStyle: TextElementStyle,
  ): TextElementStyle {
    return {
      ...baseStyle,
      ...nextStyle,
    };
  }

  private normalizeTextStyle(style: TextElementStyle): TextElementStyle | undefined {
    const normalizedStyle = Object.fromEntries(
      Object.entries(style).filter(([, value]) => value !== undefined),
    ) as TextElementStyle;

    return Object.keys(normalizedStyle).length > 0 ? normalizedStyle : undefined;
  }

  private areTextStylesEqual(left?: TextElementStyle, right?: TextElementStyle): boolean {
    const styleKeys: Array<keyof TextElementStyle> = [
      'bold',
      'italic',
      'strikethrough',
      'underline',
      'inline_code',
      'background_color',
      'text_color',
    ];

    return styleKeys.every((key) => left?.[key] === right?.[key]);
  }

  private buildDocumentUrl(docId: string): string {
    return `https://www.feishu.cn/docx/${docId}`;
  }
}
