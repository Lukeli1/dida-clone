import { invokeCommand as invoke } from './invokeClient'
import { isTauri } from './_shared'

/** 导入结果：后端 import_json command 的返回值 */
export interface ImportResult {
  lists_imported: number
  tasks_imported: number
  tags_imported: number
  habits_imported: number
  habit_records_imported: number
}

/** 单表预览信息 */
export interface TablePreview {
  total: number
  will_import: number
  will_skip: number
  skip_reasons: string[]
}

/** 现有数据计数（replace 模式用） */
export interface ExistingCounts {
  lists: number
  tasks: number
  tags: number
  habits: number
  habit_records: number
}

/** 导入预览结果 */
export interface ImportPreviewResult {
  mode: string
  lists: TablePreview
  tags: TablePreview
  tasks: TablePreview
  habits: TablePreview
  habit_records: TablePreview
  will_delete_existing: boolean
  existing_counts: ExistingCounts | null
  attachment_note: string
}

/**
 * 获取应用数据目录路径（Tauri 环境专用）。
 */
async function getAppDataDir(): Promise<string> {
  if (!isTauri) {
    throw new Error('数据导入功能仅在桌面应用（Tauri）环境中可用，浏览器预览模式不支持。')
  }
  const { appDataDir } = await import('@tauri-apps/api/path')
  return await appDataDir()
}

/**
 * 数据导出/导入 API：封装后端的 export_json / export_csv / export_markdown / import_json / import_json_preview 命令。
 *
 * - 导出命令返回对应格式的字符串，由前端负责写入用户选择的文件。
 * - 导入命令接收 JSON 字符串和模式（merge 合并 / replace 替换），返回 ImportResult。
 * - importJsonPreview 不修改数据库，返回预览统计。
 *
 * 注意：JSON 导出含附件记录元信息，但不含附件文件本体；
 * 导入暂不支持恢复附件记录。
 */
export const dataApi = {
  /** 导出为 JSON 字符串 */
  exportJson: (): Promise<string> => invoke<string>('export_json'),

  /** 导出为 CSV 字符串 */
  exportCsv: (): Promise<string> => invoke<string>('export_csv'),

  /** 导出为 Markdown 字符串 */
  exportMarkdown: (): Promise<string> => invoke<string>('export_markdown'),

  /** 预览导入结果（不修改数据库） */
  importJsonPreview: async (json: string, mode: 'merge' | 'replace'): Promise<ImportPreviewResult> => {
    return invoke<ImportPreviewResult>('import_json_preview', { json, mode })
  },

  /** 导入 JSON 数据（mode: merge 合并 / replace 替换） */
  importJson: async (json: string, mode: 'merge' | 'replace'): Promise<ImportResult> => {
    const appDataDir = await getAppDataDir()
    return invoke<ImportResult>('import_json', { json, mode, appDataDir })
  },
}
