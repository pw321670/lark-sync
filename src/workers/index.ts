/**
 * Workers 模块导出
 *
 * 注意：sync-worker.ts 是 Worker 脚本，不应直接导入。
 * 使用 SyncCoordinator 来管理 Worker。
 */

// 导出 Worker 脚本URL（用于动态创建 Worker）
export const SYNC_WORKER_URL = new URL('./sync-worker.ts', import.meta.url);
