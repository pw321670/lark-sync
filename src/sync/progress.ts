/**
 * 进度跟踪器 - 跟踪同步进度并生成报告
 */

import type { SyncProgress, SyncResult } from './types';

// ============================================================================
// 进度阶段
// ============================================================================

/**
 * 同步进度阶段
 */
export type ProgressPhase =
	| 'idle'
	| 'scanning'
	| 'filtering'
	| 'uploading'
	| 'completing'
	| 'paused'
	| 'error'
	| 'completed';

// ============================================================================
// 进度事件
// ============================================================================

/**
 * 进度事件类型
 */
export type ProgressEventType =
	| 'phase-change'
	| 'file-start'
	| 'file-progress'
	| 'file-complete'
	| 'file-error'
	| 'scan-update';

/**
 * 进度事件数据
 */
export interface ProgressEventData {
	/** 事件类型 */
	type: ProgressEventType;
	/** 当前阶段 */
	phase: ProgressPhase;
	/** 时间戳 */
	timestamp: number;
	/** 当前处理的文件 */
	currentFile?: string;
	/** 已处理数量 */
	processedCount?: number;
	/** 总数量 */
	totalCount?: number;
	/** 错误信息 */
	error?: string;
}

/**
 * 进度事件监听器
 */
export type ProgressEventListener = (event: ProgressEventData) => void;

// ============================================================================
// 进度跟踪器配置
// ============================================================================

/**
 * 进度跟踪器配置
 */
export interface ProgressTrackerConfig {
	/** 总文件数（初始化时设置） */
	totalFiles?: number;
	/** 是否启用详细日志 */
	verbose?: boolean;
	/** 事件监听器 */
	listeners?: ProgressEventListener[];
}

// ============================================================================
// 进度跟踪器
// ============================================================================

/**
 * 进度跟踪器类
 *
 * 功能：
 * - 跟踪同步进度（扫描、上传、跳过、失败）
 * - 计算百分比
 * - 生成进度报告
 * - 支持事件监听
 */
export class ProgressTracker {
	private phase: ProgressPhase = 'idle';
	private startTime: number | null = null;
	private endTime: number | null = null;
	private currentFile: string | null = null;

	// 计数器
	private scannedCount: number = 0;
	private uploadedCount: number = 0;
	private skippedCount: number = 0;
	private failedCount: number = 0;
	private totalCount: number = 0;

	// 速度计算
	private uploadStartTime: number | null = null;
	private totalBytesUploaded: number = 0;

	// 配置
	private config: ProgressTrackerConfig;

	// 失败文件记录
	private failedFiles: Array<{ path: string; error: string }> = [];

	constructor(config: ProgressTrackerConfig = {}) {
		this.config = {
			verbose: false,
			listeners: [],
			...config,
		};
		this.totalCount = config.totalFiles ?? 0;
	}

	// ========================================================================
	// 阶段控制
	// ========================================================================

	/**
	 * 开始新的同步会话
	 */
	start(totalFiles: number): void {
		this.reset();
		this.phase = 'scanning';
		this.startTime = performance.now();
		this.totalCount = totalFiles;
		this.emit('phase-change', { phase: 'scanning' });
	}

	/**
	 * 重置所有状态
	 */
	reset(): void {
		this.phase = 'idle';
		this.startTime = null;
		this.endTime = null;
		this.currentFile = null;
		this.scannedCount = 0;
		this.uploadedCount = 0;
		this.skippedCount = 0;
		this.failedCount = 0;
		this.totalCount = 0;
		this.uploadStartTime = null;
		this.totalBytesUploaded = 0;
		this.failedFiles = [];
	}

	/**
	 * 暂停进度
	 */
	pause(): void {
		if (this.phase !== 'error' && this.phase !== 'completed') {
			this.phase = 'paused';
			this.emit('phase-change', { phase: 'paused' });
		}
	}

	/**
	 * 恢复进度
	 */
	resume(): void {
		if (this.phase === 'paused') {
			this.phase = 'uploading';
			this.emit('phase-change', { phase: 'uploading' });
		}
	}

	/**
	 * 标记为完成
	 */
	complete(): void {
		this.phase = 'completing';
		this.endTime = performance.now();
		this.emit('phase-change', { phase: 'completing' });

		this.phase = 'completed';
		this.emit('phase-change', { phase: 'completed' });
	}

	/**
	 * 标记为错误状态
	 */
	error(message: string): void {
		this.phase = 'error';
		this.endTime = performance.now();
		this.emit('phase-change', { phase: 'error', error: message });
	}

	// ========================================================================
	// 阶段切换
	// ========================================================================

	/**
	 * 切换到扫描阶段
	 */
	toScanning(): void {
		this.phase = 'scanning';
		this.emit('phase-change', { phase: 'scanning' });
	}

	/**
	 * 切换到过滤阶段
	 */
	toFiltering(): void {
		this.phase = 'filtering';
		this.emit('phase-change', { phase: 'filtering' });
	}

	/**
	 * 切换到上传阶段
	 */
	toUploading(): void {
		this.phase = 'uploading';
		this.uploadStartTime = performance.now();
		this.emit('phase-change', { phase: 'uploading' });
	}

	// ========================================================================
	// 进度更新
	// ========================================================================

	/**
	 * 更新扫描进度
	 */
	updateScan(count: number): void {
		this.scannedCount = count;
		this.emit('scan-update', {
			processedCount: count,
			totalCount: this.totalCount,
		});
	}

	/**
	 * 增加扫描计数
	 */
 incrementScanned(): void {
		this.scannedCount++;
		this.emit('scan-update', {
			processedCount: this.scannedCount,
			totalCount: this.totalCount,
		});
	}

	/**
	 * 开始处理文件
	 */
	startFile(filePath: string): void {
		this.currentFile = filePath;
		this.emit('file-start', { currentFile: filePath });
	}

	/**
	 * 标记文件上传成功
	 */
	completeFile(filePath: string, bytesUploaded: number = 0): void {
		this.uploadedCount++;
		this.totalBytesUploaded += bytesUploaded;
		this.currentFile = null;
		this.emit('file-complete', {
			currentFile: filePath,
			processedCount: this.uploadedCount,
		});
	}

	/**
	 * 标记文件被跳过（未变化）
	 */
	skipFile(filePath: string): void {
		this.skippedCount++;
		this.currentFile = null;
		this.emit('file-complete', {
			currentFile: filePath,
			processedCount: this.uploadedCount + this.skippedCount,
		});
	}

	/**
	 * 标记文件上传失败
	 */
	failFile(filePath: string, error: string): void {
		this.failedCount++;
		this.failedFiles.push({ path: filePath, error });
		this.currentFile = null;
		this.emit('file-error', {
			currentFile: filePath,
			error,
		});
	}

	/**
	 * 设置总文件数
	 */
	setTotalCount(count: number): void {
		this.totalCount = count;
	}

	// ========================================================================
	// 状态查询
	// ========================================================================

	/**
	 * 获取当前阶段
	 */
	getPhase(): ProgressPhase {
		return this.phase;
	}

	/**
	 * 获取当前进度
	 */
	getProgress(): SyncProgress {
		const processedCount = this.uploadedCount + this.skippedCount + this.failedCount;
		const percentage = this.totalCount > 0
			? Math.floor((processedCount / this.totalCount) * 100)
			: 0;

		return {
			status: this.mapPhaseToStatus(),
			currentFile: this.currentFile,
			processedCount,
			totalCount: this.totalCount,
			uploadedCount: this.uploadedCount,
			skippedCount: this.skippedCount,
			failedCount: this.failedCount,
			percentage,
			speed: this.calculateSpeed(),
			startTime: this.startTime,
			estimatedTimeRemaining: this.calculateEta(),
		};
	}

	/**
	 * 生成同步结果
	 */
	generateResult(success: boolean, error?: string): SyncResult {
		const duration = this.endTime && this.startTime
			? this.endTime - this.startTime
			: 0;

		return {
			success,
			error,
			filesDiscovered: this.scannedCount,
			excludedCount: 0, // 由过滤器提供
			oversizedCount: 0, // 由过滤器提供
			candidateCount: this.uploadedCount + this.skippedCount + this.failedCount,
			uploadedCount: this.uploadedCount,
			skippedCount: this.skippedCount,
			failedCount: this.failedCount,
			failedFiles: [...this.failedFiles],
			totalBytesUploaded: this.totalBytesUploaded,
			duration,
		};
	}

	/**
	 * 生成进度报告
	 */
	generateReport(): string {
		const progress = this.getProgress();
		const parts: string[] = [];

		// 阶段
		parts.push(`阶段: ${this.phaseToString(this.phase)}`);

		// 进度
		if (this.totalCount > 0) {
			parts.push(`进度: ${progress.processedCount}/${this.totalCount} (${progress.percentage}%)`);
		}

		// 统计
		parts.push(`已上传: ${this.uploadedCount}`);
		parts.push(`已跳过: ${this.skippedCount}`);
		parts.push(`已失败: ${this.failedCount}`);

		// 速度
		if (progress.speed > 0) {
			parts.push(`速度: ${this.formatSpeed(progress.speed)}`);
		}

		// 预估剩余时间
		if (progress.estimatedTimeRemaining !== null) {
			parts.push(`剩余: ${this.formatDuration(progress.estimatedTimeRemaining)}`);
		}

		// 当前文件
		if (this.currentFile) {
			parts.push(`当前: ${this.currentFile}`);
		}

		return parts.join(' | ');
	}

	// ========================================================================
	// 私有方法
	// ========================================================================

	/**
	 * 计算上传速度
	 */
	private calculateSpeed(): number {
		if (!this.uploadStartTime || this.totalBytesUploaded === 0) {
			return 0;
		}

		const elapsed = performance.now() - this.uploadStartTime;
		if (elapsed <= 0) {
			return 0;
		}

		return (this.totalBytesUploaded / elapsed) * 1000; // 字节/秒
	}

	/**
	 * 计算预估剩余时间
	 */
	private calculateEta(): number | null {
		if (!this.startTime || this.totalCount === 0) {
			return null;
		}

		const processedCount = this.uploadedCount + this.skippedCount + this.failedCount;
		if (processedCount === 0) {
			return null;
		}

		const elapsed = performance.now() - this.startTime;
		const avgTimePerFile = elapsed / processedCount;
		const remaining = this.totalCount - processedCount;

		return Math.floor(avgTimePerFile * remaining);
	}

	/**
	 * 映射阶段到状态
	 */
	private mapPhaseToStatus(): SyncProgress['status'] {
		const phaseMap: Record<ProgressPhase, SyncProgress['status']> = {
			idle: 'idle',
			scanning: 'scanning',
			filtering: 'scanning',
			uploading: 'syncing',
			completing: 'syncing',
			paused: 'paused',
			error: 'error',
			completed: 'completed',
		};
		return phaseMap[this.phase];
	}

	/**
	 * 阶段转字符串
	 */
	private phaseToString(phase: ProgressPhase): string {
		const phaseNames: Record<ProgressPhase, string> = {
			idle: '空闲',
			scanning: '扫描中',
			filtering: '过滤中',
			uploading: '上传中',
			completing: '完成中',
			paused: '已暂停',
			error: '错误',
			completed: '已完成',
		};
		return phaseNames[phase];
	}

	/**
	 * 格式化速度
	 */
	private formatSpeed(bytesPerSecond: number): string {
		if (bytesPerSecond === 0) return '0 B/s';
		const k = 1024;
		const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
		const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
		return `${(bytesPerSecond / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
	}

	/**
	 * 格式化持续时间
	 */
	private formatDuration(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		if (seconds < 60) {
			return `${seconds}秒`;
		}
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return remainingSeconds > 0 ? `${minutes}分${remainingSeconds}秒` : `${minutes}分`;
	}

	/**
	 * 发射事件
	 */
	private emit(type: ProgressEventType, data: Partial<ProgressEventData> = {}): void {
		const event: ProgressEventData = {
			type,
			phase: this.phase,
			timestamp: Date.now(),
			...data,
		};

		for (const listener of this.config.listeners ?? []) {
			try {
				listener(event);
			} catch (err) {
				// 防止监听器错误影响主流程
				console.error('Progress listener error:', err);
			}
		}

		if (this.config.verbose) {
			console.log('[ProgressTracker]', event);
		}
	}
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 创建进度跟踪器
 * @param config 配置
 * @returns 进度跟踪器实例
 */
export function createProgressTracker(config?: ProgressTrackerConfig): ProgressTracker {
	return new ProgressTracker(config);
}

/**
 * 计算进度百分比
 * @param current 当前值
 * @param total 总值
 * @returns 百分比 (0-100)
 */
export function calculatePercentage(current: number, total: number): number {
	if (total === 0) return 0;
	return Math.min(100, Math.floor((current / total) * 100));
}

/**
 * 格式化进度条
 * @param percentage 百分比
 * @param width 宽度（字符数）
 * @returns 进度条字符串
 */
export function formatProgressBar(percentage: number, width: number = 20): string {
	const filled = Math.floor((percentage / 100) * width);
	const empty = width - filled;
	return `[${'='.repeat(filled)}${' '.repeat(empty)}] ${percentage}%`;
}

/**
 * 格式化进度摘要
 * @param progress 进度对象
 * @returns 摘要字符串
 */
export function formatProgressSummary(progress: SyncProgress): string {
	const parts: string[] = [];

	parts.push(`${progress.status.toUpperCase()}`);

	if (progress.totalCount > 0) {
		parts.push(`${progress.processedCount}/${progress.totalCount}`);
		parts.push(`(${progress.percentage}%)`);
	}

	parts.push(`上传: ${progress.uploadedCount}`);
	parts.push(`跳过: ${progress.skippedCount}`);

	if (progress.failedCount > 0) {
		parts.push(`失败: ${progress.failedCount}`);
	}

	return parts.join(' | ');
}
