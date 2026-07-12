import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Task } from '../types'
import type { ViewType } from '../components/sidebar/types'
import { useTaskStore } from '../stores/taskStore'
import { useUIStore } from '../stores/uiStore'

/**
 * 关闭命令面板时的焦点策略：
 * - restore：恢复打开前焦点（Esc / 遮罩 / 普通导航 / 再次 Ctrl+K）
 * - target：关闭后聚焦指定元素（新建任务 / 聚焦搜索）
 * - none：不恢复、不抢占（快捷键帮助等由下游组件接管）
 */
export type CloseFocusPolicy =
  | { mode: 'restore' }
  | { mode: 'target'; element: HTMLElement | null | (() => HTMLElement | null) }
  | { mode: 'none' }

export interface ClosePaletteOptions {
  focus?: CloseFocusPolicy
}

function resolveFocusTarget(target: HTMLElement | null | (() => HTMLElement | null)): HTMLElement | null {
  const el = typeof target === 'function' ? target() : target
  if (!el) return null
  if (!document.contains(el)) return null
  if (typeof el.focus !== 'function') return null
  return el
}

/** 安全聚焦；元素不在文档中时返回 false */
export function safeFocus(target: HTMLElement | null | (() => HTMLElement | null)): boolean {
  const el = resolveFocusTarget(target)
  if (!el) return false
  el.focus()
  return document.activeElement === el
}

/** 命令面板固定命令 ID */
export type CommandId =
  | 'view-tasks'
  | 'view-today'
  | 'view-calendar'
  | 'view-stats'
  | 'view-ai'
  | 'view-quadrant'
  | 'view-pomodoro'
  | 'view-habit'
  | 'view-template'
  | 'view-goals'
  | 'view-settings'
  | 'action-new-task'
  | 'action-focus-search'
  | 'action-shortcuts-help'

export type CommandResultKind = 'command' | 'task'

export interface CommandDefinition {
  id: CommandId
  title: string
  /** 辅助匹配词（中英文别名等） */
  keywords: string[]
  /** 结果列表副标题 */
  subtitle?: string
  /** 导航类命令对应的真实 view ID */
  view?: ViewType
}

export interface CommandPaletteItem {
  kind: CommandResultKind
  id: string
  title: string
  subtitle?: string
  commandId?: CommandId
  taskId?: number
}

/** 固定命令定义：标题与真实 view ID 一一对应，集中管理避免组件内重复 */
export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  { id: 'view-tasks', title: '全部任务', keywords: ['tasks', 'all', '全部'], view: 'tasks', subtitle: '视图' },
  { id: 'view-today', title: '今日任务', keywords: ['today', '今天', '今日'], view: 'today', subtitle: '视图' },
  { id: 'view-calendar', title: '日历', keywords: ['calendar', '日程'], view: 'calendar', subtitle: '视图' },
  { id: 'view-stats', title: '统计', keywords: ['stats', 'statistics', '数据'], view: 'stats', subtitle: '视图' },
  { id: 'view-ai', title: 'AI 助手', keywords: ['ai', '助手', '智能'], view: 'ai', subtitle: '视图' },
  {
    id: 'view-quadrant',
    title: '四象限',
    keywords: ['quadrant', '优先级', '艾森豪威尔'],
    view: 'quadrant',
    subtitle: '视图',
  },
  { id: 'view-pomodoro', title: '番茄钟', keywords: ['pomodoro', '番茄', '专注'], view: 'pomodoro', subtitle: '视图' },
  { id: 'view-habit', title: '习惯', keywords: ['habit', '打卡'], view: 'habit', subtitle: '视图' },
  { id: 'view-template', title: '模板', keywords: ['template', '模板库'], view: 'template', subtitle: '视图' },
  {
    id: 'view-goals',
    title: '目标 / OKR',
    keywords: ['goals', 'goal', 'okr', '目标', '关键结果'],
    view: 'goals',
    subtitle: '视图',
  },
  { id: 'view-settings', title: '设置', keywords: ['settings', '偏好', '配置'], view: 'settings', subtitle: '视图' },
  {
    id: 'action-new-task',
    title: '新建任务',
    keywords: ['new', 'create', '新建', '创建任务'],
    subtitle: '操作',
  },
  {
    id: 'action-focus-search',
    title: '聚焦搜索',
    keywords: ['search', 'find', '搜索', '查找'],
    subtitle: '操作',
  },
  {
    id: 'action-shortcuts-help',
    title: '打开快捷键帮助',
    keywords: ['shortcut', 'help', '快捷键', '帮助', '?'],
    subtitle: '操作',
  },
]

const TASK_RESULT_LIMIT = 10

function matchesCommand(def: CommandDefinition, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (def.title.toLowerCase().includes(q)) return true
  return def.keywords.some((kw) => kw.toLowerCase().includes(q) || q.includes(kw.toLowerCase()))
}

/**
 * 按标题关键词搜索任务。
 * 过滤规则与列表搜索口径一致：排除归档任务；忽略大小写；中文包含匹配。
 * 空查询不返回任务，避免无意义全量列表。
 */
export function searchTasksForCommandPalette(tasks: Task[], query: string, limit = TASK_RESULT_LIMIT): Task[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const matched: Task[] = []
  for (const task of tasks) {
    if (task.archived) continue
    if (!task.title.toLowerCase().includes(q)) continue
    matched.push(task)
    if (matched.length >= limit) break
  }
  return matched
}

/** 根据查询生成统一结果列表：固定命令 + 最多 10 条任务 */
export function buildCommandPaletteItems(query: string, tasks: Task[]): CommandPaletteItem[] {
  const commandItems: CommandPaletteItem[] = COMMAND_DEFINITIONS.filter((def) => matchesCommand(def, query)).map(
    (def) => ({
      kind: 'command' as const,
      id: `command:${def.id}`,
      title: def.title,
      subtitle: def.subtitle,
      commandId: def.id,
    }),
  )

  const taskItems: CommandPaletteItem[] = searchTasksForCommandPalette(tasks, query).map((task) => ({
    kind: 'task' as const,
    id: `task:${task.id}`,
    title: task.title,
    subtitle: task.completed ? '已完成任务' : '任务',
    taskId: task.id,
  }))

  return [...commandItems, ...taskItems]
}

export interface UseCommandPaletteOptions {
  newTaskInputRef: RefObject<HTMLInputElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
}

/**
 * 命令面板状态与执行逻辑（集中管理，避免多处复制 view 跳转/匹配）。
 *
 * 焦点策略集中在 closePalette：执行命令时传入 focus 策略，组件层按策略恢复/跳过，
 * 避免「关闭恢复」与「动作聚焦」两个 setTimeout 竞争。
 */
export function useCommandPalette({ newTaskInputRef, searchInputRef }: UseCommandPaletteOptions) {
  const open = useUIStore((s) => s.commandPaletteOpen)
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const tasks = useTaskStore((s) => s.tasks)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  /** 最近一次关闭时的焦点策略，供 CommandPalette 消费后清空 */
  const pendingFocusPolicyRef = useRef<CloseFocusPolicy>({ mode: 'restore' })

  // 无论从快捷键还是 API 打开，都重置查询与高亮，避免残留上次输入
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      // 打开时默认下次关闭恢复原焦点
      pendingFocusPolicyRef.current = { mode: 'restore' }
    }
  }, [open])

  const items = useMemo(() => buildCommandPaletteItems(query, tasks), [query, tasks])

  const openPalette = useCallback(() => {
    setQuery('')
    setActiveIndex(0)
    pendingFocusPolicyRef.current = { mode: 'restore' }
    setOpen(true)
  }, [setOpen])

  /**
   * 关闭命令面板。
   * @param options.focus 关闭后的焦点策略；默认 restore。
   */
  const closePalette = useCallback(
    (options?: ClosePaletteOptions) => {
      pendingFocusPolicyRef.current = options?.focus ?? { mode: 'restore' }
      setOpen(false)
      setQuery('')
      setActiveIndex(0)
    },
    [setOpen],
  )

  /** 读取并清空待处理焦点策略（由 CommandPalette 在 unmount/关闭时调用一次） */
  const consumeFocusPolicy = useCallback((): CloseFocusPolicy => {
    const policy = pendingFocusPolicyRef.current
    pendingFocusPolicyRef.current = { mode: 'restore' }
    return policy
  }, [])

  const togglePalette = useCallback(() => {
    if (useUIStore.getState().commandPaletteOpen) {
      // 再次 Ctrl+K 关闭：恢复原焦点
      closePalette({ focus: { mode: 'restore' } })
    } else {
      openPalette()
    }
  }, [closePalette, openPalette])

  /** 导航到指定视图，并清理清单/标签选择（与侧边栏「全部任务」行为一致） */
  const navigateToView = useCallback((view: ViewType) => {
    const { setCurrentView, setSelectedListId, setSelectedTagId } = useUIStore.getState()
    setCurrentView(view)
    if (view === 'tasks' || view === 'today') {
      setSelectedListId(null)
      setSelectedTagId(null)
    }
  }, [])

  /** 确保任务列表面板挂载（新建/搜索输入框只在列表类视图存在） */
  const ensureTaskListView = useCallback(() => {
    const { currentView, setCurrentView, setSelectedListId, setSelectedTagId } = useUIStore.getState()
    if (currentView !== 'tasks' && currentView !== 'today' && currentView !== 'archived') {
      setCurrentView('tasks')
      setSelectedListId(null)
      setSelectedTagId(null)
    }
  }, [])

  const executeCommand = useCallback(
    (commandId: CommandId) => {
      const def = COMMAND_DEFINITIONS.find((c) => c.id === commandId)
      if (!def) return

      const { setShortcutsHelpOpen } = useUIStore.getState()

      switch (commandId) {
        case 'view-tasks':
        case 'view-today':
        case 'view-calendar':
        case 'view-stats':
        case 'view-ai':
        case 'view-quadrant':
        case 'view-pomodoro':
        case 'view-habit':
        case 'view-template':
        case 'view-goals':
        case 'view-settings':
          if (def.view) navigateToView(def.view)
          // 普通视图跳转：恢复打开前焦点
          closePalette({ focus: { mode: 'restore' } })
          break
        case 'action-new-task':
          ensureTaskListView()
          // 关闭后聚焦新建任务输入框；使用 getter，等视图挂载后再解析 ref
          closePalette({
            focus: {
              mode: 'target',
              element: () => newTaskInputRef.current,
            },
          })
          break
        case 'action-focus-search':
          ensureTaskListView()
          closePalette({
            focus: {
              mode: 'target',
              element: () => searchInputRef.current,
            },
          })
          break
        case 'action-shortcuts-help':
          setShortcutsHelpOpen(true)
          // 帮助弹层接管焦点，禁止恢复被遮挡的旧元素
          closePalette({ focus: { mode: 'none' } })
          break
      }
    },
    [closePalette, ensureTaskListView, navigateToView, newTaskInputRef, searchInputRef],
  )

  const selectTask = useCallback(
    (taskId: number) => {
      const { setSelectedTaskId, setCurrentView, setSelectedListId, setSelectedTagId, currentView } =
        useUIStore.getState()

      // 详情面板在 tasks/today/archived 显示；其它视图先回到全部任务以保证可见
      if (
        currentView !== 'tasks' &&
        currentView !== 'today' &&
        currentView !== 'archived' &&
        currentView !== 'calendar' &&
        currentView !== 'quadrant'
      ) {
        setCurrentView('tasks')
        setSelectedListId(null)
        setSelectedTagId(null)
      }

      setSelectedTaskId(taskId)
      // 选任务后恢复打开前焦点（详情已打开，不强制抢输入框）
      closePalette({ focus: { mode: 'restore' } })
    },
    [closePalette],
  )

  const executeItem = useCallback(
    (item: CommandPaletteItem) => {
      if (item.kind === 'command' && item.commandId) {
        executeCommand(item.commandId)
        return
      }
      if (item.kind === 'task' && item.taskId != null) {
        selectTask(item.taskId)
      }
    },
    [executeCommand, selectTask],
  )

  const executeActive = useCallback(() => {
    const item = items[activeIndex]
    if (item) executeItem(item)
  }, [activeIndex, executeItem, items])

  const moveActive = useCallback(
    (delta: number) => {
      if (items.length === 0) return
      setActiveIndex((prev) => {
        const next = (prev + delta + items.length) % items.length
        return next
      })
    },
    [items.length],
  )

  const updateQuery = useCallback((value: string) => {
    setQuery(value)
    setActiveIndex(0)
  }, [])

  return {
    open,
    query,
    items,
    activeIndex,
    setActiveIndex,
    openPalette,
    closePalette,
    consumeFocusPolicy,
    togglePalette,
    updateQuery,
    executeItem,
    executeActive,
    moveActive,
    executeCommand,
    selectTask,
  }
}
