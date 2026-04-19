/**
 * 文件过滤器 - 根据配置过滤文件
 */

import type { FileEntry } from './types';
import { shouldExclude, shouldInclude, normalizeRelPath } from '../utils/path-utils';
import type { FileMatchMode } from '../utils/contracts';

// ============================================================================
// 过滤配置
// ============================================================================

/**
 * 文件过滤配置
 */
export interface FileFilterConfig {
	/** 文件匹配模式 */
	fileMatchMode: FileMatchMode;
	/** 匹配列表（排除或白名单） */
	matchList: string[];
	/** 最大文件大小（MB） */
	maxSizeMB: number;
}

// ============================================================================
// 过滤结果
// ============================================================================

/**
 * 文件过滤结果
 */
export interface FileFilterResult {
	/** 通过过滤的文件 */
	included: FileEntry[];
	/** 被排除的文件（路径 + 原因） */
	excluded: Array<{
		path: string;
		reason: 'match-mode' | 'oversize' | 'extension';
		detail?: string;
	}>;
	/** 超大文件 */
	oversized: FileEntry[];
	/** 统计信息 */
	stats: {
		total: number;
		included: number;
		excludedByMode: number;
		excludedBySize: number;
	};
}

// ============================================================================
// 文件过滤器
// ============================================================================

/**
 * 文件过滤器类
 *
 * 功能：
 * - 根据配置过滤文件（排除/白名单模式）
 * - 检查文件大小限制
 * - 支持扩展名过滤
 * - 提供详细的过滤原因
 */
export class FileFilter {
	private config: FileFilterConfig;

	constructor(config: FileFilterConfig) {
		this.config = config;
	}

	/**
	 * 更新过滤配置
	 */
	updateConfig(config: Partial<FileFilterConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * 获取当前配置
	 */
	getConfig(): FileFilterConfig {
		return { ...this.config };
	}

	/**
	 * 过滤文件列表
	 * @param files 文件列表
	 * @returns 过滤结果
	 */
	filter(files: FileEntry[]): FileFilterResult {
		const included: FileEntry[] = [];
		const oversized: FileEntry[] = [];
		const excluded: FileFilterResult['excluded'] = [];

		const maxSizeBytes = this.config.maxSizeMB * 1024 * 1024;

		for (const file of files) {
			// 首先检查文件大小
			if (file.size > maxSizeBytes) {
				oversized.push(file);
				excluded.push({
					path: file.relPath,
					reason: 'oversize',
					detail: `${this.formatSize(file.size)} > ${this.config.maxSizeMB}MB`,
				});
				continue;
			}

			// 然后检查匹配模式
			const matches = this.checkMatchMode(file.relPath);

			if (!matches) {
				excluded.push({
					path: file.relPath,
					reason: 'match-mode',
					detail: this.config.fileMatchMode === 'exclude'
						? '在排除列表中'
						: '不在白名单中',
				});
				continue;
			}

			// 通过所有过滤条件
			included.push(file);
		}

		return {
			included,
			excluded,
			oversized,
			stats: {
				total: files.length,
				included: included.length,
				excludedByMode: excluded.filter(e => e.reason === 'match-mode').length,
				excludedBySize: excluded.filter(e => e.reason === 'oversize').length,
			},
		};
	}

	/**
	 * 检查单个文件是否匹配
	 * @param relPath 文件相对路径
	 * @returns 是否应该包含该文件
	 */
	checkMatchMode(relPath: string): boolean {
		const normalized = normalizeRelPath(relPath);

		if (this.config.fileMatchMode === 'exclude') {
			// 排除模式：默认包含，除非在排除列表中
			return !shouldExclude(normalized, this.config.matchList);
		} else {
			// 白名单模式：默认排除，除非在白名单中
			return shouldInclude(normalized, this.config.matchList);
		}
	}

	/**
	 * 检查文件是否超过大小限制
	 * @param file 文件条目
	 * @returns 是否超过大小限制
	 */
	isOversized(file: FileEntry): boolean {
		const maxSizeBytes = this.config.maxSizeMB * 1024 * 1024;
		return file.size > maxSizeBytes;
	}

	/**
	 * 检查文件大小（字节）
	 * @param bytes 字节数
	 * @returns 是否超过大小限制
	 */
	isSizeOversized(bytes: number): boolean {
		const maxSizeBytes = this.config.maxSizeMB * 1024 * 1024;
		return bytes > maxSizeBytes;
	}

	/**
	 * 过滤超大文件
	 * @param files 文件列表
	 * @returns 分离后的有效文件和超大文件
	 */
	filterOversized(files: FileEntry[]): { valid: FileEntry[]; oversized: FileEntry[] } {
		const valid: FileEntry[] = [];
		const oversized: FileEntry[] = [];

		for (const file of files) {
			if (this.isOversized(file)) {
				oversized.push(file);
			} else {
				valid.push(file);
			}
		}

		return { valid, oversized };
	}

	/**
	 * 格式化文件大小
	 */
	private formatSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
	}
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 创建文件过滤器实例
 * @param config 过滤配置
 * @returns FileFilter 实例
 */
export function createFileFilter(config: FileFilterConfig): FileFilter {
	return new FileFilter(config);
}

/**
 * 快速过滤函数（无状态）
 * @param files 文件列表
 * @param config 过滤配置
 * @returns 过滤结果
 */
export function filterFiles(files: FileEntry[], config: FileFilterConfig): FileFilterResult {
	const filter = new FileFilter(config);
	return filter.filter(files);
}

/**
 * 检查单个路径是否应该被排除
 * @param relPath 文件相对路径
 * @param mode 匹配模式
 * @param matchList 匹配列表
 * @returns 是否应该排除
 */
export function shouldExcludePath(
	relPath: string,
	mode: FileMatchMode,
	matchList: string[]
): boolean {
	const normalized = normalizeRelPath(relPath);

	if (mode === 'exclude') {
		return shouldExclude(normalized, matchList);
	} else {
		return !shouldInclude(normalized, matchList);
	}
}

// ============================================================================
// 预定义过滤器
// ============================================================================

/**
 * 默认排除列表（Obsidian 相关）
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
	'.trash',
	'.obsidian/workspace.json',
	'.obsidian/workspaces.json',
	'.obsidian/plugins',
];

/**
 * 创建默认的排除模式过滤器
 * @param maxSizeMB 最大文件大小
 * @returns 过滤器实例
 */
export function createDefaultFilter(maxSizeMB: number = 20): FileFilter {
	return new FileFilter({
		fileMatchMode: 'exclude',
		matchList: DEFAULT_EXCLUDE_PATTERNS,
		maxSizeMB,
	});
}

/**
 * 创建白名单模式过滤器
 * @param includeList 白名单列表
 * @param maxSizeMB 最大文件大小
 * @returns 过滤器实例
 */
export function createIncludeFilter(
	includeList: string[],
	maxSizeMB: number = 20
): FileFilter {
	return new FileFilter({
		fileMatchMode: 'include',
		matchList: includeList,
		maxSizeMB,
	});
}
