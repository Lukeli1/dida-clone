import { invoke } from '@tauri-apps/api/core'

/** 导入结果：后端 import_json command 的返回值 */
export interface ImportResult {
  lists_imported: number
  tasks_imported: number
  tags_imported: number
  habits_imported: number
  habit_records_imported: number
}

/**
 * 数据导出/导入 API：封装后端的 export_json / export_csv / export_markdown / import_json 命令。
 *
 * - 导出命令返回对应格式的字符串，由前端负责写入用户选择的文件。
 * - 导入命令接收 JSON 字符串和模式（merge 合并 / replace 替换），返回 ImportResult。
 */
export const dataApi = {
  /** 导出为 JSON 字符串 */
  exportJson: (): Promise<string> => invoke<string>('export_json'),

  /** 导出为 CSV 字符串 */
  exportCsv: (): Promise<string> => invoke<string>('export_csv'),

  /** 导出为 Markdown 字符串 */
  exportMarkdown: (): Promise<string> => invoke<string>('export_markdown'),

  /** 导入 JSON 数据（mode: merge 合并 / replace 替换） */
  importJson: (json: string, mode: 'merge' | 'replace'): Promise<ImportResult> =>
    invoke<ImportResult>('import_json', { json, mode }),
}
