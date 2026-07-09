import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Tauri invoke —— api.ts 从 @tauri-apps/api/core 引入 invoke，
// 统一 mock 后 dataApi 拿到的就是同一个 mock 函数。
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Mock @tauri-apps/api/path（importJson 内部调用 appDataDir）
vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('/mock/app/data/dir'),
}))

import { invoke } from '@tauri-apps/api/core'
import { dataApi, type ImportResult } from '../../api'

describe('dataApi 导出/导入', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dataApi.exportJson() 调用 invoke("export_json")', async () => {
    vi.mocked(invoke).mockResolvedValue('{"tasks":[]}')
    const result = await dataApi.exportJson()
    expect(invoke).toHaveBeenCalledWith('export_json')
    expect(result).toBe('{"tasks":[]}')
  })

  it('dataApi.exportCsv() 调用 invoke("export_csv")', async () => {
    vi.mocked(invoke).mockResolvedValue('title,completed\n买菜,false\n')
    const result = await dataApi.exportCsv()
    expect(invoke).toHaveBeenCalledWith('export_csv')
    expect(result).toBe('title,completed\n买菜,false\n')
  })

  it('dataApi.exportMarkdown() 调用 invoke("export_markdown")', async () => {
    vi.mocked(invoke).mockResolvedValue('# 任务清单\n\n- [ ] 买菜\n')
    const result = await dataApi.exportMarkdown()
    expect(invoke).toHaveBeenCalledWith('export_markdown')
    expect(result).toBe('# 任务清单\n\n- [ ] 买菜\n')
  })

  it('dataApi.importJson(json, "merge") 调用 invoke("import_json", { json, mode, appDataDir })', async () => {
    const importResult: ImportResult = {
      lists_imported: 1,
      tasks_imported: 2,
      tags_imported: 0,
      habits_imported: 0,
      habit_records_imported: 0,
    }
    vi.mocked(invoke).mockResolvedValue(importResult)
    const json = '{"tasks":[]}'
    const result = await dataApi.importJson(json, 'merge')
    expect(invoke).toHaveBeenCalledWith('import_json', { json, mode: 'merge', appDataDir: '/mock/app/data/dir' })
    expect(result).toEqual(importResult)
    expect(result.tasks_imported).toBe(2)
  })

  it('dataApi.importJson(json, "replace") 调用 invoke("import_json", { json, mode, appDataDir })', async () => {
    const importResult: ImportResult = {
      lists_imported: 0,
      tasks_imported: 0,
      tags_imported: 0,
      habits_imported: 0,
      habit_records_imported: 0,
    }
    vi.mocked(invoke).mockResolvedValue(importResult)
    const json = '{"tasks":[]}'
    const result = await dataApi.importJson(json, 'replace')
    expect(invoke).toHaveBeenCalledWith('import_json', { json, mode: 'replace', appDataDir: '/mock/app/data/dir' })
    expect(result).toEqual(importResult)
  })
})
