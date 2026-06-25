import { useEffect, useState, useMemo, useRef } from 'react'
import {
  isToday as dateFnsIsToday, isBefore as dateFnsIsBefore, startOfDay as dateFnsStartOfDay,
  isThisWeek, isThisMonth,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { api } from './api'
import type { Task, List, Tag, ReorderItem } from './types'
import { Sidebar, type ViewType } from './components/Sidebar'
import { TaskDetail } from './components/TaskDetail'
import { CalendarView } from './components/CalendarView'
import { StatsView } from './components/StatsView'
import { SettingsView } from './components/SettingsView'
import { AIAssistant } from './components/AIAssistant'
import { useToast } from './components/Toast'
import { getPriorityStyle, hexWithAlpha } from './utils/priority'
import { getLLMConfig, parseNaturalLanguageTask } from './utils/llm'

interface FilterState {
  priority: number | null
  dateRange: 'all' | 'today' | 'week' | 'month' | 'overdue' | 'none'
  tagId: number | null
  listId: number | null
}

function App() {
  const toast = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [lists, setLists] = useState<List[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [selectedListId, setSelectedListId] = useState<number | null>(null)
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [currentView, setCurrentView] = useState<ViewType>('tasks')
  const [showCompleted, setShowCompleted] = useState(false)
  const [showOverdue, setShowOverdue] = useState(true)
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set())
  const [subtaskInputs, setSubtaskInputs] = useState<Record<number, string>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [aiMode, setAiMode] = useState(false)
  const [aiParsing, setAiParsing] = useState(false)
  const [filters, setFilters] = useState<FilterState>({ priority: null, dateRange: 'all', tagId: null, listId: null })
  const [showFilters, setShowFilters] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set())
  const [isDraggingTask, setIsDraggingTask] = useState(false)
  const [dragOverCalendarDate, setDragOverCalendarDate] = useState<string | null>(null)
  const [miniCalendarDate, setMiniCalendarDate] = useState(new Date())
  const newTaskInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const notifiedTaskIds = useRef<Set<number>>(new Set())

  useEffect(() => {
    loadData()
  }, [])

  const autoArchivedRef = useRef(false)
  useEffect(() => {
    if (autoArchivedRef.current || tasks.length === 0) return
    autoArchivedRef.current = true
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const toArchive = tasks.filter(t =>
      t.completed && !t.archived && new Date(t.updated_at) < sevenDaysAgo
    )
    if (toArchive.length > 0) {
      Promise.all(toArchive.map(t => api.updateTask(t.id, { archived: true })))
        .then(() => loadData())
        .catch(err => console.error('Auto-archive failed:', err))
    }
  }, [tasks])

  // 桌面通知：每 60 秒检查提醒
  useEffect(() => {
    // 请求通知权限
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    function checkReminders() {
      const now = new Date()
      tasks.forEach(task => {
        if (
          task.reminder &&
          !task.completed &&
          !notifiedTaskIds.current.has(task.id) &&
          new Date(task.reminder) <= now
        ) {
          // 发送通知
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('滴答清单提醒', {
              body: task.title,
              icon: '/icon.png',
            })
          } else {
            // 降级为 Toast 通知
            toast.info(`提醒: ${task.title}`)
          }
          notifiedTaskIds.current.add(task.id)
        }
      })
    }

    const interval = setInterval(checkReminders, 60000)
    // 首次立即检查
    checkReminders()
    return () => clearInterval(interval)
  }, [tasks, toast])

  // 键盘快捷键
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+N: 新建任务
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        newTaskInputRef.current?.focus()
      }
      // Ctrl+F: 搜索
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      // Esc: 关闭详情或清空搜索
      if (e.key === 'Escape') {
        if (selectedTaskId !== null) {
          setSelectedTaskId(null)
        } else if (searchQuery) {
          setSearchQuery('')
        }
      }
      // Ctrl+1: 全部任务
      if (e.ctrlKey && e.key === '1') {
        e.preventDefault()
        setCurrentView('tasks')
        setSelectedListId(null)
        setSelectedTagId(null)
      }
      // Ctrl+2: 今日任务
      if (e.ctrlKey && e.key === '2') {
        e.preventDefault()
        setCurrentView('today')
        setSelectedListId(null)
        setSelectedTagId(null)
      }
      // Ctrl+3: 日历
      if (e.ctrlKey && e.key === '3') {
        e.preventDefault()
        setCurrentView('calendar')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedTaskId, searchQuery])

  async function loadData() {
    try {
      const [tasksData, listsData, tagsData] = await Promise.all([
        api.getTasks(),
        api.getLists(),
        api.getTags(),
      ])
      setTasks(tasksData)
      setLists(listsData)
      setTags(tagsData)
    } catch (error) {
      console.error('Failed to load data:', error)
      toast.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  // 今日未完成任务数
  const todayCount = useMemo(() => {
    return tasks.filter((t) => !t.completed && !t.archived && t.due_date && dateFnsIsToday(new Date(t.due_date))).length
  }, [tasks])

  // 归档任务数
  const archivedCount = useMemo(() => {
    return tasks.filter((t) => t.archived).length
  }, [tasks])

  // 是否有激活的筛选条件
  const hasActiveFilters = filters.priority !== null || filters.dateRange !== 'all' || filters.tagId !== null || filters.listId !== null

  // 排序：未完成在前，按优先级→截止日期→创建时间排序
  const filteredTasks = useMemo(() => {
    let filtered: Task[]

    // 归档视图：只显示已归档任务
    if (currentView === 'archived') {
      filtered = tasks.filter((t) => t.archived)
    } else if (searchQuery.trim()) {
      // 搜索模式：全局搜索，忽略视图/清单/标签筛选，但排除归档任务
      const q = searchQuery.trim().toLowerCase()
      filtered = tasks.filter(t =>
        !t.archived && (
          t.title.toLowerCase().includes(q) ||
          (t.notes && t.notes.toLowerCase().includes(q))
        )
      )
    } else if (currentView === 'today') {
      // 今日任务：截止日期是今天的未完成任务
      filtered = tasks.filter((t) => !t.completed && !t.archived && t.due_date && dateFnsIsToday(new Date(t.due_date)))
    } else if (selectedTagId !== null) {
      // 按标签筛选
      filtered = tasks.filter((t) => !t.archived && t.tag_ids?.includes(selectedTagId))
    } else if (selectedListId !== null) {
      filtered = tasks.filter((t) => !t.archived && t.list_id === selectedListId)
    } else {
      // 全部任务视图：排除归档任务
      filtered = tasks.filter((t) => !t.archived)
    }

    // 组合筛选（在视图筛选基础上叠加）
    if (hasActiveFilters && currentView !== 'archived') {
      filtered = filtered.filter((t) => {
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
      // 未完成在前
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      // 归档视图/搜索/今日模式/激活筛选按优先级→截止日期排序；其他模式按 sort_order 排序
      const isSmartView = currentView === 'archived' || searchQuery.trim() || currentView === 'today' || hasActiveFilters
      if (!isSmartView) {
        return (a.sort_order || 0) - (b.sort_order || 0)
      }
      // 优先级排序（1=高 > 2=中 > 3=低 > 0=无）
      const pa = a.priority === 0 ? 4 : a.priority
      const pb = b.priority === 0 ? 4 : b.priority
      if (pa !== pb) return pa - pb
      // 有截止日期的在前
      if (a.due_date && !b.due_date) return -1
      if (!a.due_date && b.due_date) return 1
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      // 创建时间降序
      return b.created_at.localeCompare(a.created_at)
    })
  }, [tasks, selectedListId, selectedTagId, currentView, searchQuery, filters, hasActiveFilters])

  // 组装任务树：只显示顶层任务（无 parent_id），子任务挂载到 subtasks
  const taskTree = useMemo(() => {
    const topLevel = filteredTasks.filter(t => !t.parent_id)
    const subtasks = filteredTasks.filter(t => t.parent_id)
    return topLevel.map(task => ({
      ...task,
      subtasks: subtasks.filter(st => st.parent_id === task.id)
    }))
  }, [filteredTasks])

  const completedTaskTree = useMemo(() => {
    return taskTree.filter(t => t.completed)
  }, [taskTree])

  const incompleteTaskTree = useMemo(() => {
    return taskTree.filter(t => !t.completed)
  }, [taskTree])

  // 今日视图：已过期任务（截止日期早于今天且未完成）
  const overdueTaskTree = useMemo(() => {
    if (currentView !== 'today') return []
    const todayStart = dateFnsStartOfDay(new Date())
    return tasks.filter(t => {
      if (!t.due_date || t.completed) return false
      return dateFnsIsBefore(new Date(t.due_date), todayStart)
    }).sort((a, b) => {
      const pa = a.priority === 0 ? 4 : a.priority
      const pb = b.priority === 0 ? 4 : b.priority
      if (pa !== pb) return pa - pb
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      return b.created_at.localeCompare(a.created_at)
    })
  }, [tasks, currentView])

  const taskCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    tasks.forEach((t) => {
      if (!t.completed) {
        counts[t.list_id] = (counts[t.list_id] || 0) + 1
      }
    })
    return counts
  }, [tasks])

  const selectedTask = useMemo(() => {
    return tasks.find((t) => t.id === selectedTaskId) || null
  }, [tasks, selectedTaskId])

  async function handleCreateTask() {
    if (!newTaskTitle.trim()) return

    // AI 模式：解析自然语言
    if (aiMode) {
      await handleCreateTaskWithAI()
      return
    }

    try {
      const listId = selectedListId ?? (lists.length > 0 ? lists[0].id : 1)
      const newTask = await api.createTask({
        title: newTaskTitle,
        list_id: listId,
      })
      setTasks([newTask, ...tasks])
      setNewTaskTitle('')
      toast.success('任务已创建')
    } catch (error) {
      console.error('Failed to create task:', error)
      toast.error('创建任务失败')
    }
  }

  // AI 自然语言创建任务
  async function handleCreateTaskWithAI() {
    if (!newTaskTitle.trim()) return
    if (!getLLMConfig()) {
      toast.error('请先在设置中配置大模型 API')
      return
    }
    setAiParsing(true)
    try {
      const parsed = await parseNaturalLanguageTask(newTaskTitle.trim())
      const listId = selectedListId ?? (lists.length > 0 ? lists[0].id : 1)
      const newTask = await api.createTask({
        title: parsed.title,
        list_id: listId,
        due_date: parsed.due_date || undefined,
        priority: parsed.priority ?? 0,
        notes: parsed.notes || undefined,
      })
      setTasks([newTask, ...tasks])
      setNewTaskTitle('')
      const extras: string[] = []
      if (parsed.due_date) extras.push(`时间: ${new Date(parsed.due_date).toLocaleString('zh-CN')}`)
      if (parsed.priority && parsed.priority > 0) {
        const pLabel = parsed.priority === 1 ? '高' : parsed.priority === 2 ? '中' : '低'
        extras.push(`优先级: ${pLabel}`)
      }
      toast.success(`AI 已创建任务${extras.length ? '（' + extras.join('，') + '）' : ''}`)
    } catch (error: any) {
      console.error('AI parse failed:', error)
      toast.error(`AI 解析失败: ${error.message || error}`)
    } finally {
      setAiParsing(false)
    }
  }

  async function handleToggleTask(task: Task) {
    try {
      // 如果是完成操作且有重复规则，使用 completeTask 自动生成下一周期
      if (!task.completed && task.repeat_rule) {
        const result = await api.completeTask(task.id)
        // 标记当前任务为已完成
        setTasks(tasks.map((t) => (t.id === task.id ? { ...t, completed: true, updated_at: new Date().toISOString() } : t)))
        // 如果生成了新任务，重新加载数据
        if (result.new_task_id) {
          await loadData()
          toast.success('重复任务已生成下一周期')
        } else {
          toast.success('任务已完成')
        }
        return
      }
      await api.updateTask(task.id, { completed: !task.completed })
      setTasks(tasks.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t)))
    } catch (error) {
      console.error('Failed to update task:', error)
      toast.error('更新任务失败')
    }
  }

  async function handleUpdateTask(id: number, updates: Partial<Task>) {
    try {
      await api.updateTask(id, updates)
      setTasks(tasks.map((t) => (t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t)))
    } catch (error) {
      console.error('Failed to update task:', error)
      toast.error('更新任务失败')
    }
  }

  async function handleDeleteTask(id: number) {
    try {
      await api.deleteTask(id)
      setTasks(tasks.filter((t) => t.id !== id))
      setSelectedTaskId(null)
      toast.success('任务已删除')
    } catch (error) {
      console.error('Failed to delete task:', error)
      toast.error('删除任务失败')
    }
  }

  async function handleCreateList(name: string, color?: string) {
    try {
      const newList = await api.createList({ name, color })
      setLists([...lists, newList])
      toast.success('清单已创建')
    } catch (error) {
      console.error('Failed to create list:', error)
      toast.error('创建清单失败')
    }
  }

  async function handleUpdateList(id: number, updates: { name?: string; color?: string }) {
    try {
      await api.updateList(id, updates)
      setLists(lists.map((l) => (l.id === id ? { ...l, ...updates, updated_at: new Date().toISOString() } : l)))
      toast.success('清单已更新')
    } catch (error) {
      console.error('Failed to update list:', error)
      toast.error('更新清单失败')
    }
  }

  async function handleDeleteList(id: number) {
    try {
      await api.deleteList(id)
      // 将被删清单的任务移到默认清单
      const defaultList = lists.find((l) => l.is_default)
      const defaultId = defaultList?.id ?? lists[0]?.id ?? 1
      setTasks(tasks.map((t) => (t.list_id === id ? { ...t, list_id: defaultId } : t)))
      setLists(lists.filter((l) => l.id !== id))
      if (selectedListId === id) setSelectedListId(null)
      toast.success('清单已删除')
    } catch (error) {
      console.error('Failed to delete list:', error)
      toast.error('删除清单失败')
    }
  }

  async function handleMoveTask(taskId: number, newDate: string) {
    try {
      await api.updateTask(taskId, { due_date: newDate })
      setTasks(tasks.map((t) =>
        t.id === taskId ? { ...t, due_date: newDate, updated_at: new Date().toISOString() } : t
      ))
    } catch (error) {
      console.error('Failed to move task:', error)
      toast.error('移动任务失败')
    }
  }

  async function handleCreateTag(name: string, color?: string) {
    try {
      const newTag = await api.createTag({ name, color })
      setTags([...tags, newTag])
      toast.success('标签已创建')
    } catch (error) {
      console.error('Failed to create tag:', error)
      toast.error('创建标签失败')
    }
  }

  async function handleDeleteTag(id: number) {
    try {
      await api.deleteTag(id)
      setTags(tags.filter((t) => t.id !== id))
      // 从所有任务中移除该标签
      setTasks(tasks.map((t) => ({
        ...t,
        tag_ids: t.tag_ids?.filter(tid => tid !== id)
      })))
      if (selectedTagId === id) setSelectedTagId(null)
      toast.success('标签已删除')
    } catch (error) {
      console.error('Failed to delete tag:', error)
      toast.error('删除标签失败')
    }
  }

  async function handleAddTagToTask(taskId: number, tagId: number) {
    try {
      await api.addTagToTask(taskId, tagId)
      setTasks(tasks.map((t) =>
        t.id === taskId ? { ...t, tag_ids: [...(t.tag_ids || []), tagId] } : t
      ))
    } catch (error) {
      console.error('Failed to add tag:', error)
      toast.error('添加标签失败')
    }
  }

  async function handleRemoveTagFromTask(taskId: number, tagId: number) {
    try {
      await api.removeTagFromTask(taskId, tagId)
      setTasks(tasks.map((t) =>
        t.id === taskId ? { ...t, tag_ids: t.tag_ids?.filter(tid => tid !== tagId) } : t
      ))
    } catch (error) {
      console.error('Failed to remove tag:', error)
      toast.error('移除标签失败')
    }
  }

  function toggleTaskExpand(taskId: number) {
    setExpandedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  async function handleCreateSubtask(parentId: number, title: string) {
    if (!title.trim()) return
    try {
      const parentTask = tasks.find(t => t.id === parentId)
      const listId = parentTask?.list_id ?? (lists.length > 0 ? lists[0].id : 1)
      const newTask = await api.createTask({
        title: title.trim(),
        list_id: listId,
        parent_id: parentId,
      })
      setTasks([newTask, ...tasks])
      setSubtaskInputs({ ...subtaskInputs, [parentId]: '' })
      // 自动展开父任务
      setExpandedTasks(prev => new Set(prev).add(parentId))
    } catch (error) {
      console.error('Failed to create subtask:', error)
      toast.error('创建子任务失败')
    }
  }

  // 拖拽排序
  async function handleReorderTasks(draggedId: number, targetId: number) {
    if (draggedId === targetId) return
    // 找到拖拽任务和目标任务在列表中的位置
    const draggedIndex = incompleteTaskTree.findIndex(t => t.id === draggedId)
    const targetIndex = incompleteTaskTree.findIndex(t => t.id === targetId)
    if (draggedIndex === -1 || targetIndex === -1) return

    // 重新排列
    const newOrder = [...incompleteTaskTree]
    const [moved] = newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, moved)

    // 重新计算 sort_order：使用相邻任务的中间值
    const reorderItems: ReorderItem[] = newOrder.map((task, index) => ({
      id: task.id,
      sort_order: index,
    }))

    // 乐观更新 UI
    const sortOrderMap = new Map(reorderItems.map(item => [item.id, item.sort_order]))
    setTasks(tasks.map(t => sortOrderMap.has(t.id) ? { ...t, sort_order: sortOrderMap.get(t.id)! } : t))

    try {
      await api.reorderTasks(reorderItems)
    } catch (error) {
      console.error('Failed to reorder tasks:', error)
      toast.error('排序失败')
      await loadData()
    }
  }

  async function handleCreateTaskOnDate(date: string, title?: string) {
    try {
      const listId = selectedListId ?? (lists.length > 0 ? lists[0].id : 1)
      const newTask = await api.createTask({
        title: title || '新任务',
        list_id: listId,
        due_date: date,
      })
      setTasks([newTask, ...tasks])
      setSelectedTaskId(newTask.id)
      toast.success('任务已创建')
    } catch (error) {
      console.error('Failed to create task:', error)
      toast.error('创建任务失败')
    }
  }

  async function handleCreateTaskOnRange(data: { dateKey: string; title: string; notes?: string; priority: number; listId: number; startHour: number; startMin: number; endHour: number; endMin: number }) {
    try {
      const [year, month, day] = data.dateKey.split('-').map(Number)
      const dueDate = new Date(year, month - 1, day, data.startHour, data.startMin)
      const endDate = new Date(year, month - 1, day, data.endHour, data.endMin)
      const reminder = new Date(year, month - 1, day, data.startHour, data.startMin)
      const newTask = await api.createTask({
        title: data.title,
        notes: data.notes,
        priority: data.priority,
        list_id: data.listId,
        due_date: dueDate.toISOString(),
        end_date: endDate.toISOString(),
        reminder: reminder.toISOString(),
      })
      setTasks([newTask, ...tasks])
      setSelectedTaskId(newTask.id)
      toast.success('任务已创建')
    } catch (error) {
      console.error('Failed to create task:', error)
      toast.error('创建任务失败')
    }
  }

  // ============ 批量操作 ============
  function toggleTaskSelection(taskId: number) {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  function selectAllTasks() {
    setSelectedTaskIds(new Set(incompleteTaskTree.map(t => t.id)))
  }

  function clearSelection() {
    setSelectedTaskIds(new Set())
  }

  async function handleBatchComplete() {
    const ids = Array.from(selectedTaskIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map(id => api.updateTask(id, { completed: true })))
      setTasks(tasks.map(t => selectedTaskIds.has(t.id) ? { ...t, completed: true, updated_at: new Date().toISOString() } : t))
      toast.success(`已完成 ${ids.length} 个任务`)
      clearSelection()
    } catch (error) {
      console.error('Batch complete failed:', error)
      toast.error('批量完成失败')
      await loadData()
    }
  }

  async function handleBatchDelete() {
    const ids = Array.from(selectedTaskIds)
    if (ids.length === 0) return
    if (!confirm(`确定批量删除 ${ids.length} 个任务吗？`)) return
    try {
      await Promise.all(ids.map(id => api.deleteTask(id)))
      setTasks(tasks.filter(t => !selectedTaskIds.has(t.id)))
      toast.success(`已删除 ${ids.length} 个任务`)
      clearSelection()
    } catch (error) {
      console.error('Batch delete failed:', error)
      toast.error('批量删除失败')
      await loadData()
    }
  }

  async function handleBatchPriority(priority: number) {
    const ids = Array.from(selectedTaskIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map(id => api.updateTask(id, { priority })))
      setTasks(tasks.map(t => selectedTaskIds.has(t.id) ? { ...t, priority, updated_at: new Date().toISOString() } : t))
      toast.success(`已设置 ${ids.length} 个任务的优先级`)
      clearSelection()
    } catch (error) {
      console.error('Batch priority failed:', error)
      toast.error('批量设置优先级失败')
      await loadData()
    }
  }

  async function handleBatchMoveList(listId: number) {
    const ids = Array.from(selectedTaskIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map(id => api.updateTask(id, { list_id: listId })))
      setTasks(tasks.map(t => selectedTaskIds.has(t.id) ? { ...t, list_id: listId, updated_at: new Date().toISOString() } : t))
      toast.success(`已移动 ${ids.length} 个任务`)
      clearSelection()
    } catch (error) {
      console.error('Batch move failed:', error)
      toast.error('批量移动失败')
      await loadData()
    }
  }

  async function handleBatchArchive() {
    const ids = Array.from(selectedTaskIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map(id => api.updateTask(id, { archived: true })))
      setTasks(tasks.map(t => selectedTaskIds.has(t.id) ? { ...t, archived: true, updated_at: new Date().toISOString() } : t))
      toast.success(`已归档 ${ids.length} 个任务`)
      clearSelection()
      if (currentView !== 'archived') setBatchMode(false)
    } catch (error) {
      console.error('Batch archive failed:', error)
      toast.error('批量归档失败')
      await loadData()
    }
  }

  // ============ 快速编辑 ============
  async function handleInlineEdit(id: number, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    await handleUpdateTask(id, { title: trimmed })
  }

  // ============ 归档/恢复 ============
  async function handleArchiveTask(id: number) {
    try {
      await api.updateTask(id, { archived: true })
      setTasks(tasks.map(t => t.id === id ? { ...t, archived: true, updated_at: new Date().toISOString() } : t))
      toast.success('任务已归档')
      if (selectedTaskId === id) setSelectedTaskId(null)
    } catch (error) {
      console.error('Archive failed:', error)
      toast.error('归档失败')
    }
  }

  async function handleUnarchiveTask(id: number) {
    try {
      await api.updateTask(id, { archived: false })
      setTasks(tasks.map(t => t.id === id ? { ...t, archived: false, updated_at: new Date().toISOString() } : t))
      toast.success('任务已恢复')
    } catch (error) {
      console.error('Unarchive failed:', error)
      toast.error('恢复失败')
    }
  }

  // ============ 拖拽到日历（设置截止日期）============
  async function handleDropToCalendarDate(taskId: number, dateKey: string) {
    try {
      const [year, month, day] = dateKey.split('-').map(Number)
      const dueDate = new Date(year, month - 1, day, 9, 0)
      await api.updateTask(taskId, { due_date: dueDate.toISOString() })
      setTasks(tasks.map(t => t.id === taskId ? { ...t, due_date: dueDate.toISOString(), updated_at: new Date().toISOString() } : t))
      toast.success(`已设置截止日期为 ${month}月${day}日`)
    } catch (error) {
      console.error('Drop to calendar failed:', error)
      toast.error('设置截止日期失败')
    }
  }

  function handleDragStartGlobal() {
    setIsDraggingTask(true)
  }

  function handleDragEndGlobal() {
    setIsDraggingTask(false)
    setDragOverCalendarDate(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">加载中...</p>
      </div>
    )
  }

  const currentListName =
    currentView === 'today'
      ? '今日任务'
      : selectedTagId !== null
      ? (tags.find(t => t.id === selectedTagId)?.name || '标签')
      : selectedListId === null
      ? '全部任务'
      : lists.find((l) => l.id === selectedListId)?.name || '未知清单'

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        lists={lists}
        tags={tags}
        selectedListId={selectedListId}
        selectedTagId={selectedTagId}
        currentView={currentView}
        onSelectList={(id) => { setSelectedListId(id); setSelectedTagId(null) }}
        onSelectTag={(id) => { setSelectedTagId(id); setSelectedListId(null) }}
        onViewChange={setCurrentView}
        onCreateList={handleCreateList}
        onUpdateList={handleUpdateList}
        onDeleteList={handleDeleteList}
        onCreateTag={handleCreateTag}
        onDeleteTag={handleDeleteTag}
        taskCounts={taskCounts}
        todayCount={todayCount}
        archivedCount={archivedCount}
      />

      {currentView === 'calendar' ? (
        <main className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <CalendarView
              tasks={tasks}
              lists={lists}
              onTaskClick={(id) => setSelectedTaskId(id)}
              onToggleTask={(id) => handleToggleTask(tasks.find(t => t.id === id)!)}
              onMoveTask={handleMoveTask}
              onCreateTask={handleCreateTaskOnDate}
              onCreateTaskOnRange={handleCreateTaskOnRange}
            />
          </div>
          {selectedTask && (
            <TaskDetail
              task={selectedTask}
              tags={tags}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
              onClose={() => setSelectedTaskId(null)}
              onAddTag={handleAddTagToTask}
              onRemoveTag={handleRemoveTagFromTask}
              onCreateSubtask={handleCreateSubtask}
            />
          )}
        </main>
      ) : currentView === 'stats' ? (
        <StatsView tasks={tasks} lists={lists} />
      ) : currentView === 'settings' ? (
        <SettingsView onClose={() => setCurrentView('tasks')} />
      ) : currentView === 'ai' ? (
        <AIAssistant tasks={tasks} onClose={() => setCurrentView('tasks')} onTasksChange={loadData} />
      ) : (
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {currentView === 'archived' ? '归档' : searchQuery.trim() ? '搜索结果' : currentListName}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {currentView === 'archived'
                    ? `${taskTree.length} 个已归档`
                    : `${incompleteTaskTree.length} 个未完成 / ${taskTree.length} 个总计`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* 批量模式切换按钮 */}
                {currentView !== 'archived' && (
                  <button
                    onClick={() => {
                      setBatchMode(!batchMode)
                      if (batchMode) clearSelection()
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
                      batchMode
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                    title={batchMode ? '退出批量模式' : '进入批量模式'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    批量
                  </button>
                )}
                {/* 筛选按钮 */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors relative ${
                    hasActiveFilters
                      ? 'bg-blue-50 text-blue-600 border-blue-300'
                      : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                  title="组合筛选"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-3.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  筛选
                  {hasActiveFilters && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
                  )}
                </button>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索任务... (Ctrl+F)"
                    className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64"
                  />
                </div>
              </div>
            </div>

            {/* 筛选面板 */}
            {showFilters && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-gray-500">筛选条件：</span>
                {/* 优先级筛选 */}
                <select
                  value={filters.priority === null ? '' : filters.priority}
                  onChange={(e) => setFilters({ ...filters, priority: e.target.value === '' ? null : Number(e.target.value) })}
                  className="px-2 py-1 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">全部优先级</option>
                  <option value="1">高优先级</option>
                  <option value="2">中优先级</option>
                  <option value="3">低优先级</option>
                  <option value="0">无优先级</option>
                </select>
                {/* 日期范围筛选 */}
                <select
                  value={filters.dateRange}
                  onChange={(e) => setFilters({ ...filters, dateRange: e.target.value as FilterState['dateRange'] })}
                  className="px-2 py-1 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="all">全部日期</option>
                  <option value="today">今天</option>
                  <option value="week">本周</option>
                  <option value="month">本月</option>
                  <option value="overdue">已过期</option>
                  <option value="none">无截止日期</option>
                </select>
                {/* 标签筛选 */}
                <select
                  value={filters.tagId === null ? '' : filters.tagId}
                  onChange={(e) => setFilters({ ...filters, tagId: e.target.value === '' ? null : Number(e.target.value) })}
                  className="px-2 py-1 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">全部标签</option>
                  {tags.map(tag => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
                {/* 清单筛选 */}
                <select
                  value={filters.listId === null ? '' : filters.listId}
                  onChange={(e) => setFilters({ ...filters, listId: e.target.value === '' ? null : Number(e.target.value) })}
                  className="px-2 py-1 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">全部清单</option>
                  {lists.map(list => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
                {hasActiveFilters && (
                  <button
                    onClick={() => setFilters({ priority: null, dateRange: 'all', tagId: null, listId: null })}
                    className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md"
                  >
                    清除筛选
                  </button>
                )}
              </div>
            )}

            {/* 批量操作工具栏 */}
            {batchMode && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-blue-700">
                  已选 {selectedTaskIds.size} 项
                </span>
                <div className="h-4 w-px bg-blue-200 mx-1" />
                <button onClick={selectAllTasks} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 rounded">全选</button>
                <button onClick={clearSelection} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 rounded">取消</button>
                <div className="h-4 w-px bg-blue-200 mx-1" />
                <button
                  onClick={handleBatchComplete}
                  disabled={selectedTaskIds.size === 0}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-green-600 hover:bg-green-100 rounded disabled:opacity-40"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  完成
                </button>
                <button
                  onClick={handleBatchArchive}
                  disabled={selectedTaskIds.size === 0}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded disabled:opacity-40"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                  归档
                </button>
                <select
                  onChange={(e) => {
                    if (e.target.value) handleBatchPriority(Number(e.target.value))
                    e.target.value = ''
                  }}
                  disabled={selectedTaskIds.size === 0}
                  className="px-2 py-1 text-xs border border-blue-200 rounded bg-white disabled:opacity-40"
                  defaultValue=""
                >
                  <option value="" disabled>设优先级</option>
                  <option value="1">高</option>
                  <option value="2">中</option>
                  <option value="3">低</option>
                  <option value="0">无</option>
                </select>
                <select
                  onChange={(e) => {
                    if (e.target.value) handleBatchMoveList(Number(e.target.value))
                    e.target.value = ''
                  }}
                  disabled={selectedTaskIds.size === 0}
                  className="px-2 py-1 text-xs border border-blue-200 rounded bg-white disabled:opacity-40"
                  defaultValue=""
                >
                  <option value="" disabled>移动到清单</option>
                  {lists.map(list => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
                <div className="flex-1" />
                <button
                  onClick={handleBatchDelete}
                  disabled={selectedTaskIds.size === 0}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-100 rounded disabled:opacity-40"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  删除
                </button>
              </div>
            )}
          </header>

          {/* 拖拽任务时显示的浮动迷你日历 */}
          {isDraggingTask && (
            <MiniCalendarDropzone
              currentDate={miniCalendarDate}
              onPrevMonth={() => setMiniCalendarDate(new Date(miniCalendarDate.getFullYear(), miniCalendarDate.getMonth() - 1, 1))}
              onNextMonth={() => setMiniCalendarDate(new Date(miniCalendarDate.getFullYear(), miniCalendarDate.getMonth() + 1, 1))}
              onDropDate={handleDropToCalendarDate}
              onClose={handleDragEndGlobal}
              dragOverDate={dragOverCalendarDate}
              setDragOverDate={setDragOverCalendarDate}
            />
          )}

          {currentView !== 'archived' && (
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    ref={newTaskInputRef}
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !aiParsing && handleCreateTask()}
                    disabled={aiParsing}
                    placeholder={aiMode ? '试试输入：明天下午3点开会，优先级高' : '添加新任务...'}
                    className={`w-full pl-4 pr-24 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-60 ${
                      aiMode ? 'border-purple-300 bg-purple-50/30' : 'border-gray-300'
                    }`}
                  />
                  <button
                    onClick={() => { setAiMode(!aiMode); newTaskInputRef.current?.focus() }}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
                      aiMode
                        ? 'bg-purple-500 text-white'
                        : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                    }`}
                    title={aiMode ? '关闭 AI 模式' : '开启 AI 自然语言输入'}
                  >
                    {aiMode ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    )}
                    AI
                  </button>
                </div>
                <button
                  onClick={handleCreateTask}
                  disabled={aiParsing}
                  className={`px-6 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                    aiMode ? 'bg-purple-500 hover:bg-purple-600' : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  {aiParsing && (
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {aiParsing ? '解析中...' : aiMode ? 'AI 创建' : '添加'}
                </button>
              </div>
              {aiMode && (
                <p className="mt-1.5 text-xs text-purple-500 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  AI 模式：用自然语言描述任务，AI 会自动识别时间、优先级
                </p>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {/* 归档视图：直接显示所有归档任务 */}
            {currentView === 'archived' ? (
              taskTree.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  <p>暂无归档任务</p>
                  <p className="text-xs mt-1">完成的任务超过 7 天后会自动归档</p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {taskTree.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      tags={tags}
                      isSelected={selectedTaskId === task.id}
                      isExpanded={expandedTasks.has(task.id)}
                      onToggleExpand={() => toggleTaskExpand(task.id)}
                      subtaskInput={subtaskInputs[task.id] || ''}
                      onSubtaskInputChange={(val) => setSubtaskInputs({ ...subtaskInputs, [task.id]: val })}
                      onCreateSubtask={(title) => handleCreateSubtask(task.id, title)}
                      onToggle={() => handleToggleTask(task)}
                      onClick={() => setSelectedTaskId(task.id)}
                      onReorder={() => {}}
                      onDelete={handleDeleteTask}
                      isArchivedView={true}
                      onUnarchive={handleUnarchiveTask}
                      onInlineEdit={handleInlineEdit}
                    />
                  ))}
                </ul>
              )
            ) : (
              <>
                {/* 今日视图：已过期任务 */}
                {currentView === 'today' && overdueTaskTree.length > 0 && (
                  <div className="mb-4">
                    <button
                      onClick={() => setShowOverdue(!showOverdue)}
                      className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 mb-2 transition-colors font-medium"
                    >
                      <svg className={`w-4 h-4 transition-transform ${showOverdue ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      已过期 ({overdueTaskTree.length})
                    </button>
                    {showOverdue && (
                      <ul className="space-y-1">
                        {overdueTaskTree.map((task) => (
                          <TaskItem
                            key={task.id}
                            task={task}
                            tags={tags}
                            isSelected={selectedTaskId === task.id}
                            isExpanded={expandedTasks.has(task.id)}
                            onToggleExpand={() => toggleTaskExpand(task.id)}
                            subtaskInput={subtaskInputs[task.id] || ''}
                            onSubtaskInputChange={(val) => setSubtaskInputs({ ...subtaskInputs, [task.id]: val })}
                            onCreateSubtask={(title) => handleCreateSubtask(task.id, title)}
                            onToggle={() => handleToggleTask(task)}
                            onClick={() => setSelectedTaskId(task.id)}
                            onReorder={() => {}}
                            onDelete={handleDeleteTask}
                            batchMode={batchMode}
                            isSelectedForBatch={selectedTaskIds.has(task.id)}
                            onToggleSelect={() => toggleTaskSelection(task.id)}
                            onInlineEdit={handleInlineEdit}
                            onArchive={handleArchiveTask}
                            onDragStartGlobal={handleDragStartGlobal}
                            onDragEndGlobal={handleDragEndGlobal}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {filteredTasks.length === 0 && overdueTaskTree.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <p>{hasActiveFilters ? '没有符合筛选条件的任务' : '暂无任务，开始添加你的第一个任务吧！'}</p>
                  </div>
                ) : (
                  <>
                    <ul className="space-y-1">
                      {incompleteTaskTree.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          tags={tags}
                          isSelected={selectedTaskId === task.id}
                          isExpanded={expandedTasks.has(task.id)}
                          onToggleExpand={() => toggleTaskExpand(task.id)}
                          subtaskInput={subtaskInputs[task.id] || ''}
                          onSubtaskInputChange={(val) => setSubtaskInputs({ ...subtaskInputs, [task.id]: val })}
                          onCreateSubtask={(title) => handleCreateSubtask(task.id, title)}
                          onToggle={() => handleToggleTask(task)}
                          onClick={() => setSelectedTaskId(task.id)}
                          onReorder={handleReorderTasks}
                          onDelete={handleDeleteTask}
                          batchMode={batchMode}
                          isSelectedForBatch={selectedTaskIds.has(task.id)}
                          onToggleSelect={() => toggleTaskSelection(task.id)}
                          onInlineEdit={handleInlineEdit}
                          onArchive={handleArchiveTask}
                          onDragStartGlobal={handleDragStartGlobal}
                          onDragEndGlobal={handleDragEndGlobal}
                        />
                      ))}
                    </ul>

                    {completedTaskTree.length > 0 && (
                      <div className="mt-4">
                        <button
                          onClick={() => setShowCompleted(!showCompleted)}
                          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-2 transition-colors"
                        >
                          <svg className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          已完成 ({completedTaskTree.length})
                        </button>
                        {showCompleted && (
                          <ul className="space-y-1">
                            {completedTaskTree.map((task) => (
                              <TaskItem
                                key={task.id}
                                task={task}
                                tags={tags}
                                isSelected={selectedTaskId === task.id}
                                isExpanded={expandedTasks.has(task.id)}
                                onToggleExpand={() => toggleTaskExpand(task.id)}
                                subtaskInput={subtaskInputs[task.id] || ''}
                                onSubtaskInputChange={(val) => setSubtaskInputs({ ...subtaskInputs, [task.id]: val })}
                                onCreateSubtask={(title) => handleCreateSubtask(task.id, title)}
                                onToggle={() => handleToggleTask(task)}
                                onClick={() => setSelectedTaskId(task.id)}
                                onReorder={() => {}}
                                onDelete={handleDeleteTask}
                                batchMode={batchMode}
                                isSelectedForBatch={selectedTaskIds.has(task.id)}
                                onToggleSelect={() => toggleTaskSelection(task.id)}
                                onInlineEdit={handleInlineEdit}
                                onArchive={handleArchiveTask}
                                onDragStartGlobal={handleDragStartGlobal}
                                onDragEndGlobal={handleDragEndGlobal}
                              />
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </main>
      )}

      {currentView !== 'calendar' && currentView !== 'settings' && selectedTask && (
        <TaskDetail
          task={selectedTask}
          tags={tags}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
          onClose={() => setSelectedTaskId(null)}
          onAddTag={handleAddTagToTask}
          onRemoveTag={handleRemoveTagFromTask}
          onCreateSubtask={handleCreateSubtask}
        />
      )}
    </div>
  )
}

function TaskItem({ task, tags, isSelected, isExpanded, onToggleExpand, subtaskInput, onSubtaskInputChange, onCreateSubtask, onToggle, onClick, onReorder, onDelete, batchMode, isSelectedForBatch, onToggleSelect, onInlineEdit, onArchive, onUnarchive, isArchivedView, onDragStartGlobal, onDragEndGlobal }: {
  task: Task
  tags: Tag[]
  isSelected: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  subtaskInput: string
  onSubtaskInputChange: (val: string) => void
  onCreateSubtask: (title: string) => void
  onToggle: () => void
  onClick: () => void
  onReorder: (draggedId: number, targetId: number) => void
  onDelete: (taskId: number) => void
  batchMode?: boolean
  isSelectedForBatch?: boolean
  onToggleSelect?: () => void
  onInlineEdit?: (id: number, title: string) => void
  onArchive?: (id: number) => void
  onUnarchive?: (id: number) => void
  isArchivedView?: boolean
  onDragStartGlobal?: () => void
  onDragEndGlobal?: () => void
}) {
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after' | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const hasSubtasks = task.subtasks && task.subtasks.length > 0
  const completedSubtasks = task.subtasks?.filter(st => st.completed).length || 0
  const totalSubtasks = task.subtasks?.length || 0
  const priorityStyle = getPriorityStyle(task.priority)

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(task.id))
    onDragStartGlobal?.()
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    setDragOverPos(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
  }

  function handleDragLeave() {
    setDragOverPos(null)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const draggedId = Number(e.dataTransfer.getData('text/plain'))
    if (draggedId && draggedId !== task.id) {
      onReorder(draggedId, task.id)
    }
    setDragOverPos(null)
  }

  function handleDragEnd() {
    onDragEndGlobal?.()
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (onInlineEdit && !batchMode) {
      setEditTitle(task.title)
      setIsEditing(true)
    }
  }

  function handleEditSave() {
    if (onInlineEdit) {
      onInlineEdit(task.id, editTitle)
    }
    setIsEditing(false)
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleEditSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditTitle(task.title)
      setIsEditing(false)
    }
  }

  useEffect(() => {
    if (!contextMenu) return
    function closeMenu() { setContextMenu(null) }
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [contextMenu])

  return (
    <li
      draggable={!batchMode && !isEditing}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      className={`task-enter ${dragOverPos === 'before' ? 'border-t-2 border-blue-400' : dragOverPos === 'after' ? 'border-b-2 border-blue-400' : ''}`}
    >
      <div
        onClick={(e) => {
          if (batchMode && onToggleSelect) {
            e.stopPropagation()
            onToggleSelect()
          } else if (!isEditing) {
            onClick()
          }
        }}
        onDoubleClick={handleDoubleClick}
        className={`flex items-center gap-3 px-4 py-3.5 rounded-lg cursor-pointer transition-colors border-l-4 ${
          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
        } ${batchMode && isSelectedForBatch ? 'bg-blue-50' : ''} ${task.completed ? 'opacity-60' : ''} ${priorityStyle.borderLeft}`}
      >
        {hasSubtasks ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
            className="flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-600"
            aria-label={isExpanded ? '折叠子任务' : '展开子任务'}
          >
            <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}
        {batchMode ? (
          <input
            type="checkbox"
            checked={isSelectedForBatch || false}
            onChange={(e) => { e.stopPropagation(); onToggleSelect?.() }}
            onClick={(e) => e.stopPropagation()}
            className="checkbox-bounce w-5 h-5 text-blue-500 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
          />
        ) : (
          <input
            type="checkbox"
            checked={task.completed}
            onChange={(e) => { e.stopPropagation(); onToggle() }}
            onClick={(e) => e.stopPropagation()}
            className="checkbox-bounce w-5 h-5 text-blue-500 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
          />
        )}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditSave}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              autoFocus
              className="w-full text-[15px] font-medium px-1 py-0.5 border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          ) : (
            <p className={`text-[15px] font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {task.title}
              {isArchivedView && (
                <span className="ml-2 text-xs text-gray-400 font-normal">(已归档)</span>
              )}
            </p>
          )}
          <div className="flex items-center gap-3 mt-0.5 opacity-70">
            {task.due_date && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {new Date(task.due_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
              </span>
            )}
            {task.notes && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
            )}
            {hasSubtasks && (
              <span className="text-xs text-gray-400">
                {completedSubtasks}/{totalSubtasks}
              </span>
            )}
            {task.tag_ids && task.tag_ids.length > 0 && (
              <div className="flex items-center gap-1">
                {task.tag_ids.map(tagId => {
                  const tag = tags.find(t => t.id === tagId)
                  if (!tag) return null
                  return (
                    <span
                      key={tagId}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] rounded"
                      style={{ backgroundColor: hexWithAlpha(tag.color || '#6B7280', 0.12), color: tag.color || '#6B7280' }}
                    >
                      {tag.name}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 子任务列表 */}
      {isExpanded && hasSubtasks && (
        <div className="ml-8 mt-1 space-y-1 border-l-2 border-gray-100 pl-4">
          {task.subtasks!.map(subtask => (
            <div
              key={subtask.id}
              onClick={() => onClick()}
              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
              } ${subtask.completed ? 'opacity-60' : ''}`}
            >
              <input
                type="checkbox"
                checked={subtask.completed}
                onChange={(e) => { e.stopPropagation(); onToggle() }}
                onClick={(e) => e.stopPropagation()}
                className="checkbox-bounce w-4 h-4 text-blue-500 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
              />
              <span className={`text-sm ${subtask.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                {subtask.title}
              </span>
            </div>
          ))}
          {/* 添加子任务输入框 */}
          <div className="flex items-center gap-2 p-2">
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <input
              type="text"
              value={subtaskInput}
              onChange={(e) => onSubtaskInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateSubtask(subtaskInput)
                if (e.key === 'Escape') onSubtaskInputChange('')
              }}
              placeholder="添加子任务..."
              className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-40"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!isArchivedView && onInlineEdit && (
            <button
              onClick={() => {
                setContextMenu(null)
                setEditTitle(task.title)
                setIsEditing(true)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              重命名
            </button>
          )}
          {isArchivedView && onUnarchive ? (
            <button
              onClick={() => { onUnarchive(task.id); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-600 hover:bg-green-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              恢复任务
            </button>
          ) : onArchive && (
            <button
              onClick={() => { onArchive(task.id); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              归档
            </button>
          )}
          <button
            onClick={() => { onDelete(task.id); setContextMenu(null) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除任务
          </button>
        </div>
      )}
    </li>
  )
}

function MiniCalendarDropzone({ currentDate, onPrevMonth, onNextMonth, onDropDate, onClose, dragOverDate, setDragOverDate }: {
  currentDate: Date
  onPrevMonth: () => void
  onNextMonth: () => void
  onDropDate: (taskId: number, dateKey: string) => void
  onClose: () => void
  dragOverDate: string | null
  setDragOverDate: (d: string | null) => void
}) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const weekDays = ['一', '二', '三', '四', '五', '六', '日']

  function handleDrop(e: React.DragEvent, date: Date) {
    e.preventDefault()
    const taskId = Number(e.dataTransfer.getData('text/plain'))
    if (taskId) {
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      onDropDate(taskId, dateKey)
    }
    setDragOverDate(null)
    onClose()
  }

  function handleDragOver(e: React.DragEvent, date: Date) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    setDragOverDate(dateKey)
  }

  return (
    <div className="absolute right-6 top-32 z-40 bg-white rounded-lg shadow-2xl border border-gray-200 p-3 w-72">
      <div className="flex items-center justify-between mb-2">
        <button onClick={onPrevMonth} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-sm font-medium text-gray-700">
          {format(currentDate, 'yyyy年M月', { locale: zhCN })}
        </span>
        <button onClick={onNextMonth} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekDays.map(d => (
          <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(date => {
          const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          const isToday = dateFnsIsToday(date)
          const isCurrentMonth = isSameMonth(date, currentDate)
          const isDragOver = dragOverDate === dateKey
          return (
            <div
              key={date.toISOString()}
              onDrop={(e) => handleDrop(e, date)}
              onDragOver={(e) => handleDragOver(e, date)}
              onDragLeave={() => setDragOverDate(null)}
              className={`text-center text-xs py-1.5 rounded cursor-pointer transition-colors ${
                isDragOver
                  ? 'bg-blue-500 text-white'
                  : isToday
                  ? 'bg-blue-100 text-blue-600'
                  : isCurrentMonth
                  ? 'text-gray-700 hover:bg-gray-100'
                  : 'text-gray-300'
              }`}
            >
              {date.getDate()}
            </div>
          )
        })}
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-center text-xs text-gray-400">
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        拖拽任务到日期设置截止时间
      </div>
    </div>
  )
}

export default App
