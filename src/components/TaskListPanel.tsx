import { useMemo, type RefObject } from 'react'
import {
  isToday as dateFnsIsToday,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { TaskItem } from './TaskItem'
import { EmptyState } from './EmptyState'
import { TaskActionProvider, type TaskActionContextValue } from '../contexts/TaskActionContext'
import { parseSmartDate } from '../utils/smartDate'
import { useTagStore } from '../stores/tagStore'
import { useListStore } from '../stores/listStore'
import { useUIStore } from '../stores/uiStore'
import type { FilterState } from '../stores/filterStore'
import { useTaskListState } from '../hooks/useTaskListState'
import type { TaskActions } from '../hooks/useTaskActions'
import type { Task } from '../types'

/**
 * 任务列表区（原 App.tsx 中 currentView 的“else”分支：tasks / today / archived 等视图）
 *
 * 包含：
 *   - 顶部 header：标题 + 批量模式切换 + 组合筛选按钮 + 搜索框 + 筛选面板 + 批量操作工具栏
 *   - 拖拽任务时浮动的迷你日历投放区（MiniCalendarDropzone）
 *   - 新建任务输入栏（含 AI 模式 + 智能日期预览）
 *   - TaskActionProvider 包裹的任务列表（归档 / 已过期 / 未完成 / 已完成）
 *
 * 状态来源：
 *   - 列表状态（newTaskTitle / 搜索 / 批量 / 筛选 / 折叠 / 拖拽迷你日历 等）→ useTaskListState
 *   - tags / lists / selectedTagId → 组件内部直接调用 store
 *   - actions / 过滤后的任务树（filteredTasks / taskTree / ...）/ hasActiveFilters → 由 App 透传
 *   - newTaskInputRef / searchInputRef → 由 App 创建并透传（App 仍持有 useKeyboardShortcuts，
 *     它需要这两个 ref 以实现 Ctrl+N / Ctrl+F；ref 在多区域共享，按“保守策略”保留在 App）
 *
 * TaskActionContext 的结构、TaskItem 获取 action 的方式均未改变，仅是把 JSX 块搬迁至此。
 */
interface TaskListPanelProps {
  newTaskInputRef: RefObject<HTMLInputElement>
  searchInputRef: RefObject<HTMLInputElement>
  actions: TaskActions
  filteredTasks: Task[]
  taskTree: Task[]
  completedTaskTree: Task[]
  incompleteTaskTree: Task[]
  overdueTaskTree: Task[]
  hasActiveFilters: boolean
}

export function TaskListPanel(props: TaskListPanelProps) {
  const {
    newTaskInputRef,
    searchInputRef,
    actions,
    filteredTasks,
    taskTree,
    completedTaskTree,
    incompleteTaskTree,
    overdueTaskTree,
    hasActiveFilters,
  } = props

  // ===== 组件内部 store selector（不从 App 传递）=====
  const tags = useTagStore(s => s.tags)
  const lists = useListStore(s => s.lists)
  const selectedTagId = useUIStore(s => s.selectedTagId)

  // ===== 列表状态聚合 =====
  const listState = useTaskListState(actions.handleCreateTask, incompleteTaskTree)
  const {
    newTaskTitle, setNewTaskTitle,
    searchQuery, setSearchQuery,
    batchMode, selectedTaskIds, toggleBatchMode, toggleTaskSelection, clearSelection,
    showFilters, toggleFilters, filters,
    aiMode, aiParsing, setAiMode,
    expandedTasks, subtaskInputs, toggleTaskExpand, setSubtaskInput,
    showCompleted, showOverdue, setShowCompleted, setShowOverdue,
    selectedTaskId, setSelectedTaskId,
    currentView, selectedListId,
    isDraggingTask, miniCalendarDate, dragOverCalendarDate, setMiniCalendarDate, setDragOverCalendarDate,
    handleCreateTask, selectAllTasks,
  } = listState

  // ===== 当前列表名称（原 App.tsx currentListName，依赖 selectedTagId / tags / selectedListId / lists）=====
  const currentListName =
    currentView === 'today'
      ? '今日任务'
      : selectedTagId !== null
      ? (tags.find(t => t.id === selectedTagId)?.name || '标签')
      : selectedListId === null
      ? '全部任务'
      : lists.find((l) => l.id === selectedListId)?.name || '未知清单'

  // ===== Context value for TaskItem（与原 App.tsx 完全一致，稳定化 via useMemo）=====
  const taskActionValue: TaskActionContextValue = useMemo(() => ({
    tags,
    lists,
    batchMode,
    isArchivedView: currentView === 'archived',
    onToggle: actions.handleToggleTask,
    onToggleSubtask: actions.handleToggleSubtask,
    onClick: (taskId: number) => setSelectedTaskId(taskId),
    onReorder: actions.handleReorderTasks,
    onDelete: actions.handleDeleteTask,
    onArchive: actions.handleArchiveTask,
    onUnarchive: actions.handleUnarchiveTask,
    onSetDate: actions.handleSetDate,
    onSetPriority: actions.handleSetPriority,
    onTogglePin: actions.handleTogglePin,
    onToggleTag: actions.handleToggleTag,
    onDuplicate: actions.handleDuplicateTask,
    onCreateNewTag: actions.handleCreateNewTagFromMenu,
    onInlineEdit: actions.handleInlineEdit,
    onDragStartGlobal: actions.handleDragStartGlobal,
    onDragEndGlobal: actions.handleDragEndGlobal,
    onCreateSubtask: actions.handleCreateSubtask,
    onToggleExpand: (taskId: number) => toggleTaskExpand(taskId),
    onToggleSelect: (taskId: number) => toggleTaskSelection(taskId),
    onSubtaskInputChange: (taskId: number, val: string) => setSubtaskInput(taskId, val),
  }), [actions, tags, lists, batchMode, currentView, setSelectedTaskId, toggleTaskExpand, setSubtaskInput])

  return (
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
              onClick={actions.handleBatchComplete}
              disabled={selectedTaskIds.size === 0}
              className="flex items-center gap-1 px-2 py-1 text-xs text-green-600 hover:bg-green-100 rounded disabled:opacity-40"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              完成
            </button>
            <button
              onClick={actions.handleBatchArchive}
              disabled={selectedTaskIds.size === 0}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded disabled:opacity-40"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
              归档
            </button>
            <select
              onChange={(e) => {
                if (e.target.value) actions.handleBatchPriority(Number(e.target.value))
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
                if (e.target.value) actions.handleBatchMoveList(Number(e.target.value))
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
              onClick={actions.handleBatchDelete}
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
          onDropDate={actions.handleDropToCalendarDate}
          onClose={actions.handleDragEndGlobal}
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

      <TaskActionProvider value={taskActionValue}>
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
                  isSelected={selectedTaskId === task.id}
                  isExpanded={expandedTasks.has(task.id)}
                  subtaskInput={subtaskInputs[task.id] || ''}
                  onReorder={() => {}}
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
                        isSelected={selectedTaskId === task.id}
                        isExpanded={expandedTasks.has(task.id)}
                        subtaskInput={subtaskInputs[task.id] || ''}
                        isSelectedForBatch={selectedTaskIds.has(task.id)}
                        onReorder={() => {}}
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
                      isSelected={selectedTaskId === task.id}
                      isExpanded={expandedTasks.has(task.id)}
                      subtaskInput={subtaskInputs[task.id] || ''}
                      isSelectedForBatch={selectedTaskIds.has(task.id)}
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
                            isSelected={selectedTaskId === task.id}
                            isExpanded={expandedTasks.has(task.id)}
                            subtaskInput={subtaskInputs[task.id] || ''}
                            isSelectedForBatch={selectedTaskIds.has(task.id)}
                            onReorder={() => {}}
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
      </TaskActionProvider>
    </main>
  )
}

/**
 * 拖拽任务时显示的浮动迷你日历（原 App.tsx 内的同名组件，原样搬迁，未做任何逻辑改动）
 * 拖拽任务卡片到某日期即可设置该任务的截止时间。
 */
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
