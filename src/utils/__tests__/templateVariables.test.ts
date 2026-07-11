import { describe, expect, it } from 'vitest'
import type { TaskTemplate } from '../../types/template'
import {
  applyTemplateVariables,
  extractTemplateVariables,
  normalizeTemplateVariables,
  previewTemplateApplication,
} from '../templateVariables'

function makeTemplate(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id: 1,
    name: '项目启动',
    title_template: '{project} 启动会',
    notes_template: '项目：{project}\n负责人：{owner}',
    priority: 1,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    subtask_templates: [
      { id: 1, template_id: 1, title: '准备 {project} 材料', sort_order: 0 },
      { id: 2, template_id: 1, title: '通知 {owner}', sort_order: 1 },
    ],
    ...overrides,
  }
}

describe('templateVariables', () => {
  it('扫描标题、备注、子任务中的变量并去重保序', () => {
    const names = extractTemplateVariables(makeTemplate())
    expect(names).toEqual(['project', 'owner'])
  })

  it('替换已知变量，保留未知变量，空值显式清空', () => {
    expect(applyTemplateVariables('启动 {project}', { project: 'Alpha' })).toBe('启动 Alpha')
    expect(applyTemplateVariables('备注 {empty} 结束', { empty: '' })).toBe('备注  结束')
    expect(applyTemplateVariables('未知 {owner}', { project: 'A' })).toBe('未知 {owner}')
    expect(applyTemplateVariables('无变量', {})).toBe('无变量')
  })

  it('预览一致覆盖父任务标题、备注和子任务', () => {
    const preview = previewTemplateApplication(makeTemplate(), { project: '滴答复刻' })
    expect(preview.title).toBe('滴答复刻 启动会')
    expect(preview.notes).toBe('项目：滴答复刻\n负责人：{owner}')
    expect(preview.subtaskTitles).toEqual(['准备 滴答复刻 材料', '通知 {owner}'])
  })

  it('normalizeTemplateVariables 保留空字符串', () => {
    expect(normalizeTemplateVariables({ project: 'A', owner: '' })).toEqual({
      project: 'A',
      owner: '',
    })
  })
})
