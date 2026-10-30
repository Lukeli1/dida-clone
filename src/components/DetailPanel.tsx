import { useState, useEffect, useRef } from 'react'
import { useTagStore } from '../stores/tagStore'
import { useListStore } from '../stores/listStore'
import { useUIStore } from '../stores/uiStore'
import { useWindowSize } from '../hooks/useWindowSize'
import { TaskDetail } from './detail/TaskDetail'
import type { Task } from '../types'
import type { TaskActions } from '../hooks/useTaskActions'

/**
 * 右侧任务详情区
 *
 * 封装原 App.tsx 中重复出现 3 次的 TaskDetail 渲染块：
 *   1. 日历视图内联详情（CalendarPanel）
 *   2. 四象限视图内联详情（App.tsx quadrant 分支）
 *   3. 任务列表/今日/归档等视图的右侧独立详情（App.tsx 末尾）
 *
 * 设计要点：
 *   - tags / lists / setSelectedTaskId 均在组件内部直接调用 store（遵循"子组件内部各自
 *     调用 store selector，不从 App 传递"原则）。
 *   - task 允许为 null：通过 mounted/visible 双状态控制滑入/滑出动画。
 *   - actions 由 App 层的 useTaskActions 聚合后透传，保持 35 个 action 的稳定引用。
 *   - 不改变 TaskDetail 的 props 结构与行为。
 */
interface DetailPanelProps {
  task: Task | null
  actions: TaskActions
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && !el.closest('.hidden, [hidden]'),
  )
}

export function DetailPanel({ task, actions }: DetailPanelProps) {
  const tags = useTagStore((s) => s.tags)
  const lists = useListStore((s) => s.lists)
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId)
  const { isDetailOverlay } = useWindowSize()

  // task 非空时直接渲染最新数据；displayTask 只保留退出动画期间的最后一帧。
  const [displayTask, setDisplayTask] = useState<Task | null>(task)
  const [visible, setVisible] = useState(false)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }

    if (task) {
      setDisplayTask(task)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      })
    } else {
      setVisible(false)
      exitTimerRef.current = setTimeout(() => {
        setDisplayTask(null)
      }, 250)
    }

    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current)
      }
    }
  }, [task])

  const renderedTask = task ?? displayTask

  const overlayOpen = isDetailOverlay && task !== null

  // 覆盖层焦点管理：
  // - 打开时记住触发元素，把焦点移入返回按钮；
  // - 关闭 / 切换为停靠 / 卸载时，把焦点还给仍存在的触发元素；
  // - Tab / Shift+Tab 在覆盖层内循环，Esc 与返回按钮语义一致。
  useEffect(() => {
    if (!overlayOpen) return

    const active = document.activeElement
    previousFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null
    const frame = requestAnimationFrame(() => backButtonRef.current?.focus())

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedTaskId(null)
        return
      }
      if (e.key !== 'Tab') return

      const container = overlayRef.current
      if (!container) return
      const focusable = getFocusableElements(container)
      if (focusable.length === 0) {
        e.preventDefault()
        container.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement
      const focusIsInside = current instanceof Node && container.contains(current)

      if (e.shiftKey) {
        if (!focusIsInside || current === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (!focusIsInside || current === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)

      const previous = previousFocusRef.current
      previousFocusRef.current = null
      if (previous?.isConnected) previous.focus()
    }
  }, [overlayOpen, setSelectedTaskId])

  if (!renderedTask) return null

  // 任务详情节点（桌面与窄屏共用）
  const taskDetail = (
    <TaskDetail
      task={renderedTask}
      tags={tags}
      lists={lists}
      onUpdate={actions.handleUpdateTask}
      onDelete={actions.handleDeleteTask}
      onClose={() => setSelectedTaskId(null)}
      onAddTag={actions.handleAddTagToTask}
      onRemoveTag={actions.handleRemoveTagFromTask}
      onCreateSubtask={actions.handleCreateSubtask}
    />
  )

  // 窄屏 / 空间不足：fixed 全屏覆盖，顶部返回按钮；不占用任务列表宽度
  if (isDetailOverlay) {
    return (
      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-label="任务详情"
        tabIndex={-1}
        data-testid="detail-overlay"
        className={`fixed inset-x-0 bottom-0 top-10 z-40 bg-[var(--color-bg-secondary)] flex flex-col transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <header className="flex items-center gap-2 px-3 h-11 bg-[var(--color-surface)] border-b border-[var(--color-border)] shrink-0">
          <button
            ref={backButtonRef}
            onClick={() => setSelectedTaskId(null)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
            aria-label="返回任务列表"
            title="返回任务列表"
            data-testid="detail-overlay-back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-medium text-[var(--color-text-primary)]">任务详情</span>
        </header>
        {/* 强制内部 TaskDetail 的 aside 撑满全屏宽度并去掉左侧边框 */}
        <div className="flex-1 min-h-0 [&>aside]:w-full [&>aside]:h-full [&>aside]:border-l-0">{taskDetail}</div>
      </div>
    )
  }

  // 宽屏 / 中等宽度：右侧停靠面板。宽度随视口收敛，避免固定 384px 在中等宽度挤压列表。
  return (
    <div
      data-testid="detail-docked"
      className={`w-[clamp(340px,30vw,384px)] transition-transform duration-[250ms] shrink-0 h-full ${visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}
      style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      {taskDetail}
    </div>
  )
}
