import { useEffect, useState, useMemo, useRef } from 'react'
import {
  isToday as dateFnsIsToday, isBefore as dateFnsIsBefore, startOfDay as dateFnsStartOfDay,
  isThisWeek, isThisMonth,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { api } from './api'
import type { Task, ReorderItem } from './types'
import { Sidebar } from './components/Sidebar'
import { TaskDetail } from './components/TaskDetail'
import { TaskItem } from './components/TaskItem'
import { CalendarView } from './components/CalendarView'
import { StatsView } from './components/StatsView'
import { SettingsView } from './components/SettingsView'
import { AIAssistant } from './components/AIAssistant'
import { QuadrantView } from './components/QuadrantView'
import { PomodoroView } from './components/PomodoroView'
import { HabitView } from './components/HabitView'
import { EmptyState } from './components/EmptyState'
import { useToast } from './components/Toast'
import { getLLMConfig, parseNaturalLanguageTask } from './utils/llm'
import { parseSmartDate } from './utils/smartDate'
import { useTaskStore } from './stores/taskStore'
import { useListStore } from './stores/listStore'
import { useTagStore } from './stores/tagStore'
import { useFilterStore, type FilterState } from './stores/filterStore'
import { useUIStore } from './stores/uiStore'
import { getFontSetting, applyFont } from './utils/font'
import { getAppearance, applyAppearance } from './utils/appearance'

function App() {
  const toast = useToast()

  // ===== Store hooks: data =====
  const tasks = useTaskStore(s => s.tasks)
  const lists = useListStore(s => s.lists)
  const tags = useTagStore(s => s.tags)
  const loading = useTaskStore(s => s.loading)

  // ===== Store hooks: UI state =====
  const currentView = useUIStore(s => s.currentView)
  const selectedListId = useUIStore(s => s.selectedListId)
  const selectedTagId = useUIStore(s => s.selectedTagId)
  const selectedTaskId = useUIStore(s => s.selectedTaskId)
  const showCompleted = useUIStore(s => s.showCompleted)
  const showOverdue = useUIStore(s => s.showOverdue)
  const showFilters = useUIStore(s => s.showFilters)
  const aiMode = useUIStore(s => s.aiMode)
  const aiParsing = useUIStore(s => s.aiParsing)
  const expandedTasks = useUIStore(s => s.expandedTasks)
  const subtaskInputs = useUIStore(s => s.subtaskInputs)
  const batchMode = useUIStore(s => s.batchMode)
  const selectedTaskIds = useUIStore(s => s.selectedTaskIds)
  const isDraggingTask = useUIStore(s => s.isDraggingTask)
  const dragOverCalendarDate = useUIStore(s => s.dragOverCalendarDate)
  const miniCalendarDate = useUIStore(s => s.miniCalendarDate)
  const searchQuery = useUIStore(s => s.searchQuery)

  // ===== Store hooks: UI actions =====
  const setCurrentView = useUIStore(s => s.setCurrentView)
  const setSelectedListId = useUIStore(s => s.setSelectedListId)
  const setSelectedTagId = useUIStore(s => s.setSelectedTagId)
  const setSelectedTaskId = useUIStore(s => s.setSelectedTaskId)
  const setShowCompleted = useUIStore(s => s.setShowCompleted)
  const setShowOverdue = useUIStore(s => s.setShowOverdue)
  const toggleTaskExpand = useUIStore(s => s.toggleTaskExpand)
  const toggleTaskSelection = useUIStore(s => s.toggleTaskSelection)
  const selectAllTasksAction = useUIStore(s => s.selectAllTasks)
  const clearSelection = useUIStore(s => s.clearSelection)
  const setSearchQuery = useUIStore(s => s.setSearchQuery)
  const toggleBatchMode = useUIStore(s => s.toggleBatchMode)
  const toggleFilters = useUIStore(s => s.toggleFilters)
  const setSubtaskInput = useUIStore(s => s.setSubtaskInput)
  const setAiMode = useUIStore(s => s.setAiMode)
  const setAiParsing = useUIStore(s => s.setAiParsing)
  const setIsDraggingTask = useUIStore(s => s.setIsDraggingTask)
  const setDragOverCalendarDate = useUIStore(s => s.setDragOverCalendarDate)
  const setMiniCalendarDate = useUIStore(s => s.setMiniCalendarDate)

  // ===== Filter store =====
  const filters = useFilterStore()

  // ===== Local state =====
  const [newTaskTitle, setNewTaskTitle] = useState('')

  // ===== Refs =====
  const newTaskInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const notifiedTaskIds = useRef<Set<number>>(new Set())
  const autoArchivedRef = useRef(false)

  // ===== Effects =====
  useEffect(() => {
    useTaskStore.getState().loadTasks()
    useListStore.getState().loadLists()
    useTagStore.getState().loadTags()
    // 启动时应用保存的主题
    const savedTheme = (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system'
    const root = document.documentElement
    if (savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    // 启动时恢复保存的字体设置
    applyFont(getFontSetting())
    // 启动时恢复外观设置（字体大小、侧边栏密度）
    applyAppearance(getAppearance())
  }, [])

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
        .then(() => useTaskStore.getState().loadTasks())
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
  }, [selectedTaskId, searchQuery, setCurrentView, setSelectedListId, setSelectedTagId, setSearchQuery])

  // ===== Memoized computations =====
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
      // 置顶优先
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
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

  // 组装任务树：只显示顶层任务（无 parent_id），子任务挂载到 subtasks（Map-based O(n)）
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
    return topLevel.map((task) => ({
      ...task,
      subtasks: subtaskMap.get(task.id) || [],
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
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
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

  // ===== Handler functions =====
  async function handleCreateTask() {
    if (!newTaskTitle.trim()) return

    // AI 模式：解析自然语言
    if (aiMode) {
      await handleCreateTaskWithAI()
      return
    }

    // 智能日期识别（本地解析，无需 AI）
    const smartResult = parseSmartDate(newTaskTitle.trim())
    const listId = selectedListId ?? (lists.length > 0 ? lists[0].id : 1)
    const newTask = await useTaskStore.getState().createTask({
      title: smartResult.cleanedTitle,
      list_id: listId,
      due_date: smartResult.dueDate || undefined,
      priority: smartResult.priority ?? 0,
      repeat_rule: smartResult.repeatRule || undefined,
    })
    if (newTask) {
      setNewTaskTitle('')
      const extras: string[] = []
      if (smartResult.dueDate) {
        const d = new Date(smartResult.dueDate)
        extras.push(`时间: ${d.toLocaleDateString('zh-CN')} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`)
      }
      if (smartResult.priority && smartResult.priority > 0) {
        const pLabel = smartResult.priority === 1 ? '高' : smartResult.priority === 2 ? '中' : '低'
        extras.push(`优先级: ${pLabel}`)
      }
      if (smartResult.repeatRule) {
        extras.push('已设重复')
      }
      toast.success(`任务已创建${extras.length ? '（' + extras.join('，') + '）' : ''}`)
    } else {
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
      const newTask = await useTaskStore.getState().createTask({
        title: parsed.title,
        list_id: listId,
        due_date: parsed.due_date || undefined,
        priority: parsed.priority ?? 0,
        notes: parsed.notes || undefined,
      })
      if (newTask) {
        setNewTaskTitle('')
        const extras: string[] = []
        if (parsed.due_date) extras.push(`时间: ${new Date(parsed.due_date).toLocaleString('zh-CN')}`)
        if (parsed.priority && parsed.priority > 0) {
          const pLabel = parsed.priority === 1 ? '高' : parsed.priority === 2 ? '中' : '低'
          extras.push(`优先级: ${pLabel}`)
        }
        toast.success(`AI 已创建任务${extras.length ? '（' + extras.join('，') + '）' : ''}`)
      } else {
        toast.error('创建任务失败')
      }
    } catch (error: any) {
      console.error('AI parse failed:', error)
      toast.error(`AI 解析失败: ${error.message || error}`)
    } finally {
      setAiParsing(false)
    }
  }

  async function handleToggleTask(task: Task) {
    const result = await useTaskStore.getState().toggleTask(task)
    if (!result.success) {
      toast.error('更新任务失败')
    } else if (!task.completed && task.repeat_rule) {
      // Was completing a repeat task
      if (result.newTaskGenerated) {
        toast.success('重复任务已生成下一周期')
      } else {
        toast.success('任务已完成')
      }
    }
  }

  async function handleUpdateTask(id: number, updates: Partial<Task>) {
    const success = await useTaskStore.getState().updateTask(id, updates)
    if (!success) {
      toast.error('更新任务失败')
    }
  }

  async function handleDeleteTask(id: number) {
    const success = await useTaskStore.getState().deleteTask(id)
    if (success) {
      setSelectedTaskId(null)
      toast.success('任务已删除')
    } else {
      toast.error('删除任务失败')
    }
  }

  async function handleCreateList(name: string, color?: string) {
    const newList = await useListStore.getState().createList({ name, color })
    if (newList) {
      toast.success('清单已创建')
    } else {
      toast.error('创建清单失败')
    }
  }

  async function handleUpdateList(id: number, updates: { name?: string; color?: string }) {
    const success = await useListStore.getState().updateList(id, updates)
    if (success) {
      toast.success('清单已更新')
    } else {
      toast.error('更新清单失败')
    }
  }

  async function handleDeleteList(id: number) {
    // Get default list ID before deleting
    const allLists = useListStore.getState().lists
    const defaultList = allLists.find((l) => l.is_default)
    const defaultId = defaultList?.id ?? allLists[0]?.id ?? 1

    const success = await useListStore.getState().deleteList(id)
    if (success) {
      // 将被删清单的任务移到默认清单
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map((t) => (t.list_id === id ? { ...t, list_id: defaultId } : t))
      }))
      if (selectedListId === id) setSelectedListId(null)
      toast.success('清单已删除')
    } else {
      toast.error('删除清单失败')
    }
  }

  async function handleMoveTask(taskId: number, newDate: string) {
    const success = await useTaskStore.getState().moveTask(taskId, newDate)
    if (!success) {
      toast.error('移动任务失败')
    }
  }

  async function handleCreateTag(name: string, color?: string, parentId?: number | null) {
    const newTag = await useTagStore.getState().createTag({ name, color, parent_id: parentId || undefined })
    if (newTag) {
      toast.success('标签已创建')
    } else {
      toast.error('创建标签失败')
    }
  }

  async function handleDeleteTag(id: number) {
    const success = await useTagStore.getState().deleteTag(id)
    if (success) {
      // 从所有任务中移除该标签
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map((t) => ({
          ...t,
          tag_ids: t.tag_ids?.filter(tid => tid !== id)
        }))
      }))
      if (selectedTagId === id) setSelectedTagId(null)
      toast.success('标签已删除')
    } else {
      toast.error('删除标签失败')
    }
  }

  async function handleAddTagToTask(taskId: number, tagId: number) {
    const success = await useTagStore.getState().addTagToTask(taskId, tagId)
    if (success) {
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, tag_ids: [...(t.tag_ids || []), tagId] } : t
        )
      }))
    } else {
      toast.error('添加标签失败')
    }
  }

  async function handleRemoveTagFromTask(taskId: number, tagId: number) {
    const success = await useTagStore.getState().removeTagFromTask(taskId, tagId)
    if (success) {
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, tag_ids: t.tag_ids?.filter(tid => tid !== tagId) } : t
        )
      }))
    } else {
      toast.error('移除标签失败')
    }
  }

  async function handleCreateSubtask(parentId: number, title: string) {
    if (!title.trim()) return
    const parentTask = tasks.find(t => t.id === parentId)
    const listId = parentTask?.list_id ?? (lists.length > 0 ? lists[0].id : 1)
    const newTask = await useTaskStore.getState().createTask({
      title: title.trim(),
      list_id: listId,
      parent_id: parentId,
    })
    if (newTask) {
      // 手动更新父任务的 subtasks 字段，使详情页立即显示新子任务
      useTaskStore.setState((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === parentId
            ? { ...t, subtasks: [...(t.subtasks || []), newTask] }
            : t
        ),
      }))
      setSubtaskInput(parentId, '')
      // 自动展开父任务
      const uiState = useUIStore.getState()
      if (!uiState.expandedTasks.has(parentId)) {
        uiState.toggleTaskExpand(parentId)
      }
    } else {
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
    useTaskStore.setState((state) => ({
      tasks: state.tasks.map(t => sortOrderMap.has(t.id) ? { ...t, sort_order: sortOrderMap.get(t.id)! } : t)
    }))

    const success = await useTaskStore.getState().reorderTasks(reorderItems)
    if (!success) {
      toast.error('排序失败')
    }
  }

  async function handleCreateTaskOnDate(date: string, title?: string) {
    const listId = selectedListId ?? (lists.length > 0 ? lists[0].id : 1)
    const newTask = await useTaskStore.getState().createTask({
      title: title || '新任务',
      list_id: listId,
      due_date: date,
    })
    if (newTask) {
      setSelectedTaskId(newTask.id)
      toast.success('任务已创建')
    } else {
      toast.error('创建任务失败')
    }
  }

  async function handleCreateTaskOnRange(data: { dateKey: string; title: string; notes?: string; priority: number; listId: number; startHour: number; startMin: number; endHour: number; endMin: number }) {
    try {
      const [year, month, day] = data.dateKey.split('-').map(Number)
      const dueDate = new Date(year, month - 1, day, data.startHour, data.startMin)
      const endDate = new Date(year, month - 1, day, data.endHour, data.endMin)
      const reminder = new Date(year, month - 1, day, data.startHour, data.startMin)
      const newTask = await useTaskStore.getState().createTask({
        title: data.title,
        notes: data.notes,
        priority: data.priority,
        list_id: data.listId,
        due_date: dueDate.toISOString(),
        end_date: endDate.toISOString(),
        reminder: reminder.toISOString(),
      })
      if (newTask) {
        setSelectedTaskId(newTask.id)
        toast.success('任务已创建')
      } else {
        toast.error('创建任务失败')
      }
    } catch (error) {
      console.error('Failed to create task:', error)
      toast.error('创建任务失败')
    }
  }

  // ============ 批量操作 ============
  function selectAllTasks() {
    selectAllTasksAction(incompleteTaskTree.map(t => t.id))
  }

  async function handleBatchComplete() {
    const ids = Array.from(selectedTaskIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map(id => api.updateTask(id, { completed: true })))
      await useTaskStore.getState().loadTasks()
      toast.success(`已完成 ${ids.length} 个任务`)
      clearSelection()
    } catch (error) {
      console.error('Batch complete failed:', error)
      toast.error('批量完成失败')
      await useTaskStore.getState().loadTasks()
    }
  }

  async function handleBatchDelete() {
    const ids = Array.from(selectedTaskIds)
    if (ids.length === 0) return
    if (!confirm(`确定批量删除 ${ids.length} 个任务吗？`)) return
    try {
      await Promise.all(ids.map(id => api.deleteTask(id)))
      await useTaskStore.getState().loadTasks()
      toast.success(`已删除 ${ids.length} 个任务`)
      clearSelection()
    } catch (error) {
      console.error('Batch delete failed:', error)
      toast.error('批量删除失败')
      await useTaskStore.getState().loadTasks()
    }
  }

  async function handleBatchPriority(priority: number) {
    const ids = Array.from(selectedTaskIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map(id => api.updateTask(id, { priority })))
      await useTaskStore.getState().loadTasks()
      toast.success(`已设置 ${ids.length} 个任务的优先级`)
      clearSelection()
    } catch (error) {
      console.error('Batch priority failed:', error)
      toast.error('批量设置优先级失败')
      await useTaskStore.getState().loadTasks()
    }
  }

  async function handleBatchMoveList(listId: number) {
    const ids = Array.from(selectedTaskIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map(id => api.updateTask(id, { list_id: listId })))
      await useTaskStore.getState().loadTasks()
      toast.success(`已移动 ${ids.length} 个任务`)
      clearSelection()
    } catch (error) {
      console.error('Batch move failed:', error)
      toast.error('批量移动失败')
      await useTaskStore.getState().loadTasks()
    }
  }

  async function handleBatchArchive() {
    const ids = Array.from(selectedTaskIds)
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map(id => api.updateTask(id, { archived: true })))
      await useTaskStore.getState().loadTasks()
      toast.success(`已归档 ${ids.length} 个任务`)
      clearSelection()
    } catch (error) {
      console.error('Batch archive failed:', error)
      toast.error('批量归档失败')
      await useTaskStore.getState().loadTasks()
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
    const success = await useTaskStore.getState().updateTask(id, { archived: true })
    if (success) {
      toast.success('任务已归档')
      if (selectedTaskId === id) setSelectedTaskId(null)
    } else {
      toast.error('归档失败')
    }
  }

  async function handleUnarchiveTask(id: number) {
    const success = await useTaskStore.getState().updateTask(id, { archived: false })
    if (success) {
      toast.success('任务已恢复')
    } else {
      toast.error('恢复失败')
    }
  }

  // ============ 右键菜单快捷操作 ============
  async function handleSetDate(taskId: number, date: string | null) {
    // 使用空字符串代替 null/undefined，确保 Tauri 序列化后 Rust 端能收到 Some("") 从而更新字段
    const success = await useTaskStore.getState().updateTask(taskId, { due_date: date ?? '' })
    if (!success) {
      toast.error('设置日期失败')
    }
  }

  async function handleSetPriority(taskId: number, priority: number) {
    const success = await useTaskStore.getState().updateTask(taskId, { priority })
    if (!success) {
      toast.error('设置优先级失败')
    }
  }

  async function handleTogglePin(taskId: number) {
    const success = await useTaskStore.getState().togglePin(taskId)
    if (!success) {
      toast.error('置顶操作失败')
    }
  }

  async function handleToggleTag(taskId: number, tagId: number) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    if (task.tag_ids?.includes(tagId)) {
      await handleRemoveTagFromTask(taskId, tagId)
    } else {
      await handleAddTagToTask(taskId, tagId)
    }
  }

  async function handleDuplicateTask(taskId: number) {
    const newTask = await useTaskStore.getState().duplicateTask(taskId)
    if (newTask) {
      toast.success('已创建副本')
    } else {
      toast.error('创建副本失败')
    }
  }

  async function handleCreateNewTagFromMenu(name: string) {
    const colors = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899']
    const color = colors[Math.floor(Math.random() * colors.length)]
    await handleCreateTag(name, color)
  }

  // ============ 拖拽到日历（设置截止日期）============
  async function handleDropToCalendarDate(taskId: number, dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number)
    const dueDate = new Date(year, month - 1, day, 9, 0)
    const success = await useTaskStore.getState().updateTask(taskId, { due_date: dueDate.toISOString() })
    if (success) {
      toast.success(`已设置截止日期为 ${month}月${day}日`)
    } else {
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
        onSelectList={(id) => setSelectedListId(id)}
        onSelectTag={(id) => setSelectedTagId(id)}
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
              onUpdateTask={handleUpdateTask}
            />
          </div>
          {selectedTask && (
            <TaskDetail
              task={selectedTask}
              tags={tags}
              lists={lists}
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
        <AIAssistant tasks={tasks} onClose={() => setCurrentView('tasks')} onTasksChange={() => useTaskStore.getState().loadTasks()} />
      ) : currentView === 'quadrant' ? (
        <main className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <QuadrantView
              tasks={tasks.filter(t => !t.archived)}
              onTaskClick={(id) => setSelectedTaskId(id)}
              onToggleTask={(id) => handleToggleTask(tasks.find(t => t.id === id)!)}
              onUpdateTaskPriority={(id, priority) => handleUpdateTask(id, { priority })}
            />
          </div>
          {selectedTask && (
            <TaskDetail
              task={selectedTask}
              tags={tags}
              lists={lists}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
              onClose={() => setSelectedTaskId(null)}
              onAddTag={handleAddTagToTask}
              onRemoveTag={handleRemoveTagFromTask}
              onCreateSubtask={handleCreateSubtask}
            />
          )}
        </main>
      ) : currentView === 'pomodoro' ? (
        <PomodoroView
          tasks={tasks.filter(t => !t.completed && !t.archived)}
          onTaskClick={(id) => setSelectedTaskId(id)}
          onToggleTask={(id) => handleToggleTask(tasks.find(t => t.id === id)!)}
        />
      ) : currentView === 'habit' ? (
        <HabitView />
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
                    onClick={() => toggleBatchMode()}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
                      batchMode
                        ? 'bg-[#378ADD] text-white border-[#378ADD]'
                        : 'text-gray-600 border-gray-200 hover:bg-gray-50/60'
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
                  onClick={() => toggleFilters()}
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
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#378ADD] rounded-full" />
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
                  onChange={(e) => filters.setFilter('priority', e.target.value === '' ? null : Number(e.target.value))}
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
                  onChange={(e) => filters.setFilter('dateRange', e.target.value as FilterState['dateRange'])}
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
                  onChange={(e) => filters.setFilter('tagId', e.target.value === '' ? null : Number(e.target.value))}
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
                  onChange={(e) => filters.setFilter('listId', e.target.value === '' ? null : Number(e.target.value))}
                  className="px-2 py-1 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">全部清单</option>
                  {lists.map(list => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
                {hasActiveFilters && (
                  <button
                    onClick={() => filters.resetFilters()}
                    className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md"
                  >
                    清除筛选
                  </button>
                )}
              </div>
            )}

            {/* 批量操作工具栏 */}
            {batchMode && (
              <div className="mt-3 p-2 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-700">
                  已选 {selectedTaskIds.size} 项
                </span>
                <div className="h-4 w-px bg-gray-200 mx-1" />
                <button onClick={selectAllTasks} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">全选</button>
                <button onClick={clearSelection} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">取消</button>
                <div className="h-4 w-px bg-gray-200 mx-1" />
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
                  className="px-2 py-1 text-xs border border-gray-200 rounded bg-white disabled:opacity-40"
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
                  className="px-2 py-1 text-xs border border-gray-200 rounded bg-white disabled:opacity-40"
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
                    placeholder={aiMode ? '试试输入：明天下午3点开会，优先级高' : '添加新任务... (试试：明天下午3点开会)'}
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
                  {/* 智能日期识别预览 */}
                  {!aiMode && newTaskTitle.trim() && (() => {
                    const preview = parseSmartDate(newTaskTitle.trim())
                    const hasParsed = preview.dueDate || (preview.priority !== undefined && preview.priority > 0) || preview.repeatRule
                    if (!hasParsed) return null
                    return (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-xs text-blue-700 flex items-center gap-3 z-10 shadow-sm">
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          智能识别
                        </span>
                        {preview.dueDate && (
                          <span className="flex items-center gap-0.5">
                            📅 {new Date(preview.dueDate).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {preview.priority !== undefined && preview.priority > 0 && (
                          <span>🔥 {preview.priority === 1 ? '高优先级' : preview.priority === 2 ? '中优先级' : '低优先级'}</span>
                        )}
                        {preview.repeatRule && (
                          <span>🔁 重复</span>
                        )}
                      </div>
                    )
                  })()}
                </div>
                <button
                  onClick={handleCreateTask}
                  disabled={aiParsing}
                  className={`px-6 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                    aiMode ? 'bg-purple-500 hover:bg-purple-600' : 'bg-[#378ADD] hover:bg-[#185FA5]'
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
                <EmptyState
                  icon={<svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>}
                  title="暂无归档任务"
                  subtitle="完成的任务超过 7 天后会自动归档"
                />
              ) : (
                <ul className="space-y-1">
                  {taskTree.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      tags={tags}
                      lists={lists}
                      isSelected={selectedTaskId === task.id}
                      isExpanded={expandedTasks.has(task.id)}
                      onToggleExpand={() => toggleTaskExpand(task.id)}
                      subtaskInput={subtaskInputs[task.id] || ''}
                      onSubtaskInputChange={(val) => setSubtaskInput(task.id, val)}
                      onCreateSubtask={(title) => handleCreateSubtask(task.id, title)}
                      onToggle={() => handleToggleTask(task)}
                      onToggleSubtask={(subtaskId, completed) => handleUpdateTask(subtaskId, { completed })}
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
                            lists={lists}
                            isSelected={selectedTaskId === task.id}
                            isExpanded={expandedTasks.has(task.id)}
                            onToggleExpand={() => toggleTaskExpand(task.id)}
                            subtaskInput={subtaskInputs[task.id] || ''}
                            onSubtaskInputChange={(val) => setSubtaskInput(task.id, val)}
                            onCreateSubtask={(title) => handleCreateSubtask(task.id, title)}
                            onToggle={() => handleToggleTask(task)}
                            onToggleSubtask={(subtaskId, completed) => handleUpdateTask(subtaskId, { completed })}
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
                            onSetDate={handleSetDate}
                            onSetPriority={handleSetPriority}
                            onTogglePin={handleTogglePin}
                            onToggleTag={handleToggleTag}
                            onDuplicate={handleDuplicateTask}
                            onCreateNewTag={handleCreateNewTagFromMenu}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {filteredTasks.length === 0 && overdueTaskTree.length === 0 ? (
                  <EmptyState
                    icon={<svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
                    title={hasActiveFilters ? '没有符合筛选条件的任务' : '暂无任务，开始添加你的第一个任务吧！'}
                  />
                ) : (
                  <>
                    <ul className="space-y-1">
                      {incompleteTaskTree.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          tags={tags}
                          lists={lists}
                          isSelected={selectedTaskId === task.id}
                          isExpanded={expandedTasks.has(task.id)}
                          onToggleExpand={() => toggleTaskExpand(task.id)}
                          subtaskInput={subtaskInputs[task.id] || ''}
                          onSubtaskInputChange={(val) => setSubtaskInput(task.id, val)}
                          onCreateSubtask={(title) => handleCreateSubtask(task.id, title)}
                          onToggle={() => handleToggleTask(task)}
                          onToggleSubtask={(subtaskId, completed) => handleUpdateTask(subtaskId, { completed })}
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
                          onSetDate={handleSetDate}
                          onSetPriority={handleSetPriority}
                          onTogglePin={handleTogglePin}
                          onToggleTag={handleToggleTag}
                          onDuplicate={handleDuplicateTask}
                          onCreateNewTag={handleCreateNewTagFromMenu}
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
                                lists={lists}
                                isSelected={selectedTaskId === task.id}
                                isExpanded={expandedTasks.has(task.id)}
                                onToggleExpand={() => toggleTaskExpand(task.id)}
                                subtaskInput={subtaskInputs[task.id] || ''}
                                onSubtaskInputChange={(val) => setSubtaskInput(task.id, val)}
                                onCreateSubtask={(title) => handleCreateSubtask(task.id, title)}
                                onToggle={() => handleToggleTask(task)}
                                onToggleSubtask={(subtaskId, completed) => handleUpdateTask(subtaskId, { completed })}
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
                                onSetDate={handleSetDate}
                                onSetPriority={handleSetPriority}
                                onTogglePin={handleTogglePin}
                                onToggleTag={handleToggleTag}
                                onDuplicate={handleDuplicateTask}
                                onCreateNewTag={handleCreateNewTagFromMenu}
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

      {currentView !== 'calendar' && currentView !== 'settings' && currentView !== 'quadrant' && currentView !== 'pomodoro' && currentView !== 'habit' && selectedTask && (
        <TaskDetail
          task={selectedTask}
          tags={tags}
          lists={lists}
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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7 7-7-7" /></svg>
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
                  ? 'bg-[#378ADD] text-white'
                  : isToday
                  ? 'bg-blue-50/60 text-[#378ADD]'
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
