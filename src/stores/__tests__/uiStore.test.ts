import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../uiStore'

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
  batchMode: false,
  selectedTaskIds: new Set<number>(),
  isDraggingTask: false,
  dragOverCalendarDate: null as string | null,
  miniCalendarDate: new Date(2026, 0, 1),
  searchQuery: '',
  shortcutsHelpOpen: false,
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
