/**
 * 数据同步相关类型定义
 *
 * 对应 Rust 端的 SyncConfigDto / SyncStatusDto。
 * 注意：Rust 端未添加 #[serde(rename_all = "camelCase")]，
 * 因此 JSON 字段为 snake_case，前端需保持一致。
 */

/** 同步方式 */
export type SyncType = 'git' | 'webdav'

/** 同步配置 */
export interface SyncConfig {
  /** 远程仓库 URL（Git 模式） */
  repo_url: string
  /** 分支名（Git 模式） */
  branch: string
  /** 是否启用自动同步 */
  auto_sync: boolean
  /** 自动同步间隔（秒） */
  auto_sync_interval_secs: number
  /** 同步方式：git / webdav（空值视为 git） */
  sync_type?: SyncType | ''
  /** WebDAV 服务地址（WebDAV 模式） */
  webdav_url?: string | null
  /** WebDAV 用户名 */
  webdav_username?: string | null
  /** WebDAV 密码（坚果云为应用密码） */
  webdav_password?: string | null
  /** WebDAV 远程文件路径，如 /dida-clone/dida.db */
  webdav_remote_path?: string | null
}

/** 同步状态 */
export interface SyncStatus {
  /** 是否已启用同步 */
  enabled: boolean
  /** 领先远程的提交数（Git 模式） */
  ahead: number
  /** 落后远程的提交数（Git 模式） */
  behind: number
  /** 上次同步时间（ISO 8601 字符串） */
  last_sync: string
  /** 是否存在冲突 */
  has_conflict: boolean
  /** 冲突详情信息（无冲突时为 null） */
  conflict_message: string | null
}

/** WebDAV 同步结果 */
export type WebDavSyncResult = 'upload' | 'download' | 'no-change'
