import { useMemo, type RefObject } from 'react'
import { TaskItem } from '../task-item/TaskItem'
import { EmptyState } from '../EmptyState'
import { TaskActionProvider, type TaskActionContextValue } from '../../contexts/TaskActionContext'
import { useTagStore } from '../../stores/tagStore'
import { useListStore } from '../../stores/listStore'
import { useUIStore } from '../../stores/uiStore'
import { useTaskListState } from '../../hooks/useTaskListState'
import type { TaskActions } from '../../hooks/useTaskActions'
import type { Task } from '../../types'
import { TaskInputBar } from './TaskInputBar'
import { TaskFilterBar } from './TaskFilterBar'
import { BatchToolbar } from './BatchToolbar'
import { MiniCalendarDropzone } from './MiniCalendarDropzone'

/** 任务列表区容器：列表渲染 + 子组件编排（输入栏 / 筛选栏 / 批量工具栏 / 迷你日历已拆为子组件，逻辑未改） */
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

  // ===== 当前列表名称（依赖 selectedTagId / tags / selectedListId / lists）=====
  const currentListName =
    currentView === 'today'
      ? '今日任务'
      : selectedTagId !== null
      ? (tags.find(t => t.id === selectedTagId)?.name || '标签')
      : selectedListId === null
      ? '全部任务'
      : lists.find((l) => l.id === selectedListId)?.name || '未知清单'

  // ===== Context value for TaskItem（稳定化 via useMemo）=====
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
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              {currentView === 'archived' ? '归档' : searchQuery.trim() ? '搜索结果' : currentListName}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
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
                    ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                    : 'text-[var(--color-text-secondary)] border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]/60'
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
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] border-[var(--color-accent)]'
                  : 'text-[var(--color-text-secondary)] border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]'
              }`}
              title="组合筛选"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-3.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              筛选
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-[var(--color-accent)] rounded-full" />
              )}
            </button>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索标题、备注、子任务... (Ctrl+F)"
                className="pl-9 pr-4 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] w-64"
              />
            </div>
          </div>
        </div>

        {/* 筛选面板 */}
        {showFilters && (
          <TaskFilterBar filters={filters} tags={tags} lists={lists} hasActiveFilters={hasActiveFilters} filteredCount={filteredTasks.length} />
        )}

        {/* 批量操作工具栏 */}
        {batchMode && (
          <BatchToolbar
            selectedTaskIds={selectedTaskIds}
            selectAllTasks={selectAllTasks}
            clearSelection={clearSelection}
            actions={actions}
            lists={lists}
          />
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
        <TaskInputBar
          newTaskInputRef={newTaskInputRef}
          newTaskTitle={newTaskTitle}
          setNewTaskTitle={setNewTaskTitle}
          aiMode={aiMode}
          aiParsing={aiParsing}
          setAiMode={setAiMode}
          handleCreateTask={handleCreateTask}
        />
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
                <TaskItem key={task.id} task={task} isSelected={selectedTaskId === task.id} isExpanded={expandedTasks.has(task.id)} subtaskInput={subtaskInputs[task.id] || ''} onReorder={() => {}} />
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
                  className="flex items-center gap-2 text-sm text-[var(--color-danger)] hover:text-[var(--color-danger)] mb-2 transition-colors font-medium"
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
                      <TaskItem key={task.id} task={task} isSelected={selectedTaskId === task.id} isExpanded={expandedTasks.has(task.id)} subtaskInput={subtaskInputs[task.id] || ''} isSelectedForBatch={selectedTaskIds.has(task.id)} onReorder={() => {}} />
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
                    <TaskItem key={task.id} task={task} isSelected={selectedTaskId === task.id} isExpanded={expandedTasks.has(task.id)} subtaskInput={subtaskInputs[task.id] || ''} isSelectedForBatch={selectedTaskIds.has(task.id)} />
                  ))}
                </ul>

                {completedTaskTree.length > 0 && (
                  <div className="mt-4">
                    <button
                      onClick={() => setShowCompleted(!showCompleted)}
                      className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)] mb-2 transition-colors"
                    >
                      <svg className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      已完成 ({completedTaskTree.length})
                    </button>
                    {showCompleted && (
                      <ul className="space-y-1">
                        {completedTaskTree.map((task) => (
                          <TaskItem key={task.id} task={task} isSelected={selectedTaskId === task.id} isExpanded={expandedTasks.has(task.id)} subtaskInput={subtaskInputs[task.id] || ''} isSelectedForBatch={selectedTaskIds.has(task.id)} onReorder={() => {}} />
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
