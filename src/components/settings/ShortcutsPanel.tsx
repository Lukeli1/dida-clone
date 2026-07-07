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
    <div className="space-y-6">
      {/* 提示信息 */}
      <div className="flex items-start gap-3 px-4 py-3 bg-[var(--color-accent-light)] rounded-lg border border-[var(--color-accent)]/20">
        <svg
          className="w-5 h-5 text-[var(--color-accent)] shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          点击右侧按键进入录制模式，然后按下你想要的快捷键组合。按 Esc 可取消录制。
        </p>
      </div>

      {Object.entries(grouped).map(([category, bindings]) => (
        <div key={category}>
          <h4 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">{category}</h4>
          <div className="space-y-2">
            {bindings.map((binding) => {
              const currentKeys = resolveKeys(binding)
              const isRecording = recordingId === binding.id
              const hasConflict = conflictId === binding.id
              const isCustomized = !!customShortcuts[binding.id]

              return (
                <div
                  key={binding.id}
                  className="flex items-center justify-between px-4 py-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">{binding.label}</p>
                      {isCustomized && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent-light)] text-[var(--color-accent)]">
                          已自定义
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{binding.description}</p>
                    {hasConflict && (
                      <p className="text-xs text-red-500 mt-1">冲突：该快捷键已被「{conflictLabel}」使用</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {/* 恢复默认按钮（仅自定义时显示） */}
                    {isCustomized && !isRecording && (
                      <button
                        onClick={() => {
                          setCustomShortcut(binding.id, binding.defaultKeys)
                          // 恢复默认即将其从 customShortcuts 中移除（值与默认相同）
                          // 但 store 仍会保留条目，这里保持简单：直接覆盖为默认值
                        }}
                        className="px-2 py-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                        title="恢复默认"
                      >
                        恢复
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setRecordingId(isRecording ? null : binding.id)
                        setConflictId(null)
                        setConflictLabel('')
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors min-w-[88px] text-center ${
                        isRecording
                          ? 'bg-[var(--color-accent)] text-white animate-pulse'
                          : hasConflict
                            ? 'bg-red-50 text-red-600 border border-red-200'
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
        </div>
      ))}

      {/* 重置按钮 */}
      <div className="pt-2">
        <button
          onClick={resetShortcuts}
          disabled={!hasCustomBindings}
          className={`px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg transition-colors ${
            hasCustomBindings
              ? 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]'
              : 'text-[var(--color-text-tertiary)] cursor-not-allowed opacity-60'
          }`}
        >
          重置为默认
        </button>
      </div>
    </div>
  )
}
