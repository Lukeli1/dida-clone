import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isTauri } from './_shared'

/** 更新检查结果 */
export interface UpdateInfo {
  available: boolean
  version?: string
  notes?: string
  date?: string
}

/**
 * 检查是否有可用更新。
 * 非 Tauri 环境返回 { available: false }。
 *
 * 错误处理策略：
 * - 404 / Not Found（尚未发布 Release）→ 返回 { available: false }，视为"已是最新"
 * - 其他网络错误 → 抛出异常，由调用方提示用户
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  if (!isTauri) return { available: false }
  try {
    const update = await check()
    if (update) {
      return {
        available: true,
        version: update.version,
        notes: update.body,
        date: update.date,
      }
    }
    return { available: false }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    console.error('检查更新失败:', e)
    // 404 / Not Found 表示尚未发布任何 Release，视为"无可用更新"而非错误
    if (errMsg.includes('404') || errMsg.includes('Not Found') || errMsg.includes('NoSuchKey')) {
      return { available: false }
    }
    throw e
  }
}

/**
 * 下载并安装更新，支持进度回调。
 * 安装完成后自动重启应用。
 */
export async function downloadAndInstall(
  onProgress?: (progress: { chunkLength: number; contentLength?: number }) => void,
): Promise<void> {
  if (!isTauri) throw new Error('非 Tauri 环境')
  const update = await check()
  if (!update) throw new Error('没有可用更新')

  let total = 0
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? 0
        break
      case 'Progress':
        onProgress?.({ chunkLength: event.data.chunkLength, contentLength: total })
        break
      case 'Finished':
        break
    }
  })

  // 安装完成后重启
  await relaunch()
}
