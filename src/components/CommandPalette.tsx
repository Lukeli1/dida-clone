import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import {
  safeFocus,
  useCommandPalette,
  type CloseFocusPolicy,
  type CommandPaletteItem,
} from '../hooks/useCommandPalette'

interface CommandPaletteProps {
  newTaskInputRef: RefObject<HTMLInputElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
}

/**
 * 应用关闭时的焦点策略。
 * - restore：仅在目标仍在文档中且可聚焦时恢复
 * - target：关闭后聚焦指定元素（支持 getter，便于视图切换后 ref 就绪）
 * - none：不恢复
 *
 * 使用 rAF 双帧：第一帧等待 React 卸载/视图切换提交，第二帧再聚焦，
 * 避免与「动作聚焦」再另起 setTimeout 产生竞争。
 */
function applyFocusPolicy(policy: CloseFocusPolicy, previousFocus: HTMLElement | null) {
  const run = () => {
    if (policy.mode === 'none') {
      // 不恢复旧焦点；若仍停在打开前元素上，主动 blur，避免被帮助/后续层遮挡却仍“看起来可操作”
      if (previousFocus && document.activeElement === previousFocus && typeof previousFocus.blur === 'function') {
        previousFocus.blur()
      }
      return
    }

    if (policy.mode === 'target') {
      // 若目标尚未挂载（视图刚切换），再试一帧
      if (!safeFocus(policy.element)) {
        requestAnimationFrame(() => {
          safeFocus(policy.element)
        })
      }
      return
    }

    // restore
    if (!previousFocus) return
    if (!document.contains(previousFocus)) return
    // 若关闭过程中已有其它逻辑正确聚焦了目标，不要抢回
    const active = document.activeElement
    if (active && active !== document.body && active !== previousFocus) {
      // 已有明确焦点且不是 body，认为后续动作已接管
      return
    }
    safeFocus(previousFocus)
  }

  // 双 rAF：确保 close 后的 DOM 更新（含列表视图挂载）完成后再聚焦
  requestAnimationFrame(() => {
    requestAnimationFrame(run)
  })
}

/**
 * 全局命令面板
 *
 * - Ctrl+K / Meta+K 打开（由 useKeyboardShortcuts 注册）
 * - 固定命令跳转 + 任务标题搜索（最多 10 条）
 * - Esc 关闭，↑↓ 移动，Enter 执行
 * - 关闭焦点策略由 useCommandPalette.closePalette 统一决定，组件只消费策略
 * - 紧凑桌面工具风格，最大高度 70vh，结果区内滚动
 */
export function CommandPalette({ newTaskInputRef, searchInputRef }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  /** 是否经历过 open=true，用于跳过初始 mount 的关闭逻辑 */
  const wasOpenRef = useRef(false)

  const {
    open,
    query,
    items,
    activeIndex,
    setActiveIndex,
    closePalette,
    consumeFocusPolicy,
    updateQuery,
    executeItem,
    executeActive,
    moveActive,
  } = useCommandPalette({ newTaskInputRef, searchInputRef })

  // 打开时记录焦点并自动聚焦输入框
  useEffect(() => {
    if (!open) return

    wasOpenRef.current = true
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [open])

  // 关闭时按策略处理焦点（单一路径，消除与动作聚焦的竞争）
  useEffect(() => {
    if (open) return
    if (!wasOpenRef.current) return

    wasOpenRef.current = false
    const prev = previousFocusRef.current
    const policy = consumeFocusPolicy()
    applyFocusPolicy(policy, prev)
    previousFocusRef.current = null
  }, [open, consumeFocusPolicy])

  // 高亮项滚入可视区域（jsdom 无 scrollIntoView 时安全跳过）
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-command-index="${activeIndex}"]`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, open, items])

  // 面板内键盘交互（捕获阶段，避免与全局快捷键冲突）
  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closePalette({ focus: { mode: 'restore' } })
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        moveActive(1)
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        moveActive(-1)
        return
      }

      if (e.key === 'Enter') {
        // 不拦截 IME 组合态
        if (e.isComposing) return
        e.preventDefault()
        e.stopPropagation()
        executeActive()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [open, closePalette, moveActive, executeActive])

  if (!open) return null

  const hasQuery = query.trim().length > 0
  const commandItems = items.filter((i) => i.kind === 'command')
  const taskItems = items.filter((i) => i.kind === 'task')
  const showEmpty = hasQuery && items.length === 0

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh] px-4"
      onClick={() => closePalette({ focus: { mode: 'restore' } })}
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
      data-testid="command-palette"
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />

      <div
        className="relative w-full max-w-xl max-h-[70vh] flex flex-col overflow-hidden rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]"
        style={{ boxShadow: 'var(--shadow-modal)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索输入 */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
          <svg
            className="w-4 h-4 shrink-0 text-[var(--color-text-tertiary)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            placeholder="搜索命令或任务…"
            className="flex-1 min-w-0 bg-transparent text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none"
            aria-label="命令面板搜索"
            aria-controls="command-palette-results"
            aria-activedescendant={items[activeIndex] ? `command-item-${items[activeIndex].id}` : undefined}
            data-testid="command-palette-input"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:inline-block shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
            Esc
          </kbd>
        </div>

        {/* 结果列表：内部滚动 */}
        <div
          id="command-palette-results"
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto py-1"
          role="listbox"
          aria-label="命令与任务结果"
          data-testid="command-palette-results"
        >
          {showEmpty && (
            <div
              className="px-4 py-8 text-center text-sm text-[var(--color-text-tertiary)]"
              data-testid="command-palette-empty"
            >
              无匹配结果
            </div>
          )}

          {!showEmpty && commandItems.length > 0 && (
            <ResultSection
              label="命令"
              items={items}
              sectionItems={commandItems}
              activeIndex={activeIndex}
              onHover={setActiveIndex}
              onSelect={executeItem}
            />
          )}

          {!showEmpty && taskItems.length > 0 && (
            <ResultSection
              label="任务"
              items={items}
              sectionItems={taskItems}
              activeIndex={activeIndex}
              onHover={setActiveIndex}
              onSelect={executeItem}
            />
          )}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center gap-3 px-3 py-2 border-t border-[var(--color-border)] text-[11px] text-[var(--color-text-tertiary)]">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-1 py-0.5">
              ↑
            </kbd>
            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-1 py-0.5">
              ↓
            </kbd>
            移动
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-1 py-0.5">
              Enter
            </kbd>
            执行
          </span>
          <span className="ml-auto truncate">最多显示 10 条任务</span>
        </div>
      </div>
    </div>
  )
}

interface ResultSectionProps {
  label: string
  items: CommandPaletteItem[]
  sectionItems: CommandPaletteItem[]
  activeIndex: number
  onHover: (index: number) => void
  onSelect: (item: CommandPaletteItem) => void
}

function ResultSection({ label, items, sectionItems, activeIndex, onHover, onSelect }: ResultSectionProps) {
  return (
    <div className="px-1.5 py-1">
      <div className="px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-tertiary)]">{label}</div>
      <div className="space-y-0.5">
        {sectionItems.map((item) => {
          const index = items.findIndex((i) => i.id === item.id)
          const active = index === activeIndex
          return (
            <button
              key={item.id}
              id={`command-item-${item.id}`}
              type="button"
              role="option"
              aria-selected={active}
              data-command-index={index}
              data-testid={item.kind === 'command' ? `command-item-${item.commandId}` : `command-task-${item.taskId}`}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                active
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'
              }`}
              onMouseEnter={() => onHover(index)}
              onClick={() => onSelect(item)}
            >
              <span
                className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-medium ${
                  item.kind === 'task'
                    ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]'
                    : 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                }`}
                aria-hidden="true"
              >
                {item.kind === 'task' ? '任' : '令'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{item.title}</span>
                {item.subtitle && (
                  <span className="block text-[11px] text-[var(--color-text-tertiary)] truncate">{item.subtitle}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
