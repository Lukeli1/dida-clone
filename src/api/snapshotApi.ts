import { invokeCommand as invoke } from './invokeClient'
import { isTauri } from './_shared'
import type { SnapshotInfo, SnapshotResult, RestoreResult } from '../types/snapshot'

/**
 * 获取应用数据目录路径（Tauri 环境专用）。
 */
async function getAppDataDir(): Promise<string> {
  if (!isTauri) {
    throw new Error('快照功能仅在桌面应用（Tauri）环境中可用，浏览器预览模式不支持。')
  }
  const { appDataDir } = await import('@tauri-apps/api/path')
  return await appDataDir()
}

/**
 * 数据快照 API：封装后端的 create/list/restore/delete snapshot 命令。
 *
 * 快照使用 SQLite VACUUM INTO 创建，正确处理 WAL 模式。
 * 恢复采用 pending-restore + 重启策略，避免长期连接冲突。
 */
export const snapshotApi = {
  /** 创建数据快照 */
  createSnapshot: async (reason: string): Promise<SnapshotResult> => {
    const appDataDir = await getAppDataDir()
    return invoke<SnapshotResult>('create_data_snapshot', { appDataDir, reason })
  },

  /** 列出所有快照 */
  listSnapshots: async (): Promise<SnapshotInfo[]> => {
    const appDataDir = await getAppDataDir()
    return invoke<SnapshotInfo[]>('list_data_snapshots', { appDataDir })
  },

  /** 恢复快照（需要重启应用完成） */
  restoreSnapshot: async (fileName: string): Promise<RestoreResult> => {
    const appDataDir = await getAppDataDir()
    return invoke<RestoreResult>('restore_data_snapshot', { appDataDir, fileName })
  },

  /** 删除指定快照 */
  deleteSnapshot: async (fileName: string): Promise<void> => {
    const appDataDir = await getAppDataDir()
    return invoke<void>('delete_data_snapshot', { appDataDir, fileName })
  },
}
