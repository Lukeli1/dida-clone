/**
 * 数据快照相关类型定义
 *
 * 对应 Rust 端的 SnapshotInfo / SnapshotResult / RestoreResult。
 */

/** 快照信息 */
export interface SnapshotInfo {
  /** 快照文件名 */
  file_name: string
  /** 创建原因 */
  reason: string
  /** 创建时间（ISO 8601） */
  created_at: string
  /** 文件大小（字节） */
  file_size: number
}

/** 创建快照的结果 */
export interface SnapshotResult {
  file_name: string
  message: string
}

/** 恢复快照的结果 */
export interface RestoreResult {
  message: string
  requires_restart: boolean
}
