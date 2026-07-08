import { invokeCommand as invoke } from './invokeClient'
import { isTauri } from './_shared'

/**
 * 受控文件读写 API（P1-07 安全边界收紧）。
 *
 * 取代前端直接使用 @tauri-apps/plugin-fs 任意读写。
 * 后端通过系统对话框获取用户选择的路径，限制扩展名，拒绝目录路径。
 */

export interface ExportTextFileOptions {
  /** 默认文件名，如 dida-export-2026-07-07.json */
  defaultName: string
  /** 扩展名过滤，如 [{ name: 'JSON', extensions: 'json' }] */
  filters: Array<{ name: string; extensions: string }>
  /** 待写入的文本内容 */
  content: string
}

export interface ImportTextFileOptions {
  /** 扩展名过滤 */
  filters: Array<{ name: string; extensions: string }>
}

/** 导出文本文件：弹出保存对话框并写入。返回写入路径，用户取消返回 null。 */
export async function exportTextFile(opts: ExportTextFileOptions): Promise<string | null> {
  if (!isTauri) {
    // 非 Tauri 环境（浏览器预览）回退到 Blob 下载
    const blob = new Blob([opts.content], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = opts.defaultName
    a.click()
    URL.revokeObjectURL(url)
    return opts.defaultName
  }
  // 后端 filters 接收 Vec<(String, String)>，序列化为元组数组 [[name, exts], ...]
  const rustFilters: Array<[string, string]> = opts.filters.map((f) => [f.name, f.extensions])
  const result = await invoke<string | null>('export_text_file', {
    defaultName: opts.defaultName,
    filters: rustFilters,
    content: opts.content,
  })
  return result
}

/** 导入文本文件：弹出打开对话框并读取。返回 [文件名, 内容]，用户取消返回 null。 */
export async function importTextFile(opts: ImportTextFileOptions): Promise<[string, string] | null> {
  if (!isTauri) {
    return null
  }
  const rustFilters: Array<[string, string]> = opts.filters.map((f) => [f.name, f.extensions])
  const result = await invoke<[string, string] | null>('import_text_file', {
    filters: rustFilters,
  })
  return result
}
