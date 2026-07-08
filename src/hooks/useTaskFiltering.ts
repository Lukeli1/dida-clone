import { useMemo } from 'react'
import {
  isToday as dateFnsIsToday,
  isBefore as dateFnsIsBefore,
  startOfDay as dateFnsStartOfDay,
  isThisWeek,
  isThisMonth,
} from 'date-fns'
import type { Task } from '../types'
import { useTaskStore } from '../stores/taskStore'
import { useFilterStore } from '../stores/filterStore'
import { useUIStore } from '../stores/uiStore'
import { matchTaskBySearch } from '../utils/taskSearch'
import { selectTodayCount, selectArchivedCount, selectTaskCounts } from '../stores/selectors/taskSelectors'

/**
 * 统一的任务筛选 + 排序 + 树组装 hook
 * 合并了视图筛选（currentView/selectedListId/selectedTagId）和 filterStore 组合筛选
 */
export function useTaskFiltering() {
  const tasks = useTaskStore((s) => s.tasks)
  const currentView = useUIStore((s) => s.currentView)
  const selectedListId = useUIStore((s) => s.selectedListId)
  const selectedTagId = useUIStore((s) => s.selectedTagId)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const filters = useFilterStore()

  const hasActiveFilters =
    filters.priority !== null || filters.dateRange !== 'all' || filters.tagId !== null || filters.listId !== null

  // ===== 筛选 + 排序 =====
  const filteredTasks = useMemo(() => {
    let filtered: Task[]

    if (currentView === 'archived') {
      filtered = tasks.filter((t) => t.archived)
    } else if (searchQuery.trim()) {
      // 全文搜索：标题 + 备注 + 子任务标题（大小写不敏感）。
      // 子任务通过 parent_id 关联，matchTaskBySearch 内部会查找 parent_id === task.id 的子任务。
      // 当某个子任务命中时，其父任务也会命中（通过子任务标题），因此父子任务都会进入 filteredTasks，
      // taskTree 组装时即可正确把命中的子任务挂回父任务下，避免「孤儿子任务」被丢失。
      filtered = tasks.filter((t) => !t.archived && matchTaskBySearch(t, searchQuery, tasks))
    } else if (currentView === 'today') {
      filtered = tasks.filter((t) => !t.completed && !t.archived && t.due_date && dateFnsIsToday(new Date(t.due_date)))
    } else if (selectedTagId !== null) {
      filtered = tasks.filter((t) => !t.archived && t.tag_ids?.includes(selectedTagId))
    } else if (selectedListId !== null) {
      filtered = tasks.filter((t) => !t.archived && t.list_id === selectedListId)
    } else {
      filtered = tasks.filter((t) => !t.archived)
    }

    if (hasActiveFilters && currentView !== 'archived') {
      filtered = filtered.filter((t) => {
        if (filters.priority !== null && t.priority !== filters.priority) return false
        if (filters.tagId !== null && !t.tag_ids?.includes(filters.tagId)) return false
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
      const isSmartView =
        currentView === 'archived' || searchQuery.trim() || currentView === 'today' || hasActiveFilters
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
    return topLevel.map((task) => ({ ...task, subtasks: subtaskMap.get(task.id) || [] }))
  }, [filteredTasks])

  // ===== 过期任务 =====
  // 今日视图从全量 tasks 提取过期任务；全部任务视图从已筛选的 taskTree 提取
  const overdueTaskTree = useMemo(() => {
    if (currentView !== 'today' && currentView !== 'tasks') return []
    const todayStart = dateFnsStartOfDay(new Date())
    const source = currentView === 'today' ? tasks : taskTree
    return source
      .filter((t) => {
        if (!t.due_date || t.completed) return false
        return dateFnsIsBefore(new Date(t.due_date), todayStart)
      })
      .sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
        const pa = a.priority === 0 ? 4 : a.priority
        const pb = b.priority === 0 ? 4 : b.priority
        if (pa !== pb) return pa - pb
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
        return b.created_at.localeCompare(a.created_at)
      })
  }, [tasks, taskTree, currentView])

  const completedTaskTree = useMemo(() => taskTree.filter((t) => t.completed), [taskTree])
  const incompleteTaskTree = useMemo(() => {
    const overdueIds = new Set(overdueTaskTree.map((t) => t.id))
    return taskTree.filter((t) => !t.completed && !overdueIds.has(t.id))
  }, [taskTree, overdueTaskTree])

  // ===== 统计（调用 selectors 纯函数，便于单测覆盖）=====
  const todayCount = useMemo(() => selectTodayCount(tasks), [tasks])
  const archivedCount = useMemo(() => selectArchivedCount(tasks), [tasks])
  const taskCounts = useMemo(() => selectTaskCounts(tasks), [tasks])

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
