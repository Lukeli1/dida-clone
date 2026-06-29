// 周视图任务的「拖拽边缘调整时间」交互逻辑（从 WeekView 提取，行为不变）
import { useState, useRef, useCallback, useEffect } from 'react'
import type { Task } from '../../types'
import type { UpdateTask } from './shared/types'

interface UseTaskResizeOpts {
  tasks: Task[]
  onUpdateTask: UpdateTask
  /** 计算任务条顶部位置（分钟） */
  getTaskTop: (task: Task) => number
  /** 计算任务条高度（像素） */
  getTaskHeight: (task: Task) => number
}

export function useTaskResize({ tasks, onUpdateTask, getTaskTop, getTaskHeight }: UseTaskResizeOpts) {
  const [resizingTaskId, setResizingTaskId] = useState<number | null>(null)
  const [resizeMode, setResizeMode] = useState<'top' | 'bottom' | null>(null)
  const [resizePreview, setResizePreview] = useState<{ top: number; height: number } | null>(null)

  const resizeStartRef = useRef<{ taskId: number; mode: 'top' | 'bottom'; startY: number; originalTop: number; originalHeight: number; dateKey: string } | null>(null)

  function handleResizeStart(e: React.MouseEvent, task: Task, mode: 'top' | 'bottom', dateKey: string) {
    e.stopPropagation()
    e.preventDefault()

    const top = getTaskTop(task)
    const height = getTaskHeight(task)

    resizeStartRef.current = {
      taskId: task.id,
      mode,
      startY: e.clientY,
      originalTop: top,
      originalHeight: height,
      dateKey,
    }
    setResizingTaskId(task.id)
    setResizeMode(mode)
    setResizePreview({ top, height })
  }

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeStartRef.current) return
    const { startY, originalTop, originalHeight, mode } = resizeStartRef.current
    const deltaY = e.clientY - startY

    if (mode === 'top') {
      // 拖动上边缘：改变开始时间（top 位置）
      let newTop = originalTop + deltaY
      const maxTop = originalTop + originalHeight - 30
      newTop = Math.max(0, Math.min(maxTop, newTop))
      newTop = Math.round(newTop / 15) * 15
      const newHeight = originalHeight + (originalTop - newTop)
      setResizePreview({ top: newTop, height: newHeight })
    } else {
      // 拖动下边缘：改变结束时间（高度）
      let newHeight = originalHeight + deltaY
      newHeight = Math.max(30, newHeight)
      newHeight = Math.round(newHeight / 15) * 15
      setResizePreview({ top: originalTop, height: newHeight })
    }
  }, [])

  const handleResizeEnd = useCallback(() => {
    if (!resizeStartRef.current || !resizePreview) {
      resizeStartRef.current = null
      setResizingTaskId(null)
      setResizeMode(null)
      setResizePreview(null)
      return
    }

    const { taskId, dateKey, mode } = resizeStartRef.current
    const task = tasks.find(t => t.id === taskId)
    if (task && task.due_date) {
      const [year, month, day] = dateKey.split('-').map(Number)

      if (mode === 'top') {
        // 由预览 top 计算新的开始时间（HOUR_HEIGHT=60，像素即分钟）
        const newStartMinutes = resizePreview.top
        const newStartHour = Math.floor(newStartMinutes / 60)
        const newStartMin = newStartMinutes % 60
        const newDueDate = new Date(year, month - 1, day, newStartHour, newStartMin)
        // 不改 end_date，时长随之变化
        onUpdateTask(taskId, { due_date: newDueDate.toISOString() })
      } else {
        // 由预览高度计算新的结束时间
        const newEndMinutes = resizePreview.top + resizePreview.height
        const newEndHour = Math.floor(newEndMinutes / 60)
        const newEndMin = newEndMinutes % 60
        const newEndDate = new Date(year, month - 1, day, newEndHour, newEndMin)
        onUpdateTask(taskId, { end_date: newEndDate.toISOString() })
      }
    }

    resizeStartRef.current = null
    setResizingTaskId(null)
    setResizeMode(null)
    setResizePreview(null)
  }, [resizePreview, tasks, onUpdateTask])

  useEffect(() => {
    if (resizingTaskId) {
      window.addEventListener('mousemove', handleResizeMove)
      window.addEventListener('mouseup', handleResizeEnd)
      return () => {
        window.removeEventListener('mousemove', handleResizeMove)
        window.removeEventListener('mouseup', handleResizeEnd)
      }
    }
  }, [resizingTaskId, handleResizeMove, handleResizeEnd])

  return { resizingTaskId, resizePreview, resizeMode, handleResizeStart }
}
