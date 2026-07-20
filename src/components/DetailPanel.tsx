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

export function DetailPanel({ task, actions }: DetailPanelProps) {
  const tags = useTagStore((s) => s.tags)
  const lists = useListStore((s) => s.lists)
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId)
  const { isNarrow } = useWindowSize()

  // task 非空时直接渲染最新数据；displayTask 只保留退出动画期间的最后一帧。
  const [displayTask, setDisplayTask] = useState<Task | null>(task)
  const [visible, setVisible] = useState(false)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // 窄屏：fixed 全屏覆盖，顶部返回按钮
  if (isNarrow) {
    return (
      <div
        className={`fixed inset-0 z-50 bg-[var(--color-bg-secondary)] flex flex-col transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <header className="flex items-center gap-2 px-3 h-11 bg-[var(--color-surface)] border-b border-[var(--color-border)] shrink-0">
          <button
            onClick={() => setSelectedTaskId(null)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
            aria-label="返回"
            title="返回"
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

  // 桌面：右侧滑入面板
  return (
    <div
      className={`transition-transform duration-[250ms] shrink-0 h-full ${visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}
      style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      {taskDetail}
    </div>
  )
}
