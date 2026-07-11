import type { TaskTemplate } from '../types/template'

/** 匹配 {变量名}，变量名仅允许字母、数字、下划线 */
const VARIABLE_PATTERN = /\{([A-Za-z0-9_]+)\}/g

/**
 * 从模板标题、备注、子任务标题中扫描变量名，按出现顺序去重。
 */
export function extractTemplateVariables(template: TaskTemplate): string[] {
  const names: string[] = []
  const seen = new Set<string>()

  const collect = (text?: string | null) => {
    if (!text) return
    VARIABLE_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = VARIABLE_PATTERN.exec(text)) !== null) {
      const name = match[1]
      if (!seen.has(name)) {
        seen.add(name)
        names.push(name)
      }
    }
  }

  collect(template.title_template)
  collect(template.notes_template)
  for (const sub of template.subtask_templates) {
    collect(sub.title)
  }

  return names
}

/**
 * 按 variables 映射替换文本中的 `{var}`。
 * - 映射中存在的变量（含空字符串）一律替换
 * - 未知变量保留原占位符
 */
export function applyTemplateVariables(text: string, variables: Record<string, string> = {}): string {
  if (!text || !text.includes('{')) return text
  return text.replace(VARIABLE_PATTERN, (full, name: string) => {
    if (Object.prototype.hasOwnProperty.call(variables, name)) {
      return variables[name] ?? ''
    }
    return full
  })
}

/**
 * 预览应用模板后的主任务标题 / 备注 / 子任务标题。
 * 仅用于 UI 预览；最终持久化由后端统一替换，避免前后端规则分叉。
 */
export function previewTemplateApplication(
  template: TaskTemplate,
  variables: Record<string, string> = {},
): { title: string; notes: string; subtaskTitles: string[] } {
  return {
    title: applyTemplateVariables(template.title_template, variables),
    notes: applyTemplateVariables(template.notes_template ?? '', variables),
    subtaskTitles: template.subtask_templates.map((s) => applyTemplateVariables(s.title, variables)),
  }
}

/**
 * 将用户输入的变量表单规范化为后端可消费的 map。
 * 空字符串会保留（表示显式清空占位符）。
 */
export function normalizeTemplateVariables(values: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (!key) continue
    result[key] = value ?? ''
  }
  return result
}
