import { useState, useEffect, useCallback } from 'react'
import type {
  Goal,
  GoalType,
  GoalKeyResult,
  CreateGoalRequest,
  UpdateGoalRequest,
} from '../../api/goalApi'
import { goalApi, formatKeyResultProgress } from '../../api/goalApi'

/** 预设颜色（与 PRESET_COLORS 一致） */
const PRESET_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B', '#10B981', '#06B6D4', '#6B7280']

/** 目标类型选项 */
const TYPE_OPTIONS: { value: GoalType; label: string }[] = [
  { value: 'annual', label: '年度目标' },
  { value: 'quarterly', label: '季度目标' },
  { value: 'monthly', label: '月度目标' },
]

/** 本地编辑中的 KR 草稿（新建时 id 为 null） */
interface KrDraft {
  id: number | null
  title: string
  targetValue: string
  currentValue: string
  unit: string
}

function emptyDraft(): KrDraft {
  return {
    id: null,
    title: '',
    targetValue: '',
    currentValue: '0',
    unit: '',
  }
}

function krToDraft(kr: GoalKeyResult): KrDraft {
  return {
    id: kr.id,
    title: kr.title,
    targetValue: String(kr.target_value),
    currentValue: String(kr.current_value),
    unit: kr.unit ?? '',
  }
}

function parseNonNegNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return n
}

export interface GoalEditorProps {
  /** 编辑时传入已有目标；新建时为 null */
  goal: Goal | null
  /** 保存回调：新建时传 CreateGoalRequest，编辑时传 { id, updates } */
  onSave: (payload: {
    create?: CreateGoalRequest
    update?: { id: number; updates: UpdateGoalRequest }
  }) => Promise<void> | void
  onCancel: () => void
  /** KR 变更后通知父组件刷新目标进度（仅编辑已有目标时） */
  onKeyResultsChange?: (goalId: number) => void
}

/**
 * 目标创建/编辑对话框（类似 ConfirmDialog 的 overlay 形式）。
 *
 * 字段：标题 / 描述 / 类型 / 周期起止 / 颜色。
 * 编辑模式下额外支持 KR 的增删改。
 * 编辑模式下不支持修改类型（类型决定周期语义，修改意义不大）。
 */
export function GoalEditor({ goal, onSave, onCancel, onKeyResultsChange }: GoalEditorProps) {
  const isEdit = !!goal

  const [title, setTitle] = useState(goal?.title ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const [goalType, setGoalType] = useState<GoalType>(goal?.type ?? 'quarterly')
  const [periodStart, setPeriodStart] = useState(goal?.period_start.slice(0, 10) ?? '')
  const [periodEnd, setPeriodEnd] = useState(goal?.period_end.slice(0, 10) ?? '')
  const [color, setColor] = useState(goal?.color ?? PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)

  const [keyResults, setKeyResults] = useState<GoalKeyResult[]>([])
  const [krLoading, setKrLoading] = useState(false)
  const [draft, setDraft] = useState<KrDraft>(emptyDraft())
  const [editingKrId, setEditingKrId] = useState<number | null>(null)
  const [krError, setKrError] = useState<string | null>(null)
  const [krSaving, setKrSaving] = useState(false)

  // 切换 goal 时重置表单（避免复用组件时状态残留）
  useEffect(() => {
    setTitle(goal?.title ?? '')
    setDescription(goal?.description ?? '')
    setGoalType(goal?.type ?? 'quarterly')
    setPeriodStart(goal?.period_start.slice(0, 10) ?? '')
    setPeriodEnd(goal?.period_end.slice(0, 10) ?? '')
    setColor(goal?.color ?? PRESET_COLORS[0])
    setDraft(emptyDraft())
    setEditingKrId(null)
    setKrError(null)
  }, [goal])

  const loadKeyResults = useCallback(async (goalId: number) => {
    setKrLoading(true)
    try {
      const list = await goalApi.getKeyResults(goalId)
      setKeyResults(list)
    } catch (e) {
      console.error('加载关键结果失败:', e)
      setKrError('加载关键结果失败')
    } finally {
      setKrLoading(false)
    }
  }, [])

  useEffect(() => {
    if (goal?.id) {
      void loadKeyResults(goal.id)
    } else {
      setKeyResults([])
    }
  }, [goal?.id, loadKeyResults])

  const canSave = title.trim().length > 0 && periodStart.length > 0 && periodEnd.length > 0

  // 根据类型自动填充周期（仅在新建模式且起止未填时）
  function autoFillPeriod(type: GoalType) {
    const now = new Date()
    const pad = (d: Date) => d.toISOString().slice(0, 10)
    let start = new Date(now.getFullYear(), now.getMonth(), 1)
    let end = new Date(now.getFullYear(), now.getMonth(), 1)
    if (type === 'monthly') {
      // 当月起止
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    } else if (type === 'quarterly') {
      // 当季起止（Q1=1-3月，Q2=4-6月，Q3=7-9月，Q4=10-12月）
      const q = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), q * 3, 1)
      end = new Date(now.getFullYear(), q * 3 + 3, 0)
    } else if (type === 'annual') {
      // 当年起止
      start = new Date(now.getFullYear(), 0, 1)
      end = new Date(now.getFullYear(), 11, 31)
    }
    setPeriodStart(pad(start))
    setPeriodEnd(pad(end))
  }

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      if (isEdit && goal) {
        // 编辑模式：仅更新可变字段（title / description / color）
        // 不修改 type / period（避免破坏周期语义），如需修改请新建目标
        const updates: UpdateGoalRequest = {
          title: title.trim(),
          description: description.trim() || undefined,
          color,
        }
        await onSave({ update: { id: goal.id, updates } })
      } else {
        // 新建模式
        const req: CreateGoalRequest = {
          title: title.trim(),
          description: description.trim() || undefined,
          goalType,
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
          color,
        }
        await onSave({ create: req })
      }
    } finally {
      setSaving(false)
    }
  }

  function validateDraft(d: KrDraft): { title: string; targetValue: number; currentValue: number; unit: string | null } | string {
    const t = d.title.trim()
    if (!t) return '请填写关键结果标题'

    const targetValue = parseNonNegNumber(d.targetValue)
    if (targetValue === null) return '目标值必须是有效数字'
    if (targetValue <= 0) return '目标值必须大于 0'

    const currentValue = parseNonNegNumber(d.currentValue)
    if (currentValue === null) return '当前值必须是有效数字'
    if (currentValue < 0) return '当前值不能为负数'

    const unit = d.unit.trim()
    return {
      title: t,
      targetValue,
      currentValue,
      unit: unit || null,
    }
  }

  function startEditKr(kr: GoalKeyResult) {
    setEditingKrId(kr.id)
    setDraft(krToDraft(kr))
    setKrError(null)
  }

  function cancelKrEdit() {
    setEditingKrId(null)
    setDraft(emptyDraft())
    setKrError(null)
  }

  async function handleSaveKr() {
    if (!goal || krSaving) return
    const validated = validateDraft(draft)
    if (typeof validated === 'string') {
      setKrError(validated)
      return
    }
    setKrSaving(true)
    setKrError(null)
    try {
      if (editingKrId != null) {
        await goalApi.updateKeyResult(editingKrId, {
          title: validated.title,
          targetValue: validated.targetValue,
          currentValue: validated.currentValue,
          // 空字符串清空单位（与 UpdateGoalKeyResultRequest 契约一致）
          unit: validated.unit ?? '',
        })
      } else {
        await goalApi.createKeyResult({
          goalId: goal.id,
          title: validated.title,
          targetValue: validated.targetValue,
          currentValue: validated.currentValue,
          ...(validated.unit != null ? { unit: validated.unit } : {}),
        })
      }
      await loadKeyResults(goal.id)
      onKeyResultsChange?.(goal.id)
      cancelKrEdit()
    } catch (e) {
      console.error('保存关键结果失败:', e)
      setKrError(e instanceof Error ? e.message : '保存关键结果失败')
    } finally {
      setKrSaving(false)
    }
  }

  async function handleDeleteKr(kr: GoalKeyResult) {
    if (!goal || krSaving) return
    setKrSaving(true)
    setKrError(null)
    try {
      await goalApi.deleteKeyResult(kr.id)
      if (editingKrId === kr.id) {
        cancelKrEdit()
      }
      await loadKeyResults(goal.id)
      onKeyResultsChange?.(goal.id)
    } catch (e) {
      console.error('删除关键结果失败:', e)
      setKrError(e instanceof Error ? e.message : '删除关键结果失败')
    } finally {
      setKrSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 transition-opacity duration-150"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="absolute inset-0 bg-[var(--color-mask)]" />
      <div
        className="relative bg-[var(--color-surface)] rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 transition-transform duration-150"
        style={{ boxShadow: 'var(--shadow-modal)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-editor-title"
      >
        <h3 id="goal-editor-title" className="text-base font-semibold text-[var(--color-text-primary)] mb-4">
          {isEdit ? '编辑目标' : '新建目标'}
        </h3>

        <div className="space-y-4">
          {/* 标题 */}
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave && !saving) handleSave()
              }}
              autoFocus
              placeholder="例如：2026 Q2 完成 OKR 系统"
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-accent)] bg-[var(--color-surface)]"
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="目标的详细说明、关键结果等"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-accent)] bg-[var(--color-surface)] resize-none"
            />
          </div>

          {/* 类型（仅新建时可修改） */}
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">类型</label>
            <div className="flex items-center gap-2">
              <select
                value={goalType}
                onChange={(e) => setGoalType(e.target.value as GoalType)}
                disabled={isEdit}
                className="flex-1 px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-accent)] bg-[var(--color-surface)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => autoFillPeriod(goalType)}
                  className="px-3 py-2 text-xs text-[var(--color-accent)] border border-[var(--color-accent)]/30 rounded-lg hover:bg-[var(--color-accent)]/10 transition-colors whitespace-nowrap"
                >
                  自动填充周期
                </button>
              )}
            </div>
            {isEdit && (
              <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">类型不可修改（如需变更请新建目标）</p>
            )}
          </div>

          {/* 周期 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">周期开始</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                disabled={isEdit}
                className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-accent)] bg-[var(--color-surface)] disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">周期结束</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                disabled={isEdit}
                className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-accent)] bg-[var(--color-surface)] disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* 颜色 */}
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">颜色</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all flex items-center justify-center ${
                    color === c ? 'ring-2 ring-offset-2 ring-[var(--color-accent)] scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`选择颜色 ${c}`}
                >
                  {color === c && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 关键结果：仅编辑已有目标时可用（新建需先保存目标） */}
          {isEdit && goal && (
            <div className="border-t border-[var(--color-border-light)] pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
                  关键结果（KR）
                </label>
                {krLoading && (
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">加载中...</span>
                )}
              </div>

              {keyResults.length > 0 ? (
                <ul className="space-y-2 mb-3" data-testid="kr-list">
                  {keyResults.map((kr) => (
                    <li
                      key={kr.id}
                      className="flex items-start gap-2 rounded-lg border border-[var(--color-border-light)] px-2.5 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[var(--color-text-primary)] truncate">{kr.title}</div>
                        <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
                          {formatKeyResultProgress(kr)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEditKr(kr)}
                        disabled={krSaving}
                        className="px-2 py-1 text-[11px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded hover:bg-[var(--color-bg-secondary)] disabled:opacity-40"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteKr(kr)}
                        disabled={krSaving}
                        className="px-2 py-1 text-[11px] text-[var(--color-danger)] border border-[var(--color-border)] rounded hover:bg-[var(--color-danger)]/10 disabled:opacity-40"
                      >
                        删除
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                !krLoading && (
                  <p className="text-[11px] text-[var(--color-text-tertiary)] mb-3">
                    暂无关键结果。添加后，目标进度将按 KR 平均完成度计算。
                  </p>
                )
              )}

              <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2 bg-[var(--color-bg-secondary)]/40">
                <div className="text-[11px] font-medium text-[var(--color-text-secondary)]">
                  {editingKrId != null ? '编辑关键结果' : '新增关键结果'}
                </div>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="例如：阅读 12 本书"
                  aria-label="关键结果标题"
                  className="w-full px-2.5 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-accent)] bg-[var(--color-surface)]"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-[var(--color-text-tertiary)] mb-0.5">当前值</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={draft.currentValue}
                      onChange={(e) => setDraft((d) => ({ ...d, currentValue: e.target.value }))}
                      aria-label="当前值"
                      className="w-full px-2 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-accent)] bg-[var(--color-surface)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--color-text-tertiary)] mb-0.5">目标值</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={draft.targetValue}
                      onChange={(e) => setDraft((d) => ({ ...d, targetValue: e.target.value }))}
                      aria-label="目标值"
                      className="w-full px-2 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-accent)] bg-[var(--color-surface)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[var(--color-text-tertiary)] mb-0.5">单位</label>
                    <input
                      type="text"
                      value={draft.unit}
                      onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
                      placeholder="本/次"
                      aria-label="单位"
                      className="w-full px-2 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-accent)] bg-[var(--color-surface)]"
                    />
                  </div>
                </div>
                {krError && (
                  <p className="text-[11px] text-[var(--color-danger)]" role="alert" data-testid="kr-error">
                    {krError}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2">
                  {editingKrId != null && (
                    <button
                      type="button"
                      onClick={cancelKrEdit}
                      disabled={krSaving}
                      className="px-3 py-1.5 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] rounded-lg hover:bg-[var(--color-bg-tertiary)]/80 disabled:opacity-40"
                    >
                      取消编辑
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveKr}
                    disabled={krSaving}
                    className="px-3 py-1.5 text-xs text-white bg-[var(--color-accent)] rounded-lg hover:brightness-110 disabled:opacity-40"
                  >
                    {krSaving ? '保存中...' : editingKrId != null ? '保存 KR' : '添加 KR'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {!isEdit && (
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              提示：先保存目标后，再在编辑中添加关键结果（KR）。
            </p>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-tertiary)]/80 rounded-lg transition-all active:scale-[0.97]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-4 py-2 text-sm text-white bg-[var(--color-accent)] hover:brightness-110 rounded-lg transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
