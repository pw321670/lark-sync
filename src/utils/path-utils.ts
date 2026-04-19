export function normalizeRelPath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function normalizeExcludeEntries(values: string[]): string[] {
  const deduped = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    let normalized = normalizeRelPath(value.trim());
    while (normalized.startsWith("./")) {
      normalized = normalized.slice(2);
    }

    if (!normalized || normalized === ".") {
      continue;
    }

    deduped.add(normalized);
  }

  return [...deduped];
}

export function shouldExclude(relPath: string, excludeList: string[]): boolean {
  const normalized = normalizeRelPath(relPath);
  return excludeList.some((item) => normalized === item || normalized.startsWith(`${item}/`));
}

/**
 * 白名单模式：检查文件是否应该被包含（同步）
 * @param relPath 文件的相对路径
 * @param includeList 白名单列表
 * @returns 是否应该包含该文件
 */
export function shouldInclude(relPath: string, includeList: string[]): boolean {
  const normalized = normalizeRelPath(relPath);

  // 如果白名单为空，不包含任何文件
  if (includeList.length === 0) {
    return false;
  }

  // 检查是否匹配白名单中的任何规则
  return includeList.some((item) => normalized === item || normalized.startsWith(`${item}/`));
}

/**
 * 根据文件匹配模式检查文件是否应该被处理
 * @param relPath 文件的相对路径
 * @param matchList 匹配列表（排除或包含）
 * @param mode 文件匹配模式
 * @returns 是否应该处理该文件
 */
export function shouldMatchFile(relPath: string, matchList: string[], mode: 'exclude' | 'include'): boolean {
  if (mode === 'exclude') {
    // 排除模式：默认处理所有文件，除非在排除列表中
    return !shouldExclude(relPath, matchList);
  } else {
    // 白名单模式：只处理在白名单中的文件
    return shouldInclude(relPath, matchList);
  }
}

export function formatExcludeEntries(values: string[]): string {
  return normalizeExcludeEntries(values).join("\n");
}
