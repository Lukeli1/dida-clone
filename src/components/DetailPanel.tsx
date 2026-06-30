import { useState, useEffect, useRef } from 'react'
import { useTagStore } from '../stores/tagStore'
import { useListStore } from '../stores/listStore'
import { useUIStore } from '../stores/uiStore'
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
  const tags = useTagStore(s => s.tags)
  const lists = useListStore(s => s.lists)
  const setSelectedTaskId = useUIStore(s => s.setSelectedTaskId)

  // 动画状态：mounted 控制 DOM 是否存在，visible 控制 CSS 类切换
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  // 保留最后一次有值的 task，用于出场动画期间渲染
  const displayTaskRef = useRef<Task | null>(null)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }

    if (task) {
      // 入场：先更新显示数据并挂载，下一帧触发动画
      displayTaskRef.current = task
      setMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      })
    } else if (mounted) {
      // 出场：先触发动画，动画结束后卸载
      setVisible(false)
      exitTimerRef.current = setTimeout(() => {
        setMounted(false)
        displayTaskRef.current = null
      }, 250)
    }

    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task])

  // 组件首次挂载时，如果 task 已有值，立即触发入场
  useEffect(() => {
    if (task && !mounted) {
      displayTaskRef.current = task
      setMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 当切换到不同任务时，更新 displayTaskRef
  useEffect(() => {
    if (task && mounted) {
      displayTaskRef.current = task
    }
  }, [task, mounted])

  if (!mounted || !displayTaskRef.current) return null

  const displayTask = displayTaskRef.current

  return (
    <div
      className={`animate-slide-in-right transition-all duration-[250ms] ${visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}
      style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      <TaskDetail
        task={displayTask}
        tags={tags}
        lists={lists}
        onUpdate={actions.handleUpdateTask}
        onDelete={actions.handleDeleteTask}
        onClose={() => setSelectedTaskId(null)}
        onAddTag={actions.handleAddTagToTask}
        onRemoveTag={actions.handleRemoveTagFromTask}
        onCreateSubtask={actions.handleCreateSubtask}
      />
    </div>
  )
}
