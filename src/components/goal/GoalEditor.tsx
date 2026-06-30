import { useState, useEffect } from 'react'
import type { Goal, GoalType, CreateGoalRequest, UpdateGoalRequest } from '../../api/goalApi'

/** 预设颜色（与 PRESET_COLORS 一致） */
const PRESET_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444',
  '#F59E0B', '#10B981', '#06B6D4', '#6B7280',
]

/** 目标类型选项 */
const TYPE_OPTIONS: { value: GoalType; label: string }[] = [
  { value: 'annual', label: '年度目标' },
  { value: 'quarterly', label: '季度目标' },
  { value: 'monthly', label: '月度目标' },
]

export interface GoalEditorProps {
  /** 编辑时传入已有目标；新建时为 null */
  goal: Goal | null
  /** 保存回调：新建时传 CreateGoalRequest，编辑时传 { id, updates } */
  onSave: (payload: { create?: CreateGoalRequest; update?: { id: number; updates: UpdateGoalRequest } }) => Promise<void> | void
  onCancel: () => void
}

/**
 * 目标创建/编辑对话框（类似 ConfirmDialog 的 overlay 形式）。
 *
 * 字段：标题 / 描述 / 类型 / 周期起止 / 颜色。
 * 编辑模式下不支持修改类型（类型决定周期语义，修改意义不大）。
 */
export function GoalEditor({ goal, onSave, onCancel }: GoalEditorProps) {
  const isEdit = !!goal

  const [title, setTitle] = useState(goal?.title ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const [goalType, setGoalType] = useState<GoalType>(goal?.type ?? 'quarterly')
  const [periodStart, setPeriodStart] = useState(goal?.period_start.slice(0, 10) ?? '')
  const [periodEnd, setPeriodEnd] = useState(goal?.period_end.slice(0, 10) ?? '')
  const [color, setColor] = useState(goal?.color ?? PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)

  // 切换 goal 时重置表单（避免复用组件时状态残留）
  useEffect(() => {
    setTitle(goal?.title ?? '')
    setDescription(goal?.description ?? '')
    setGoalType(goal?.type ?? 'quarterly')
    setPeriodStart(goal?.period_start.slice(0, 10) ?? '')
    setPeriodEnd(goal?.period_end.slice(0, 10) ?? '')
    setColor(goal?.color ?? PRESET_COLORS[0])
  }, [goal])

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
        className="relative bg-[var(--color-surface)] rounded-xl w-full max-w-md p-5 transition-transform duration-150"
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
              onKeyDown={(e) => { if (e.key === 'Enter' && canSave && !saving) handleSave() }}
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
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
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
              <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
                类型不可修改（如需变更请新建目标）
              </p>
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
