import { useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useFilterStore } from '../stores/filterStore'
import type { Task } from '../types'
import type { TaskActions } from './useTaskActions'

/**
 * 任务列表区的状态聚合 hook
 *
 * 将原本散落在 App.tsx 里的“列表状态”集中于此，供 TaskListPanel 消费：
 *   - 本地输入状态：newTaskTitle
 *   - 搜索：searchQuery
 *   - 批量选择：batchMode / selectedTaskIds / toggle / selectAll / clear
 *   - 组合筛选：showFilters / filters（含 setFilter / resetFilters）
 *   - 列表交互所需 UI 状态：AI 模式、折叠、子任务输入、显示控制、拖拽迷你日历、选中任务等
 *   - 派生操作：handleCreateTask / selectAllTasks
 *
 * 设计原则（遵循重构约束）：
 *   1. 所有 store selector 均在本 hook 内部调用（“子组件内部各自调用 store selector，
 *      不从 App 传递”）。App 不再持有这些列表专属状态。
 *   2. createTaskAction 与 incompleteTaskTree 分别来自 useTaskActions / useTaskFiltering，
 *      这两者仍在 App 层聚合，因此由调用方（TaskListPanel）作为参数传入。
 *   3. hasActiveFilters 不在此处重算——它由 useTaskFiltering 计算并作为唯一真值源透传，
 *      避免显示与实际筛选不一致。本 hook 仅暴露 filters 对象（供筛选下拉框读写）。
 *   4. 不改变任何 store 的结构、不改变 action 的行为，仅做“状态读取点的搬迁”。
 */
export function useTaskListState(createTaskAction: TaskActions['handleCreateTask'], incompleteTaskTree: Task[]) {
  // ===== 本地输入状态 =====
  const [newTaskTitle, setNewTaskTitle] = useState('')

  // ===== 搜索 =====
  const searchQuery = useUIStore((s) => s.searchQuery)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)

  // ===== 批量选择 =====
  const batchMode = useUIStore((s) => s.batchMode)
  const selectedTaskIds = useUIStore((s) => s.selectedTaskIds)
  const toggleBatchMode = useUIStore((s) => s.toggleBatchMode)
  const toggleTaskSelection = useUIStore((s) => s.toggleTaskSelection)
  const selectAllTasksAction = useUIStore((s) => s.selectAllTasks)
  const clearSelection = useUIStore((s) => s.clearSelection)

  // ===== 组合筛选 =====
  const showFilters = useUIStore((s) => s.showFilters)
  const toggleFilters = useUIStore((s) => s.toggleFilters)
  const filters = useFilterStore()

  // ===== AI 自然语言输入 =====
  const aiMode = useUIStore((s) => s.aiMode)
  const aiParsing = useUIStore((s) => s.aiParsing)
  const setAiMode = useUIStore((s) => s.setAiMode)

  // ===== 折叠 / 子任务输入 =====
  const expandedTasks = useUIStore((s) => s.expandedTasks)
  const subtaskInputs = useUIStore((s) => s.subtaskInputs)
  const toggleTaskExpand = useUIStore((s) => s.toggleTaskExpand)
  const setSubtaskInput = useUIStore((s) => s.setSubtaskInput)

  // ===== 显示控制 =====
  const showCompleted = useUIStore((s) => s.showCompleted)
  const showOverdue = useUIStore((s) => s.showOverdue)
  const setShowCompleted = useUIStore((s) => s.setShowCompleted)
  const setShowOverdue = useUIStore((s) => s.setShowOverdue)

  // ===== 选中任务 =====
  const selectedTaskId = useUIStore((s) => s.selectedTaskId)
  const setSelectedTaskId = useUIStore((s) => s.setSelectedTaskId)

  // ===== 视图 / 清单 =====
  const currentView = useUIStore((s) => s.currentView)
  const selectedListId = useUIStore((s) => s.selectedListId)

  // ===== 拖拽迷你日历 =====
  const isDraggingTask = useUIStore((s) => s.isDraggingTask)
  const miniCalendarDate = useUIStore((s) => s.miniCalendarDate)
  const dragOverCalendarDate = useUIStore((s) => s.dragOverCalendarDate)
  const setMiniCalendarDate = useUIStore((s) => s.setMiniCalendarDate)
  const setDragOverCalendarDate = useUIStore((s) => s.setDragOverCalendarDate)

  // ===== 派生操作（与原 App.tsx 中的 handleCreateTask / selectAllTasks 行为完全一致）=====
  async function handleCreateTask() {
    if (!newTaskTitle.trim()) return
    await createTaskAction(newTaskTitle, selectedListId, aiMode)
    setNewTaskTitle('')
  }

  function selectAllTasks() {
    selectAllTasksAction(incompleteTaskTree.map((t) => t.id))
  }

  return {
    // 输入
    newTaskTitle,
    setNewTaskTitle,
    // 搜索
    searchQuery,
    setSearchQuery,
    // 批量
    batchMode,
    selectedTaskIds,
    toggleBatchMode,
    toggleTaskSelection,
    clearSelection,
    // 筛选
    showFilters,
    toggleFilters,
    filters,
    // AI
    aiMode,
    aiParsing,
    setAiMode,
    // 折叠 / 子任务
    expandedTasks,
    subtaskInputs,
    toggleTaskExpand,
    setSubtaskInput,
    // 显示控制
    showCompleted,
    showOverdue,
    setShowCompleted,
    setShowOverdue,
    // 选中任务
    selectedTaskId,
    setSelectedTaskId,
    // 视图 / 清单
    currentView,
    selectedListId,
    // 拖拽迷你日历
    isDraggingTask,
    miniCalendarDate,
    dragOverCalendarDate,
    setMiniCalendarDate,
    setDragOverCalendarDate,
    // 派生操作
    handleCreateTask,
    selectAllTasks,
  }
}
