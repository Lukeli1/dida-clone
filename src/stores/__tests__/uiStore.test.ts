import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useUIStore } from '../uiStore'
import {
  LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY,
  SIDEBAR_VISIBLE_ITEMS_KEY,
  TOGGLEABLE_SIDEBAR_ITEMS,
  createDefaultSidebarVisibility,
  loadSidebarVisibility,
  parseSidebarVisibility,
} from '../../utils/sidebarVisibility'

// 重置用的初始状态数据字段（保留 actions 做浅合并）。
// 注意 Set / Date 需创建新实例，避免跨用例共享引用。
const initialUIState = {
  currentView: 'tasks' as const,
  selectedListId: null as number | null,
  selectedTagId: null as number | null,
  selectedTaskId: null as number | null,
  showCompleted: false,
  showOverdue: true,
  showFilters: false,
  aiMode: false,
  aiParsing: false,
  expandedTasks: new Set<number>(),
  subtaskInputs: {} as Record<number, string>,
  subtaskInputFocusRequest: null as number | null,
  batchMode: false,
  selectedTaskIds: new Set<number>(),
  isDraggingTask: false,
  dragOverCalendarDate: null as string | null,
  miniCalendarDate: new Date(2026, 0, 1),
  searchQuery: '',
  shortcutsHelpOpen: false,
  commandPaletteOpen: false,
  visibleSidebarItems: createDefaultSidebarVisibility(),
}

describe('uiStore', () => {
  beforeEach(() => {
    // 每个 case 前重置 UI 状态为初始值
    useUIStore.setState({
      ...initialUIState,
      expandedTasks: new Set<number>(),
      selectedTaskIds: new Set<number>(),
      miniCalendarDate: new Date(2026, 0, 1),
    })
  })

  // 1. 初始状态
  it('初始状态：默认视图 tasks、显示开关、集合为空', () => {
    const state = useUIStore.getState()
    expect(state.currentView).toBe('tasks')
    expect(state.selectedListId).toBeNull()
    expect(state.selectedTagId).toBeNull()
    expect(state.showCompleted).toBe(false)
    expect(state.showOverdue).toBe(true)
    expect(state.showFilters).toBe(false)
    expect(state.batchMode).toBe(false)
    expect(state.searchQuery).toBe('')
    expect(state.expandedTasks.size).toBe(0)
    expect(state.selectedTaskIds.size).toBe(0)
  })

  // 2. setCurrentView 视图切换
  it('setCurrentView 切换视图', () => {
    useUIStore.getState().setCurrentView('calendar')
    expect(useUIStore.getState().currentView).toBe('calendar')

    useUIStore.getState().setCurrentView('stats')
    expect(useUIStore.getState().currentView).toBe('stats')

    useUIStore.getState().setCurrentView('today')
    expect(useUIStore.getState().currentView).toBe('today')
  })

  // 3. setSelectedListId 同时清空 selectedTagId（互斥逻辑）
  it('setSelectedListId 设置列表并清空 selectedTagId', () => {
    useUIStore.getState().setSelectedTagId(3)
    useUIStore.getState().setSelectedListId(1)

    const state = useUIStore.getState()
    expect(state.selectedListId).toBe(1)
    expect(state.selectedTagId).toBeNull()
  })

  // 4. setSelectedTagId 同时清空 selectedListId（互斥逻辑）
  it('setSelectedTagId 设置标签并清空 selectedListId', () => {
    useUIStore.getState().setSelectedListId(1)
    useUIStore.getState().setSelectedTagId(2)

    const state = useUIStore.getState()
    expect(state.selectedTagId).toBe(2)
    expect(state.selectedListId).toBeNull()
  })

  // 5. toggleTaskExpand 展开/收起
  it('toggleTaskExpand 切换任务的展开状态', () => {
    const store = useUIStore.getState()
    store.toggleTaskExpand(10)
    expect(useUIStore.getState().expandedTasks.has(10)).toBe(true)

    useUIStore.getState().toggleTaskExpand(10)
    expect(useUIStore.getState().expandedTasks.has(10)).toBe(false)
  })

  // 6. toggleTaskSelection 选中/取消选中
  it('toggleTaskSelection 切换任务选中状态', () => {
    useUIStore.getState().toggleTaskSelection(1)
    expect(useUIStore.getState().selectedTaskIds.has(1)).toBe(true)

    useUIStore.getState().toggleTaskSelection(1)
    expect(useUIStore.getState().selectedTaskIds.has(1)).toBe(false)
  })

  // 7. selectAllTasks 批量选中 + clearSelection 清空并关闭批量模式
  it('selectAllTasks 批量选中后 clearSelection 清空并关闭 batchMode', () => {
    useUIStore.getState().selectAllTasks([1, 2, 3])
    expect(useUIStore.getState().selectedTaskIds.size).toBe(3)

    // 进入批量模式
    useUIStore.getState().toggleBatchMode()
    expect(useUIStore.getState().batchMode).toBe(true)

    // 清空选择，应同时关闭 batchMode
    useUIStore.getState().clearSelection()
    expect(useUIStore.getState().selectedTaskIds.size).toBe(0)
    expect(useUIStore.getState().batchMode).toBe(false)
  })

  // 8. toggleBatchMode 切换批量模式并清空已选任务
  it('toggleBatchMode 切换 batchMode 并清空 selectedTaskIds', () => {
    // 先选中一些任务
    useUIStore.getState().selectAllTasks([1, 2])
    expect(useUIStore.getState().batchMode).toBe(false)

    // 开启批量模式应清空选中集合
    useUIStore.getState().toggleBatchMode()
    expect(useUIStore.getState().batchMode).toBe(true)
    expect(useUIStore.getState().selectedTaskIds.size).toBe(0)

    // 再次切换关闭
    useUIStore.getState().toggleBatchMode()
    expect(useUIStore.getState().batchMode).toBe(false)
  })

  // 9. toggleFilters 切换过滤器面板显示
  it('toggleFilters 切换 showFilters', () => {
    expect(useUIStore.getState().showFilters).toBe(false)
    useUIStore.getState().toggleFilters()
    expect(useUIStore.getState().showFilters).toBe(true)
    useUIStore.getState().toggleFilters()
    expect(useUIStore.getState().showFilters).toBe(false)
  })

  // 10. setSubtaskInput 写入子任务输入
  it('setSubtaskInput 设置并更新子任务输入框内容', () => {
    useUIStore.getState().setSubtaskInput(5, 'hello')
    expect(useUIStore.getState().subtaskInputs[5]).toBe('hello')

    useUIStore.getState().setSubtaskInput(5, 'world')
    expect(useUIStore.getState().subtaskInputs[5]).toBe('world')

    // 不同 taskId 互不影响
    useUIStore.getState().setSubtaskInput(6, 'foo')
    expect(useUIStore.getState().subtaskInputs[5]).toBe('world')
    expect(useUIStore.getState().subtaskInputs[6]).toBe('foo')
  })

  it('expandTask 仅展开不折叠', () => {
    useUIStore.getState().expandTask(7)
    expect(useUIStore.getState().expandedTasks.has(7)).toBe(true)
    useUIStore.getState().expandTask(7)
    expect(useUIStore.getState().expandedTasks.has(7)).toBe(true)
  })

  it('openSubtaskInput 展开并写入一次性 focus 请求；consume 后清理', () => {
    useUIStore.getState().openSubtaskInput(9)
    expect(useUIStore.getState().expandedTasks.has(9)).toBe(true)
    expect(useUIStore.getState().subtaskInputFocusRequest).toBe(9)
    // 重复 open 不会折叠
    useUIStore.getState().openSubtaskInput(9)
    expect(useUIStore.getState().expandedTasks.has(9)).toBe(true)
    expect(useUIStore.getState().subtaskInputFocusRequest).toBe(9)
    // 消费其它 id 不清理
    useUIStore.getState().consumeSubtaskInputFocus(1)
    expect(useUIStore.getState().subtaskInputFocusRequest).toBe(9)
    useUIStore.getState().consumeSubtaskInputFocus(9)
    expect(useUIStore.getState().subtaskInputFocusRequest).toBeNull()
  })

  // 11. setSearchQuery 更新搜索词
  it('setSearchQuery 更新搜索关键词', () => {
    useUIStore.getState().setSearchQuery('买菜')
    expect(useUIStore.getState().searchQuery).toBe('买菜')
  })

  // 12. 拖拽相关 setter
  it('setIsDraggingTask / setDragOverCalendarDate 更新拖拽状态', () => {
    useUIStore.getState().setIsDraggingTask(true)
    useUIStore.getState().setDragOverCalendarDate('2026-01-05')

    const state = useUIStore.getState()
    expect(state.isDraggingTask).toBe(true)
    expect(state.dragOverCalendarDate).toBe('2026-01-05')

    useUIStore.getState().setIsDraggingTask(false)
    useUIStore.getState().setDragOverCalendarDate(null)
    expect(useUIStore.getState().isDraggingTask).toBe(false)
    expect(useUIStore.getState().dragOverCalendarDate).toBeNull()
  })

  // 13. AI 模式相关 setter
  it('setAiMode / setAiParsing 更新 AI 状态', () => {
    useUIStore.getState().setAiMode(true)
    expect(useUIStore.getState().aiMode).toBe(true)

    useUIStore.getState().setAiParsing(true)
    expect(useUIStore.getState().aiParsing).toBe(true)
  })

  // 14. 快捷键帮助面板开关
  it('setShortcutsHelpOpen 切换快捷键帮助面板', () => {
    expect(useUIStore.getState().shortcutsHelpOpen).toBe(false)

    useUIStore.getState().setShortcutsHelpOpen(true)
    expect(useUIStore.getState().shortcutsHelpOpen).toBe(true)

    useUIStore.getState().setShortcutsHelpOpen(false)
    expect(useUIStore.getState().shortcutsHelpOpen).toBe(false)
  })
})

describe('uiStore 侧边栏可见性', () => {
  beforeEach(() => {
    localStorage.removeItem(SIDEBAR_VISIBLE_ITEMS_KEY)
    localStorage.removeItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY)
    useUIStore.setState({
      ...initialUIState,
      expandedTasks: new Set<number>(),
      selectedTaskIds: new Set<number>(),
      miniCalendarDate: new Date(2026, 0, 1),
      visibleSidebarItems: createDefaultSidebarVisibility(),
      currentView: 'tasks',
      selectedListId: null,
      selectedTagId: null,
    })
  })

  afterEach(() => {
    localStorage.removeItem(SIDEBAR_VISIBLE_ITEMS_KEY)
    localStorage.removeItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY)
  })

  it('默认配置下所有可选入口可见', () => {
    for (const item of TOGGLEABLE_SIDEBAR_ITEMS) {
      expect(useUIStore.getState().isSidebarItemVisible(item.id)).toBe(true)
    }
    expect(useUIStore.getState().isSidebarItemVisible('tasks')).toBe(true)
    expect(useUIStore.getState().isSidebarItemVisible('today')).toBe(true)
    expect(useUIStore.getState().isSidebarItemVisible('settings')).toBe(true)
  })

  it('设置可选入口隐藏后只写入 namespaced key，不写 legacy', () => {
    localStorage.setItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY, JSON.stringify({ habit: false }))
    useUIStore.getState().setSidebarItemVisible('pomodoro', false)
    expect(useUIStore.getState().visibleSidebarItems.pomodoro).toBe(false)
    expect(useUIStore.getState().isSidebarItemVisible('pomodoro')).toBe(false)

    const namespaced = localStorage.getItem(SIDEBAR_VISIBLE_ITEMS_KEY)
    expect(namespaced).toBeTruthy()
    expect(JSON.parse(namespaced!).pomodoro).toBe(false)

    // legacy 不被 setSidebarItemVisible 重写
    expect(JSON.parse(localStorage.getItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY)!).habit).toBe(false)
    expect(JSON.parse(localStorage.getItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY)!).pomodoro).toBeUndefined()
  })

  it('核心入口 tasks/today/settings 即使尝试隐藏仍为可见', () => {
    useUIStore.getState().setSidebarItemVisible('tasks', false)
    useUIStore.getState().setSidebarItemVisible('today', false)
    useUIStore.getState().setSidebarItemVisible('settings', false)
    expect(useUIStore.getState().isSidebarItemVisible('tasks')).toBe(true)
    expect(useUIStore.getState().isSidebarItemVisible('today')).toBe(true)
    expect(useUIStore.getState().isSidebarItemVisible('settings')).toBe(true)
    expect(useUIStore.getState().visibleSidebarItems.tasks).toBe(true)
  })

  it('storage 损坏或部分配置时安全回退', () => {
    localStorage.setItem(SIDEBAR_VISIBLE_ITEMS_KEY, '{broken')
    const recovered = parseSidebarVisibility(localStorage.getItem(SIDEBAR_VISIBLE_ITEMS_KEY))
    expect(recovered.tasks).toBe(true)
    expect(recovered.pomodoro).toBe(true)

    const partial = parseSidebarVisibility(JSON.stringify({ habit: false }))
    expect(partial.habit).toBe(false)
    expect(partial.calendar).toBe(true)
    expect(partial.tasks).toBe(true)
  })

  it('仅 legacy 配置时 loadSidebarVisibility 同次启动可用', () => {
    localStorage.removeItem(SIDEBAR_VISIBLE_ITEMS_KEY)
    localStorage.setItem(LEGACY_SIDEBAR_VISIBLE_ITEMS_KEY, JSON.stringify({ template: false }))
    const loaded = loadSidebarVisibility()
    expect(loaded.template).toBe(false)
    expect(localStorage.getItem(SIDEBAR_VISIBLE_ITEMS_KEY)).toBeTruthy()
  })

  it('隐藏当前可选视图时 currentView 自动回退到 tasks', () => {
    useUIStore.setState({ currentView: 'pomodoro', selectedListId: 3, selectedTagId: 9 })
    useUIStore.getState().setSidebarItemVisible('pomodoro', false)
    expect(useUIStore.getState().currentView).toBe('tasks')
    expect(useUIStore.getState().selectedListId).toBeNull()
    expect(useUIStore.getState().selectedTagId).toBeNull()
  })

  it('配置持久化读取后完整恢复', () => {
    useUIStore.getState().setSidebarItemVisible('stats', false)
    useUIStore.getState().setSidebarItemVisible('ai', false)
    const raw = localStorage.getItem(SIDEBAR_VISIBLE_ITEMS_KEY)!
    const restored = createDefaultSidebarVisibility()
    Object.assign(restored, JSON.parse(raw))
    useUIStore.setState({ visibleSidebarItems: restored })
    expect(useUIStore.getState().isSidebarItemVisible('stats')).toBe(false)
    expect(useUIStore.getState().isSidebarItemVisible('ai')).toBe(false)
    expect(useUIStore.getState().isSidebarItemVisible('calendar')).toBe(true)
  })
})
