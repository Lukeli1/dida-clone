import { useState } from 'react'
import { templateApi } from '../../api'
import type { TaskTemplate, CreateTemplateRequest, UpdateTemplateRequest } from '../../types/template'
import { useToast } from '../Toast'

interface TemplateEditorProps {
  template: TaskTemplate | null
  onSave: (saved: TaskTemplate) => void
  onCancel: () => void
}

const PRIORITY_OPTIONS = [
  { value: 0, label: '无' },
  { value: 1, label: '高' },
  { value: 2, label: '中' },
  { value: 3, label: '低' },
]

const PRESET_ICONS = ['📋', '📝', '💼', '🎯', '📌', '💡', '🔧', '📚', '🏠', '💰', '🏃', '🎉']

/** 模板编辑表单弹窗：创建/编辑模式 */
export function TemplateEditor({ template, onSave, onCancel }: TemplateEditorProps) {
  const isEdit = !!template
  const toast = useToast()

  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [icon, setIcon] = useState(template?.icon ?? '📋')
  const [titleTemplate, setTitleTemplate] = useState(template?.title_template ?? '')
  const [notesTemplate, setNotesTemplate] = useState(template?.notes_template ?? '')
  const [priority, setPriority] = useState(template?.priority ?? 0)
  const [subtasks, setSubtasks] = useState(
    template?.subtask_templates
      ? [...template.subtask_templates].sort((a, b) => a.sort_order - b.sort_order).map((s) => s.title)
      : ([] as string[]),
  )
  const [newSubtask, setNewSubtask] = useState('')
  const [saving, setSaving] = useState(false)

  const canSave = name.trim().length > 0 && titleTemplate.trim().length > 0

  function addSubtask() {
    const title = newSubtask.trim()
    if (!title) return
    setSubtasks([...subtasks, title])
    setNewSubtask('')
  }

  function removeSubtask(index: number) {
    setSubtasks(subtasks.filter((_, i) => i !== index))
  }

  function moveSubtask(index: number, direction: -1 | 1) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= subtasks.length) return
    const arr = [...subtasks]
    ;[arr[index], arr[newIndex]] = [arr[newIndex], arr[index]]
    setSubtasks(arr)
  }

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const subtaskTemplates = subtasks.map((title, i) => ({ title, sort_order: i }))

      if (isEdit && template) {
        const req: UpdateTemplateRequest = {
          id: template.id,
          name: name.trim(),
          description: description.trim() || undefined,
          icon,
          title_template: titleTemplate.trim(),
          notes_template: notesTemplate.trim() || undefined,
          priority,
          subtask_templates: subtaskTemplates,
        }
        const saved = await templateApi.updateTemplate(req)
        toast.success('模板已更新')
        onSave(saved)
      } else {
        const req: CreateTemplateRequest = {
          name: name.trim(),
          description: description.trim() || undefined,
          icon,
          title_template: titleTemplate.trim(),
          notes_template: notesTemplate.trim() || undefined,
          priority,
          subtask_templates: subtaskTemplates,
        }
        const saved = await templateApi.createTemplate(req)
        toast.success('模板创建成功')
        onSave(saved)
      }
    } catch (e) {
      console.error('保存模板失败:', e)
      toast.error('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onCancel}>
      <div
        className="bg-[var(--color-surface)] rounded-2xl shadow-xl border border-[var(--color-border)] p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-6">{isEdit ? '编辑模板' : '新建模板'}</h3>

        <div className="space-y-4">
          {/* 图标 + 名称 */}
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-14 h-14 rounded-xl bg-[var(--color-accent-light)] flex items-center justify-center text-3xl">
                {icon}
              </div>
            </div>
            <div className="flex-1 space-y-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSave) handleSave()
                }}
                autoFocus
                placeholder="模板名称"
                className="w-full px-4 py-2.5 text-base border border-[var(--color-border)] rounded-xl bg-[var(--color-bg)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
              />
              {/* 图标选择 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {PRESET_ICONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setIcon(emoji)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-xl transition-all ${
                      icon === emoji
                        ? 'bg-[var(--color-accent-light)] ring-2 ring-[var(--color-accent)]'
                        : 'hover:bg-[var(--color-bg-secondary)]'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">描述</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="模板的简要描述（可选）"
              className="w-full px-4 py-2.5 text-sm border border-[var(--color-border)] rounded-xl bg-[var(--color-bg)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
            />
          </div>

          {/* 任务标题模板 */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
              任务标题 <span className="text-[var(--color-danger)]">*</span>
            </label>
            <input
              type="text"
              value={titleTemplate}
              onChange={(e) => setTitleTemplate(e.target.value)}
              placeholder="创建任务时的默认标题"
              className="w-full px-4 py-2.5 text-sm border border-[var(--color-border)] rounded-xl bg-[var(--color-bg)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
            />
          </div>

          {/* 备注模板 */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">备注模板</label>
            <textarea
              value={notesTemplate}
              onChange={(e) => setNotesTemplate(e.target.value)}
              placeholder="创建任务时的默认备注（可选）"
              rows={3}
              className="w-full px-4 py-2.5 text-sm border border-[var(--color-border)] rounded-xl bg-[var(--color-bg)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 resize-none"
            />
          </div>

          {/* 优先级 */}
          <div className="flex items-center gap-4">
            <label className="w-20 text-sm font-medium text-[var(--color-text-secondary)] flex-shrink-0">优先级</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value)}
                  className={`px-4 py-1.5 text-sm rounded-lg border transition-all ${
                    priority === opt.value
                      ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 子任务模板列表 */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">子任务模板</label>
            {subtasks.length > 0 && (
              <ul className="space-y-1.5 mb-2">
                {subtasks.map((title, index) => (
                  <li key={index} className="flex items-center gap-2 group">
                    <span className="w-6 h-6 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-xs text-[var(--color-text-tertiary)] flex-shrink-0">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-sm text-[var(--color-text-primary)]">{title}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => moveSubtask(index, -1)}
                        disabled={index === 0}
                        className="w-6 h-6 flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] disabled:opacity-30"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSubtask(index, 1)}
                        disabled={index === subtasks.length - 1}
                        className="w-6 h-6 flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] disabled:opacity-30"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSubtask(index)}
                        className="w-6 h-6 flex items-center justify-center text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 rounded"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addSubtask()
                  }
                }}
                placeholder="添加子任务后按回车"
                className="flex-1 px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] focus:outline-none focus:border-[var(--color-accent)]"
              />
              <button
                type="button"
                onClick={addSubtask}
                disabled={!newSubtask.trim()}
                className="px-3 py-2 text-sm text-[var(--color-accent)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-accent-light)] disabled:opacity-40 transition-colors"
              >
                添加
              </button>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            type="button"
            onClick={onCancel}
            className="px-8 py-2.5 text-base text-[var(--color-text-secondary)] rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-12 py-2.5 text-base text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
