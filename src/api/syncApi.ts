import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './_shared'
import type { SyncConfig, SyncStatus } from '../types/sync'

/**
 * 获取应用数据目录路径（Tauri 环境专用）。
 *
 * 在 Tauri 桌面环境中，动态导入 `@tauri-apps/api/path` 并调用 `appDataDir()`；
 * 若运行在浏览器预览模式（非 Tauri），则抛出友好错误，避免调用失效。
 */
async function getAppDataDir(): Promise<string> {
  if (!isTauri) {
    throw new Error('数据同步功能仅在桌面应用（Tauri）环境中可用，浏览器预览模式不支持。')
  }
  const { appDataDir } = await import('@tauri-apps/api/path')
  return await appDataDir()
}

/**
 * 数据同步 API：封装后端 Git 同步相关命令。
 *
 * 对应 Rust command：
 * - get_sync_config / save_sync_config / init_sync_repo / sync_now / get_sync_status_cmd
 *
 * 注意：Rust 端字段为 snake_case（未设置 camelCase 重命名），
 * 前端 SyncConfig / SyncStatus 同样使用 snake_case 字段名以保持一致。
 */
export const syncApi = {
  /** 读取已保存的同步配置（未配置时返回 null） */
  getConfig: async (): Promise<SyncConfig | null> => {
    const appDataDir = await getAppDataDir()
    return invoke<SyncConfig | null>('get_sync_config', { appDataDir })
  },

  /** 保存同步配置到本地 */
  saveConfig: async (config: SyncConfig): Promise<void> => {
    const appDataDir = await getAppDataDir()
    return invoke<void>('save_sync_config', { config, appDataDir })
  },

  /** 初始化同步仓库（clone 远程仓库到本地数据目录） */
  initRepo: async (config: SyncConfig): Promise<void> => {
    const appDataDir = await getAppDataDir()
    return invoke<void>('init_sync_repo', { config, appDataDir })
  },

  /** 立即执行一次同步，返回最新同步状态 */
  syncNow: async (): Promise<SyncStatus> => {
    const appDataDir = await getAppDataDir()
    return invoke<SyncStatus>('sync_now', { appDataDir })
  },

  /** 获取当前同步状态（不触发同步操作） */
  getStatus: async (): Promise<SyncStatus> => {
    const appDataDir = await getAppDataDir()
    return invoke<SyncStatus>('get_sync_status_cmd', { appDataDir })
  },
}
