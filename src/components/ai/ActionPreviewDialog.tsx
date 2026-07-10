import { useState } from 'react'
import type { ValidationResult, ActionPreviewInfo } from '../../utils/aiActionSafety'

interface ActionPreviewDialogProps {
  validActions: ValidationResult['valid']
  errors: ValidationResult['errors']
  onConfirm: () => void
  onCancel: () => void
}

const ACTION_LABELS: Record<string, { text: string; icon: string; color: string }> = {
  create_task: { text: '创建任务', icon: '📝', color: 'var(--color-accent)' },
  update_task: { text: '更新任务', icon: '✏️', color: 'var(--color-warning)' },
  delete_task: { text: '删除任务', icon: '🗑️', color: 'var(--color-danger)' },
  complete_task: { text: '完成任务', icon: '✅', color: 'var(--color-success)' },
  create_subtask: { text: '添加子任务', icon: '📎', color: 'var(--color-accent)' },
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '空'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
    try {
      return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    } catch {
      return value
    }
  }
  return String(value)
}

function priorityLabel(p: number): string {
  switch (p) {
    case 1: return '高'
    case 2: return '中'
    case 3: return '低'
    default: return '无'
  }
}

/** 动作预览卡片 */
function ActionCard({ info }: { info: ActionPreviewInfo }) {
  const label = ACTION_LABELS[info.type] ?? { text: info.type, icon: '❓', color: 'var(--color-text-tertiary)' }

  return (
    <div
      className="p-3 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border-light)] hover:border-[var(--color-accent)]/30 transition-colors"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-base">{label.icon}</span>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `color-mix(in srgb, ${label.color} 15%, transparent)`,
            color: label.color,
          }}
        >
          {label.text}
        </span>
        <span className="text-sm text-[var(--color-text-primary)] truncate flex-1">
          {info.taskTitle ?? info.createTitle ?? ''}
        </span>
      </div>

      {/* 描述 */}
      <p className="text-xs text-[var(--color-text-secondary)] mb-2">{info.description}</p>

      {/* 变更前后值（update_task） */}
      {info.beforeValues && info.afterValues && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[var(--color-bg-tertiary)] rounded-md p-2">
            <p className="text-[var(--color-text-tertiary)] mb-1">变更前</p>
            {Object.entries(info.beforeValues).map(([key, val]) => (
              <div key={key} className="flex justify-between gap-2">
                <span className="text-[var(--color-text-tertiary)]">{key}</span>
                <span className="text-[var(--color-text-secondary)] truncate">{formatValue(val)}</span>
              </div>
            ))}
          </div>
          <div className="bg-[var(--color-bg-tertiary)] rounded-md p-2">
            <p className="text-[var(--color-text-tertiary)] mb-1">变更后</p>
            {Object.entries(info.afterValues).map(([key, val]) => (
              <div key={key} className="flex justify-between gap-2">
                <span className="text-[var(--color-text-tertiary)]">{key}</span>
                <span className="text-[var(--color-text-secondary)] truncate">{formatValue(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 创建任务字段 */}
      {info.createFields && info.type !== 'update_task' && (
        <div className="text-xs text-[var(--color-text-tertiary)] flex flex-wrap gap-3">
          {info.createFields.dueDate && (
            <span>📅 {formatValue(info.createFields.dueDate)}</span>
          )}
          {info.createFields.priority != null && (
            <span>🔴 {priorityLabel(info.createFields.priority)}</span>
          )}
          {info.createFields.notes && (
            <span className="truncate max-w-32">📝 {info.createFields.notes}</span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * AI 动作预览对话框
 *
 * 展示所有 AI 提议的动作（合法 + 校验失败），用户确认后才执行。
 * 取消或关闭不产生任何数据变更。
 */
export function ActionPreviewDialog({ validActions, errors, onConfirm, onCancel }: ActionPreviewDialogProps) {
  const [closing, setClosing] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  function handleConfirm() {
    if (confirmed) return
    setConfirmed(true)
    setClosing(true)
    setTimeout(() => onConfirm(), 150)
  }

  function handleCancel() {
    setClosing(true)
    setTimeout(() => onCancel(), 150)
  }

  const totalActions = validActions.length + errors.length
  const hasValidActions = validActions.length > 0
  const hasErrors = errors.length > 0

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 transition-opacity duration-150 ${
        closing ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleCancel()
      }}
    >
      <div className="absolute inset-0 bg-[var(--color-mask)]" />
      <div
        className={`relative bg-[var(--color-surface)] rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col transition-transform duration-150 ${
          closing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
        style={{ boxShadow: 'var(--shadow-modal)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-preview-title"
      >
        {/* 标题栏 */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--color-border-light)]">
          <span className="text-xl">🤖</span>
          <div className="flex-1">
            <h3 id="action-preview-title" className="text-base font-semibold text-[var(--color-text-primary)]">
              AI 操作预览
            </h3>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              共 {totalActions} 项操作{hasErrors ? `（${errors.length} 项无法执行）` : ''}
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
            title="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 动作列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {/* 合法动作 */}
          {validActions.map((va) => (
            <ActionCard key={`v-${va.index}`} info={va.previewInfo} />
          ))}

          {/* 校验失败的动作 */}
          {hasErrors && (
            <div className="mt-3">
              <p className="text-xs font-medium text-[var(--color-danger)] mb-2">⚠️ 以下操作无法执行：</p>
              {errors.map((err) => (
                <div
                  key={`e-${err.index}`}
                  className="p-2.5 bg-[var(--color-danger)]/5 border border-[var(--color-danger)]/20 rounded-lg mb-1.5"
                >
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {err.description || err.actionType}
                  </p>
                  <p className="text-xs text-[var(--color-danger)] mt-0.5">{err.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[var(--color-border-light)]">
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {hasValidActions
              ? '确认后将批量执行，可通过撤销恢复'
              : '没有可执行的操作'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-tertiary)]/80 rounded-lg transition-all active:scale-[0.97]"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!hasValidActions || confirmed}
              className="px-4 py-2 text-sm text-white bg-[var(--color-accent)] hover:brightness-110 rounded-lg transition-all active:scale-[0.97] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              确认执行
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
