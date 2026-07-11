import { useEffect, useMemo, useState } from 'react'
import { listApi, tagApi, templateApi } from '../../api'
import { useListStore } from '../../stores/listStore'
import { useTagStore } from '../../stores/tagStore'
import type { List, Tag } from '../../types'
import type { ApplyTemplateRequest, TaskTemplate } from '../../types/template'
import { toLocalDueDateIso } from '../../utils/templateApply'
import {
  extractTemplateVariables,
  normalizeTemplateVariables,
  previewTemplateApplication,
} from '../../utils/templateVariables'
import { useToast } from '../Toast'

export interface ApplyTemplateDialogProps {
  template: TaskTemplate
  /**
   * 仅当传入且仍存在于用户清单中时预填。
   * 无效 / 未传时保持“请选择清单”，禁止静默回退到收件箱。
   */
  defaultListId?: number | null
  onApplied: (taskTitle: string) => void
  onCancel: () => void
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err.trim()) return err
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  return fallback
}

/**
 * 应用模板配置弹窗：
 * - 清单必选（使用真实用户清单，不硬编码 list_id=1）
 * - 日期可选、标签多选可选、变量输入
 * - 提交中 / 加载失败 / 校验失败均有可恢复状态
 */
export function ApplyTemplateDialog({ template, defaultListId = null, onApplied, onCancel }: ApplyTemplateDialogProps) {
  const toast = useToast()
  const storeLists = useListStore((s) => s.lists)
  const setLists = useListStore((s) => s.setLists)
  const storeTags = useTagStore((s) => s.tags)
  const setTags = useTagStore((s) => s.setTags)

  const variableNames = useMemo(() => extractTemplateVariables(template), [template])

  const [lists, setLocalLists] = useState<List[]>(storeLists)
  const [tags, setLocalTags] = useState<Tag[]>(storeTags)
  const [listId, setListId] = useState<number | ''>('')
  const [dueDate, setDueDate] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [variables, setVariables] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const name of variableNames) initial[name] = ''
    return initial
  })
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadMeta() {
      setLoadingMeta(true)
      setLoadError(null)
      try {
        // 直接走 API：store 的 load* 会吞掉错误，无法给用户可恢复提示
        const [nextLists, nextTags] = await Promise.all([listApi.getLists(), tagApi.getTags()])
        if (cancelled) return
        setLocalLists(nextLists)
        setLocalTags(nextTags)
        setLists(nextLists)
        setTags(nextTags)
      } catch (e) {
        if (!cancelled) {
          setLoadError(errorMessage(e, '加载清单或标签失败，请重试'))
        }
      } finally {
        if (!cancelled) setLoadingMeta(false)
      }
    }
    void loadMeta()
    return () => {
      cancelled = true
    }
  }, [setLists, setTags])

  // 仅在调用方传入且仍然有效的 defaultListId 时预填；否则保持未选中，要求用户显式选择
  useEffect(() => {
    if (loadingMeta || lists.length === 0) return
    setListId((prev) => {
      if (prev !== '' && lists.some((l) => l.id === prev)) return prev
      if (defaultListId != null && lists.some((l) => l.id === defaultListId)) {
        return defaultListId
      }
      return ''
    })
  }, [loadingMeta, lists, defaultListId])

  const preview = useMemo(
    () => previewTemplateApplication(template, normalizeTemplateVariables(variables)),
    [template, variables],
  )

  const canSubmit = !loadingMeta && !loadError && !submitting && listId !== '' && lists.some((l) => l.id === listId)

  function toggleTag(tagId: number) {
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]))
  }

  async function handleRetryLoad() {
    setLoadingMeta(true)
    setLoadError(null)
    try {
      const [nextLists, nextTags] = await Promise.all([listApi.getLists(), tagApi.getTags()])
      setLocalLists(nextLists)
      setLocalTags(nextTags)
      setLists(nextLists)
      setTags(nextTags)
    } catch (e) {
      setLoadError(errorMessage(e, '加载清单或标签失败，请重试'))
    } finally {
      setLoadingMeta(false)
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return
    if (typeof listId !== 'number') return
    const selectedListId = listId
    setFormError(null)
    setSubmitting(true)
    try {
      const req: ApplyTemplateRequest = {
        templateId: template.id,
        listId: selectedListId,
        dueDate: toLocalDueDateIso(dueDate),
        tagIds: selectedTagIds,
        variables: normalizeTemplateVariables(variables),
      }
      const task = await templateApi.applyTemplate(req)
      toast.success(`已从模板「${template.name}」创建任务`)
      onApplied(task?.title ?? preview.title)
    } catch (e) {
      console.error('应用模板失败:', e)
      const msg = errorMessage(e, '应用失败，请重试')
      setFormError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-3"
      onClick={() => {
        // 提交中禁止遮罩关闭，避免请求继续、用户重复打开造成重复任务
        if (!submitting) onCancel()
      }}
      role="presentation"
    >
      <div
        className="bg-[var(--color-surface)] rounded-2xl shadow-xl border border-[var(--color-border)] p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-template-title"
      >
        <div className="flex items-start gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-[var(--color-accent-light)] flex items-center justify-center text-2xl flex-shrink-0">
            {template.icon ?? '📋'}
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="apply-template-title" className="text-lg font-bold text-[var(--color-text-primary)] truncate">
              应用模板
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-0.5 truncate">{template.name}</p>
          </div>
        </div>

        {loadingMeta ? (
          <div className="py-10 text-center text-sm text-[var(--color-text-tertiary)]">加载清单与标签...</div>
        ) : loadError ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-[var(--color-danger)]">{loadError}</p>
            <button
              type="button"
              onClick={handleRetryLoad}
              className="px-4 py-2 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
            >
              重试
            </button>
          </div>
        ) : lists.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm text-[var(--color-danger)]">暂无可用清单，无法应用模板</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">请先在侧边栏创建清单后再试</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 目标清单（必选） */}
            <div>
              <label
                htmlFor="apply-template-list"
                className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5"
              >
                目标清单 <span className="text-[var(--color-danger)]">*</span>
              </label>
              <select
                id="apply-template-list"
                value={listId === '' ? '' : String(listId)}
                onChange={(e) => {
                  const val = e.target.value
                  setListId(val ? Number(val) : '')
                  setFormError(null)
                }}
                className="w-full px-3 py-2.5 text-sm border border-[var(--color-border)] rounded-xl bg-[var(--color-bg)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                disabled={submitting}
              >
                <option value="" disabled>
                  请选择清单
                </option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                    {list.is_default ? '（默认）' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 截止日期（可选） */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
                截止日期
                <span className="ml-1 text-xs font-normal text-[var(--color-text-tertiary)]">可选</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={submitting}
                  className="flex-1 min-w-0 px-3 py-2.5 text-sm border border-[var(--color-border)] rounded-xl bg-[var(--color-bg)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                />
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => setDueDate('')}
                    disabled={submitting}
                    className="px-3 py-2.5 text-sm text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-bg-secondary)] flex-shrink-0"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>

            {/* 标签多选（可选） */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
                标签
                <span className="ml-1 text-xs font-normal text-[var(--color-text-tertiary)]">可选，仅写入主任务</span>
              </label>
              {tags.length === 0 ? (
                <p className="text-xs text-[var(--color-text-tertiary)] py-1">暂无标签</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {tags.map((tag) => {
                    const selected = selectedTagIds.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        disabled={submitting}
                        className={`px-2.5 py-1 text-xs rounded-full border transition-colors max-w-full truncate ${
                          selected
                            ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                            : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                        }`}
                        title={tag.name}
                      >
                        {tag.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 变量输入 */}
            {variableNames.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">模板变量</label>
                <div className="space-y-2">
                  {variableNames.map((name) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="w-24 flex-shrink-0 text-xs font-mono text-[var(--color-text-tertiary)] truncate">
                        {`{${name}}`}
                      </span>
                      <input
                        type="text"
                        value={variables[name] ?? ''}
                        onChange={(e) => setVariables((prev) => ({ ...prev, [name]: e.target.value }))}
                        placeholder={`输入 ${name} 的值`}
                        disabled={submitting}
                        className="flex-1 min-w-0 px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] focus:outline-none focus:border-[var(--color-accent)]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 预览 */}
            <div className="rounded-xl bg-[var(--color-bg-tertiary)] px-3 py-2.5 space-y-1">
              <p className="text-xs text-[var(--color-text-tertiary)]">预览</p>
              <p className="text-sm font-medium text-[var(--color-text-primary)] break-words">
                {preview.title || '（空标题）'}
              </p>
              {preview.notes && (
                <p className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap break-words line-clamp-3">
                  {preview.notes}
                </p>
              )}
              {preview.subtaskTitles.length > 0 && (
                <ul className="text-xs text-[var(--color-text-secondary)] space-y-0.5 pt-1">
                  {preview.subtaskTitles.slice(0, 4).map((title, idx) => (
                    <li key={`${idx}-${title}`} className="truncate">
                      · {title}
                    </li>
                  ))}
                  {preview.subtaskTitles.length > 4 && (
                    <li className="text-[var(--color-text-tertiary)]">+{preview.subtaskTitles.length - 4} 更多...</li>
                  )}
                </ul>
              )}
            </div>

            {formError && (
              <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger)]/10 rounded-lg px-3 py-2 break-words">
                {formError}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-5 py-2 text-sm text-[var(--color-text-secondary)] rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-6 py-2 text-sm text-white rounded-xl bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? '应用中...' : '确认应用'}
          </button>
        </div>
      </div>
    </div>
  )
}
