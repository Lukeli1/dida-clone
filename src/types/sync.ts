/**
 * 数据同步相关类型定义
 *
 * 对应 Rust 端的 SyncConfigDto / SyncStatusDto。
 * 注意：Rust 端未添加 #[serde(rename_all = "camelCase")]，
 * 因此 JSON 字段为 snake_case，前端需保持一致。
 */

/** 同步配置 */
export interface SyncConfig {
  /** 远程仓库 URL */
  repo_url: string
  /** 分支名 */
  branch: string
  /** 是否启用自动同步 */
  auto_sync: boolean
  /** 自动同步间隔（秒） */
  auto_sync_interval_secs: number
}

/** 同步状态 */
export interface SyncStatus {
  /** 是否已启用同步 */
  enabled: boolean
  /** 领先远程的提交数 */
  ahead: number
  /** 落后远程的提交数 */
  behind: number
  /** 上次同步时间（ISO 8601 字符串） */
  last_sync: string
  /** 是否存在冲突 */
  has_conflict: boolean
  /** 冲突详情信息（无冲突时为 null） */
  conflict_message: string | null
}
