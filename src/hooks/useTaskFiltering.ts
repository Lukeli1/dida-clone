import { useMemo } from 'react'
import {
  isToday as dateFnsIsToday, isBefore as dateFnsIsBefore, startOfDay as dateFnsStartOfDay,
  isThisWeek, isThisMonth,
} from 'date-fns'
import type { Task } from '../types'
import { useTaskStore } from '../stores/taskStore'
import { useFilterStore } from '../stores/filterStore'
import { useUIStore } from '../stores/uiStore'

/**
 * 统一的任务筛选 + 排序 + 树组装 hook
 * 合并了视图筛选（currentView/selectedListId/selectedTagId）和 filterStore 组合筛选
 */
export function useTaskFiltering() {
  const tasks = useTaskStore(s => s.tasks)
  const currentView = useUIStore(s => s.currentView)
  const selectedListId = useUIStore(s => s.selectedListId)
  const selectedTagId = useUIStore(s => s.selectedTagId)
  const searchQuery = useUIStore(s => s.searchQuery)
  const filters = useFilterStore()

  const hasActiveFilters = filters.priority !== null || filters.dateRange !== 'all' || filters.tagId !== null || filters.listId !== null

  // ===== 筛选 + 排序 =====
  const filteredTasks = useMemo(() => {
    let filtered: Task[]

    if (currentView === 'archived') {
      filtered = tasks.filter(t => t.archived)
    } else if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      filtered = tasks.filter(t =>
        !t.archived && (t.title.toLowerCase().includes(q) || (t.notes && t.notes.toLowerCase().includes(q)))
      )
    } else if (currentView === 'today') {
      filtered = tasks.filter(t => !t.completed && !t.archived && t.due_date && dateFnsIsToday(new Date(t.due_date)))
    } else if (selectedTagId !== null) {
      filtered = tasks.filter(t => !t.archived && t.tag_ids?.includes(selectedTagId))
    } else if (selectedListId !== null) {
      filtered = tasks.filter(t => !t.archived && t.list_id === selectedListId)
    } else {
      filtered = tasks.filter(t => !t.archived)
    }

    if (hasActiveFilters && currentView !== 'archived') {
      filtered = filtered.filter(t => {
        if (filters.priority !== null && t.priority !== filters.priority) return false
        if (filters.tagId !== null && !(t.tag_ids?.includes(filters.tagId))) return false
        if (filters.listId !== null && t.list_id !== filters.listId) return false
        if (filters.dateRange !== 'all') {
          if (filters.dateRange === 'none') {
            if (t.due_date) return false
          } else if (filters.dateRange === 'overdue') {
            if (!t.due_date || t.completed) return false
            if (!dateFnsIsBefore(new Date(t.due_date), dateFnsStartOfDay(new Date()))) return false
          } else {
            if (!t.due_date) return false
            const dueDate = new Date(t.due_date)
            if (filters.dateRange === 'today' && !dateFnsIsToday(dueDate)) return false
            if (filters.dateRange === 'week' && !isThisWeek(dueDate, { weekStartsOn: 1 })) return false
            if (filters.dateRange === 'month' && !isThisMonth(dueDate)) return false
          }
        }
        return true
      })
    }

    return filtered.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      const isSmartView = currentView === 'archived' || searchQuery.trim() || currentView === 'today' || hasActiveFilters
      if (!isSmartView) {
        return (a.sort_order || 0) - (b.sort_order || 0)
      }
      const pa = a.priority === 0 ? 4 : a.priority
      const pb = b.priority === 0 ? 4 : b.priority
      if (pa !== pb) return pa - pb
      if (a.due_date && !b.due_date) return -1
      if (!a.due_date && b.due_date) return 1
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      return b.created_at.localeCompare(a.created_at)
    })
  }, [tasks, selectedListId, selectedTagId, currentView, searchQuery, filters, hasActiveFilters])

  // ===== 树组装 =====
  const taskTree = useMemo(() => {
    const subtaskMap = new Map<number, Task[]>()
    const topLevel: Task[] = []
    for (const task of filteredTasks) {
      if (task.parent_id) {
        const arr = subtaskMap.get(task.parent_id)
        if (arr) arr.push(task)
        else subtaskMap.set(task.parent_id, [task])
      } else {
        topLevel.push(task)
      }
    }
    return topLevel.map(task => ({ ...task, subtasks: subtaskMap.get(task.id) || [] }))
  }, [filteredTasks])

  const completedTaskTree = useMemo(() => taskTree.filter(t => t.completed), [taskTree])
  const incompleteTaskTree = useMemo(() => taskTree.filter(t => !t.completed), [taskTree])

  // ===== 今日过期任务 =====
  const overdueTaskTree = useMemo(() => {
    if (currentView !== 'today') return []
    const todayStart = dateFnsStartOfDay(new Date())
    return tasks.filter(t => {
      if (!t.due_date || t.completed) return false
      return dateFnsIsBefore(new Date(t.due_date), todayStart)
    }).sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      const pa = a.priority === 0 ? 4 : a.priority
      const pb = b.priority === 0 ? 4 : b.priority
      if (pa !== pb) return pa - pb
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      return b.created_at.localeCompare(a.created_at)
    })
  }, [tasks, currentView])

  // ===== 统计 =====
  const todayCount = useMemo(() =>
    tasks.filter(t => !t.completed && !t.archived && t.due_date && dateFnsIsToday(new Date(t.due_date))).length
  , [tasks])

  const archivedCount = useMemo(() => tasks.filter(t => t.archived).length, [tasks])

  const taskCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    tasks.forEach(t => {
      if (!t.completed) counts[t.list_id] = (counts[t.list_id] || 0) + 1
    })
    return counts
  }, [tasks])

  return {
    filteredTasks,
    taskTree,
    completedTaskTree,
    incompleteTaskTree,
    overdueTaskTree,
    todayCount,
    archivedCount,
    taskCounts,
    hasActiveFilters,
  }
}
