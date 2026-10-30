import { useState, useEffect, useMemo, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { DEFAULT_SHORTCUT_BINDINGS, type ShortcutBinding } from '../../utils/shortcuts'

/**
 * 快捷键自定义面板
 * - 按类别分组展示快捷键
 * - 点击按键按钮进入录制模式，按下组合键即可绑定
 * - 录制时通过全局 keydown 监听捕获按键
 * - 冲突检测：若组合键已被其他功能使用，提示冲突
 */
export function ShortcutsPanel() {
  const customShortcuts = useUIStore((s) => s.customShortcuts)
  const setCustomShortcut = useUIStore((s) => s.setCustomShortcut)
  const resetShortcuts = useUIStore((s) => s.resetShortcuts)

  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [conflictId, setConflictId] = useState<string | null>(null)
  const [conflictLabel, setConflictLabel] = useState<string>('')

  /** 根据绑定 id 取当前生效的按键字符串 */
  const resolveKeys = useCallback(
    (binding: ShortcutBinding): string => customShortcuts[binding.id] || binding.defaultKeys,
    [customShortcuts],
  )

  /** 录制模式下的全局 keydown 监听 */
  useEffect(() => {
    if (!recordingId) return

    function handleKeyDown(e: KeyboardEvent) {
      if (!recordingId) return
      e.preventDefault()
      e.stopPropagation()

      // Esc 取消录制
      if (e.key === 'Escape') {
        setRecordingId(null)
        setConflictId(null)
        return
      }

      // 忽略单独的修饰键
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.shiftKey) parts.push('Shift')
      if (e.altKey) parts.push('Alt')
      if (e.metaKey) parts.push('Meta')

      // 特殊键映射
      let key = e.key
      if (key === ' ') key = 'Space'
      else if (key === 'ArrowUp') key = '↑'
      else if (key === 'ArrowDown') key = '↓'
      else if (key === 'ArrowLeft') key = '←'
      else if (key === 'ArrowRight') key = '→'
      else if (key.length === 1) key = key.toUpperCase()

      parts.push(key)
      const keys = parts.join('+')

      // 冲突检测：检查是否已被其他绑定使用
      const conflict = DEFAULT_SHORTCUT_BINDINGS.find((b) => {
        if (b.id === recordingId) return false
        const currentKeys = resolveKeys(b)
        return currentKeys === keys
      })

      if (conflict) {
        setConflictId(recordingId)
        setConflictLabel(conflict.label)
        // 3 秒后清除冲突提示
        window.setTimeout(() => {
          setConflictId(null)
          setConflictLabel('')
        }, 3000)
        return
      }

      setCustomShortcut(recordingId, keys)
      setRecordingId(null)
      setConflictId(null)
      setConflictLabel('')
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recordingId, resolveKeys, setCustomShortcut])

  /** 按类别分组 */
  const grouped = useMemo(() => {
    const groups: Record<string, ShortcutBinding[]> = {}
    DEFAULT_SHORTCUT_BINDINGS.forEach((b) => {
      if (!groups[b.category]) groups[b.category] = []
      groups[b.category].push(b)
    })
    return groups
  }, [])

  /** 是否有自定义绑定（用于决定是否显示重置按钮的高亮态） */
  const hasCustomBindings = Object.keys(customShortcuts).length > 0

  return (
    <div className="space-y-5" data-testid="shortcuts-panel">
      {/* 提示信息 */}
      <div className="flex items-start gap-3 rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent-light)] px-4 py-3">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-accent)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="min-w-0 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          点击右侧按键进入录制模式，然后按下你想要的快捷键组合。按 Esc 可取消录制。
        </p>
      </div>

      {Object.entries(grouped).map(([category, bindings]) => (
        <section key={category} aria-labelledby={`shortcut-group-${category}`} data-testid={`shortcut-group-${category}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <h4 id={`shortcut-group-${category}`} className="text-sm font-semibold text-[var(--color-text-secondary)]">
              {category}
            </h4>
            <span className="text-xs text-[var(--color-text-tertiary)]">{bindings.length} 项</span>
          </div>
          <div
            className="divide-y divide-[var(--color-border-light)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
            data-testid={`shortcut-card-${category}`}
          >
            {bindings.map((binding) => {
              const currentKeys = resolveKeys(binding)
              const isRecording = recordingId === binding.id
              const hasConflict = conflictId === binding.id
              const isCustomized = !!customShortcuts[binding.id]
              const descriptionId = `shortcut-description-${binding.id}`
              const conflictTextId = `shortcut-conflict-${binding.id}`

              return (
                <div
                  key={binding.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  data-testid={`shortcut-row-${binding.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">{binding.label}</p>
                      {isCustomized && (
                        <span className="rounded bg-[var(--color-accent-light)] px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]">
                          已自定义
                        </span>
                      )}
                    </div>
                    <p
                      id={descriptionId}
                      className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-tertiary)] [overflow-wrap:anywhere]"
                    >
                      {binding.description}
                    </p>
                    {hasConflict && (
                      <p
                        id={conflictTextId}
                        role="alert"
                        className="mt-1 text-xs leading-relaxed text-[var(--color-danger)] [overflow-wrap:anywhere]"
                      >
                        冲突：该快捷键已被「{conflictLabel}」使用
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {/* 恢复默认按钮（仅自定义时显示） */}
                    {isCustomized && !isRecording && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomShortcut(binding.id, binding.defaultKeys)
                          // 恢复默认即将其从 customShortcuts 中移除（值与默认相同）
                          // 但 store 仍会保留条目，这里保持简单：直接覆盖为默认值
                        }}
                        aria-label={`恢复「${binding.label}」默认快捷键`}
                        title="恢复默认"
                        className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                      >
                        恢复
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid={`shortcut-key-${binding.id}`}
                      aria-pressed={isRecording}
                      aria-label={
                        isRecording
                          ? `${binding.label}：正在录制，按 Esc 取消`
                          : `${binding.label} 快捷键：${currentKeys}，点击录制新快捷键`
                      }
                      aria-describedby={hasConflict ? `${descriptionId} ${conflictTextId}` : descriptionId}
                      title={isRecording ? '按下快捷键，Esc 取消' : `当前快捷键：${currentKeys}`}
                      onClick={() => {
                        setRecordingId(isRecording ? null : binding.id)
                        setConflictId(null)
                        setConflictLabel('')
                      }}
                      className={`inline-flex min-h-8 min-w-[7.5rem] max-w-[14rem] shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-center text-xs font-mono transition-colors [overflow-wrap:anywhere] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-1 ${
                        isRecording
                          ? 'bg-[var(--color-accent)] text-white'
                          : hasConflict
                            ? 'border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
                            : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
                      }`}
                    >
                      {isRecording ? '按下快捷键...' : currentKeys}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {/* 重置按钮 */}
      <div className="flex flex-wrap items-center gap-3 px-1 pt-1">
        <button
          type="button"
          onClick={resetShortcuts}
          disabled={!hasCustomBindings}
          className={`inline-flex h-9 shrink-0 items-center rounded-lg border border-[var(--color-border)] px-4 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 ${
            hasCustomBindings
              ? 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
              : 'cursor-not-allowed text-[var(--color-text-tertiary)] opacity-60'
          }`}
        >
          重置为默认
        </button>
        <span className="text-xs text-[var(--color-text-tertiary)]">仅清除自定义绑定，恢复所有默认快捷键</span>
      </div>
    </div>
  )
}
