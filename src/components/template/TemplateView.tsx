import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { templateApi } from '../../api'
import { useUIStore } from '../../stores/uiStore'
import type { TaskTemplate } from '../../types/template'
import { getPriorityStyle } from '../../utils/priority'
import { TemplateEditor } from './TemplateEditor'
import { useConfirm } from '../common/ConfirmDialog'
import { useToast } from '../Toast'

const PRIORITY_LABELS: Record<number, string> = { 0: '无', 1: '高', 2: '中', 3: '低' }

/** 模板视图：网格卡片展示 + 创建/编辑/删除/应用 */
export function TemplateView() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditor, setShowEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null)

  const confirm = useConfirm()
  const toast = useToast()
  // 次要数据（习惯/模板）是否已就绪：未就绪时显示局部 loading，避免渲染空状态
  const secondaryDataLoaded = useUIStore((s) => s.secondaryDataLoaded)
  const today = new Date()

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true)
      const list = await templateApi.getTemplates()
      setTemplates(list)
    } catch (e) {
      console.error('加载模板失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  function handleCreate() {
    setEditingTemplate(null)
    setShowEditor(true)
  }

  function handleEdit(template: TaskTemplate) {
    setEditingTemplate(template)
    setShowEditor(true)
  }

  function handleEditorSave(saved: TaskTemplate) {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === saved.id)
      if (exists) {
        return prev.map((t) => (t.id === saved.id ? saved : t))
      }
      return [...prev, saved]
    })
    setShowEditor(false)
    setEditingTemplate(null)
  }

  function handleEditorCancel() {
    setShowEditor(false)
    setEditingTemplate(null)
  }

  async function handleDelete(template: TaskTemplate) {
    const ok = await confirm({
      title: '删除模板',
      message: `确定删除模板「${template.name}」吗？`,
      danger: true,
      confirmText: '删除',
      cancelText: '取消',
    })
    if (!ok) return
    try {
      await templateApi.deleteTemplate(template.id)
      setTemplates((prev) => prev.filter((t) => t.id !== template.id))
      toast.success('模板已删除')
    } catch (e) {
      console.error('删除模板失败:', e)
      toast.error('删除失败，请重试')
    }
  }

  async function handleApply(template: TaskTemplate) {
    try {
      // 使用默认清单（list_id = 1，即"收件箱"）
      await templateApi.applyTemplate(template.id, 1)
      toast.success(`已从模板「${template.name}」创建任务`)
    } catch (e) {
      console.error('应用模板失败:', e)
      toast.error('应用失败，请重试')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-bg-secondary)] p-6">
      <div className="max-w-5xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">任务模板</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {format(today, 'yyyy年M月d日 EEEE', { locale: zhCN })}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg transition-colors hover:opacity-90"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建模板
          </button>
        </div>

        {/* 模板网格 */}
        {loading || !secondaryDataLoaded ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-[var(--color-text-tertiary)]">加载中...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 mb-5 rounded-2xl bg-[var(--color-bg-tertiary)] flex items-center justify-center">
              <svg
                className="w-10 h-10 text-[var(--color-text-muted)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                />
              </svg>
            </div>
            <p className="text-[15px] font-semibold text-[var(--color-text-secondary)]">暂无模板</p>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1.5 max-w-xs">
              创建任务模板，快速生成重复性任务（含子任务、备注、优先级）
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onApply={() => handleApply(template)}
                onEdit={() => handleEdit(template)}
                onDelete={() => handleDelete(template)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 编辑/创建弹窗 */}
      {showEditor && (
        <TemplateEditor template={editingTemplate} onSave={handleEditorSave} onCancel={handleEditorCancel} />
      )}
    </div>
  )
}

/** 单个模板卡片 */
function TemplateCard({
  template,
  onApply,
  onEdit,
  onDelete,
}: {
  template: TaskTemplate
  onApply: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const priorityStyle = getPriorityStyle(template.priority)

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 flex flex-col gap-3 transition-all hover:shadow-md hover:border-[var(--color-accent)]/30 group">
      {/* 头部：图标 + 名称 + 优先级 */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-[var(--color-accent-light)] flex items-center justify-center text-2xl flex-shrink-0">
          {template.icon ?? '📋'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)] truncate">{template.name}</h3>
          {template.description && (
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 line-clamp-2">{template.description}</p>
          )}
        </div>
        {/* 优先级标签 */}
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${priorityStyle.bg} ${priorityStyle.text} flex-shrink-0`}
        >
          {PRIORITY_LABELS[template.priority] ?? '无'}
        </span>
      </div>

      {/* 任务标题预览 */}
      <div className="text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] rounded-lg px-3 py-2">
        <span className="text-[var(--color-text-tertiary)] text-xs">任务标题：</span>
        <span className="font-medium">{template.title_template}</span>
      </div>

      {/* 子任务预览 */}
      {template.subtask_templates.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-[var(--color-text-tertiary)]">子任务（{template.subtask_templates.length}）</p>
          <ul className="space-y-0.5">
            {template.subtask_templates.slice(0, 3).map((st) => (
              <li key={st.id} className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1.5">
                <svg
                  className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {st.title}
              </li>
            ))}
            {template.subtask_templates.length > 3 && (
              <li className="text-xs text-[var(--color-text-tertiary)] pl-4">
                +{template.subtask_templates.length - 3} 更多...
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 mt-auto pt-2">
        <button
          type="button"
          onClick={onApply}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          应用
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="px-3 py-2 text-sm text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors"
          title="编辑"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="px-3 py-2 text-sm text-[var(--color-danger)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-danger)]/10 transition-colors"
          title="删除"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
