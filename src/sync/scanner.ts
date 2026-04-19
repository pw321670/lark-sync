/**
 * Vault 扫描器 - 使用 Obsidian Vault API 扫描文件
 */

import { TFile, TFolder, TAbstractFile, Vault } from 'obsidian';
import type { FileEntry } from './types';
import { normalizeRelPath } from '../utils/path-utils';

// ============================================================================
// 扫描选项
// ============================================================================

/**
 * Vault 扫描选项
 */
export interface VaultScanOptions {
	/** 扫描进度回调 */
	onProgress?: (currentPath: string, fileCount: number) => void;
	/** 是否只扫描 markdown 文件 */
	markdownOnly?: boolean;
	/** 自定义文件扩展名过滤 */
	extensionFilter?: string[];
}

// ============================================================================
// 扫描结果
// ============================================================================

/**
 * Vault 扫描结果
 */
export interface VaultScanResult {
	/** 扫描到的所有文件 */
	files: FileEntry[];
	/** 文件总数 */
	totalCount: number;
	/** 总大小（字节） */
	totalSize: number;
	/** 扫描耗时（毫秒） */
	duration: number;
}

// ============================================================================
// Vault 扫描器
// ============================================================================

/**
 * Vault 扫描器类 - 使用 Obsidian 的 Vault API 扫描文件
 *
 * 特点：
 * - 使用 Obsidian Vault.getMarkdownFiles() 或 Vault.getAllLoadedFiles()
 * - 返回标准化的 FileEntry 格式
 * - 性能优化：快速扫描大型 vault
 * - 支持进度回调
 */
export class VaultScanner {
	constructor(private vault: Vault) {}

	/**
	 * 扫描 vault 中所有 markdown 文件
	 * @returns 扫描结果
	 */
	async scanMarkdownFiles(options?: VaultScanOptions): Promise<VaultScanResult> {
		const startTime = performance.now();
		const files: FileEntry[] = [];

		// 使用 Obsidian API 获取所有 markdown 文件
		const mdFiles = this.vault.getMarkdownFiles();

		for (const file of mdFiles) {
			const entry = this.createFileEntry(file);
			files.push(entry);

			// 报告进度
			options?.onProgress?.(entry.relPath, files.length);
		}

		const totalSize = files.reduce((sum, f) => sum + f.size, 0);

		return {
			files,
			totalCount: files.length,
			totalSize,
			duration: performance.now() - startTime,
		};
	}

	/**
	 * 扫描 vault 中所有文件（包括非 markdown 文件）
	 * @returns 扫描结果
	 */
	async scanAllFiles(options?: VaultScanOptions): Promise<VaultScanResult> {
		const startTime = performance.now();
		const files: FileEntry[] = [];

		// 使用 Obsidian API 获取所有已加载文件
		const allFiles = this.vault.getAllLoadedFiles();

		for (const item of allFiles) {
			// 只处理文件（TFile），跳过文件夹（TFolder）
			if (!(item instanceof TFile)) {
				continue;
			}

			const entry = this.createFileEntry(item);
			files.push(entry);

			// 报告进度
			options?.onProgress?.(entry.relPath, files.length);
		}

		const totalSize = files.reduce((sum, f) => sum + f.size, 0);

		return {
			files,
			totalCount: files.length,
			totalSize,
			duration: performance.now() - startTime,
		};
	}

	/**
	 * 根据扩展名扫描文件
	 * @param extensions 文件扩展名列表（如 ['md', 'txt', 'png']）
	 * @returns 扫描结果
	 */
	async scanByExtension(extensions: string[], options?: VaultScanOptions): Promise<VaultScanResult> {
		const startTime = performance.now();
		const files: FileEntry[] = [];
		const extSet = new Set(extensions.map((e) => e.toLowerCase().replace(/^\./, '')));

		// 使用 Obsidian API 获取所有已加载文件
		const allFiles = this.vault.getAllLoadedFiles();

		for (const item of allFiles) {
			// 只处理文件（TFile）
			if (!(item instanceof TFile)) {
				continue;
			}

			const ext = item.extension.toLowerCase();

			if (extSet.has(ext)) {
				const entry = this.createFileEntry(item);
				files.push(entry);

				// 报告进度
				options?.onProgress?.(entry.relPath, files.length);
			}
		}

		const totalSize = files.reduce((sum, f) => sum + f.size, 0);

		return {
			files,
			totalCount: files.length,
			totalSize,
			duration: performance.now() - startTime,
		};
	}

	/**
	 * 创建文件条目
	 * @param file Obsidian TFile 对象
	 * @returns FileEntry
	 */
	private createFileEntry(file: TFile): FileEntry {
		return {
			type: 'file',
			absPath: file.path,
			relPath: normalizeRelPath(file.path),
			size: file.stat.size,
			mtimeMs: file.stat.mtime,
		};
	}

	/**
	 * 获取文件列表（快速方法，不创建 FileEntry）
	 * @param extension 文件扩展名（可选）
	 * @returns 文件路径列表
	 */
	getFilePaths(extension?: string): string[] {
		if (extension === 'md' || extension === undefined) {
			return this.vault.getMarkdownFiles().map((f) => normalizeRelPath(f.path));
		}

		// 对于其他扩展名，遍历所有文件
		const allFiles = this.vault.getAllLoadedFiles();
		const paths: string[] = [];
		const targetExt = extension.toLowerCase().replace(/^\./, '');

		for (const item of allFiles) {
			// 只处理文件（TFile）
			if (item instanceof TFile && item.extension.toLowerCase() === targetExt) {
				paths.push(normalizeRelPath(item.path));
			}
		}

		return paths;
	}

	/**
	 * 获取文件夹结构
	 * @returns 文件夹路径列表
	 */
	getFolderPaths(): string[] {
		const folders: string[] = [];

		const collectFolders = (folder: TFolder) => {
			folders.push(normalizeRelPath(folder.path));
			// TFolder 的 children 属性包含所有子文件和文件夹
			for (const child of folder.children) {
				// 检查是否是文件夹（TFolder 有 children 属性）
				if (child instanceof TFolder) {
					collectFolders(child);
				}
			}
		};

		// 从根文件夹开始递归
		collectFolders(this.vault.getRoot());

		return folders;
	}

	/**
	 * 检查文件是否存在
	 * @param path 文件相对路径
	 * @returns 是否存在
	 */
	fileExists(path: string): boolean {
		const abstractFile = this.vault.getAbstractFileByPath(path);
		return abstractFile !== null;
	}

	/**
	 * 获取文件统计信息
	 * @param path 文件相对路径
	 * @returns 文件统计信息或 null
	 */
	getFileStats(path: string): { size: number; mtimeMs: number } | null {
		const abstractFile = this.vault.getAbstractFileByPath(path);
		if (!abstractFile || !(abstractFile instanceof TFile)) {
			return null;
		}

		return {
			size: abstractFile.stat.size,
			mtimeMs: abstractFile.stat.mtime,
		};
	}
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的字符串
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * 格式化持续时间
 * @param ms 毫秒数
 * @returns 格式化后的字符串
 */
export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) {
		return `${seconds}秒`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return remainingSeconds > 0 ? `${minutes}分${remainingSeconds}秒` : `${minutes}分`;
}

/**
 * 格式化扫描结果摘要
 * @param result 扫描结果
 * @returns 摘要字符串
 */
export function formatScanSummary(result: VaultScanResult): string {
	const parts = [
		`扫描到 ${result.totalCount} 个文件`,
		`总大小 ${formatFileSize(result.totalSize)}`,
		`耗时 ${formatDuration(result.duration)}`,
	];
	return parts.join('，');
}
