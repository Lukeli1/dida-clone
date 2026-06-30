import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Task, Tag, List } from '../types'

/**
 * TaskItem 通过 Context 获取的回调函数
 * 所有函数都以 taskId 作为首参，同一回调可复用于所有 TaskItem
 */
export interface TaskActionContextValue {
  // 全局数据
  tags: Tag[]
  lists: List[]
  batchMode: boolean
  isArchivedView: boolean

  // 任务操作（首参为 taskId 或 task）
  onToggle: (task: Task) => void
  onToggleSubtask: (subtaskId: number, completed: boolean) => void
  onClick: (taskId: number) => void
  onReorder: (draggedId: number, targetId: number) => void
  onDelete: (taskId: number) => void
  onArchive: (taskId: number) => void
  onUnarchive: (taskId: number) => void
  onSetDate: (taskId: number, date: string | null) => void
  onSetPriority: (taskId: number, priority: number) => void
  onSetRepeatRule: (taskId: number, rule: string | null) => void
  onTogglePin: (taskId: number) => void
  onToggleTag: (taskId: number, tagId: number) => void
  onDuplicate: (taskId: number) => void
  onCreateNewTag: (name: string) => void
  onInlineEdit: (taskId: number, title: string) => void
  onDragStartGlobal: () => void
  onDragEndGlobal: () => void
  onCreateSubtask: (parentId: number, title: string) => void
  onToggleExpand: (taskId: number) => void
  onToggleSelect: (taskId: number) => void
  onSubtaskInputChange: (taskId: number, val: string) => void
}

const TaskActionContext = createContext<TaskActionContextValue | null>(null)

interface ProviderProps {
  value: Omit<TaskActionContextValue, never>
  children: ReactNode
}

export function TaskActionProvider({ value, children }: ProviderProps) {
  // useMemo 稳定化 Context 值，避免 Provider 重渲染时所有消费者重渲染
  // value 由 useTaskActions 返回（已 useMemo 稳定），此处仅需透传
  const stableValue = useMemo(() => value, [value])
  return (
    <TaskActionContext.Provider value={stableValue}>
      {children}
    </TaskActionContext.Provider>
  )
}

export function useTaskActionContext(): TaskActionContextValue {
  const ctx = useContext(TaskActionContext)
  if (!ctx) {
    throw new Error('useTaskActionContext must be used within TaskActionProvider')
  }
  return ctx
}
