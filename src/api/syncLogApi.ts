import { invokeCommand as invoke } from './invokeClient'
import { isTauri } from './_shared'

/**
 * 同步日志条目（对应 Rust 端 SyncLogEntry）
 */
export interface SyncLogEntry {
  timestamp: string
  action: string
  sync_type: string
  status: string
  message: string
}

/**
 * 获取应用数据目录路径（Tauri 环境专用）。
 */
async function getAppDataDir(): Promise<string> {
  if (!isTauri) {
    throw new Error('同步日志功能仅在桌面应用（Tauri）环境中可用，浏览器预览模式不支持。')
  }
  const { appDataDir } = await import('@tauri-apps/api/path')
  return await appDataDir()
}

/**
 * 同步日志 API：封装后端的 list/clear sync_logs 命令。
 *
 * 日志存储在独立的 sync_logs.jsonl 文件中，不写入主数据库，
 * 避免远程覆盖数据库时日志丢失。
 */
export const syncLogApi = {
  /** 读取最近 N 条同步日志（默认 10 条） */
  listLogs: async (limit?: number): Promise<SyncLogEntry[]> => {
    const appDataDir = await getAppDataDir()
    return invoke<SyncLogEntry[]>('list_sync_logs', { appDataDir, limit })
  },

  /** 清空同步日志 */
  clearLogs: async (): Promise<void> => {
    const appDataDir = await getAppDataDir()
    return invoke<void>('clear_sync_logs', { appDataDir })
  },
}
