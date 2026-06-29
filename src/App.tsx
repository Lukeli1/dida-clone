import { useMemo, useRef } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/sidebar/Sidebar'
import { StatsView } from './components/StatsView'
import { SettingsView } from './components/settings/SettingsView'
import { AIAssistant } from './components/ai/AIAssistant'
import { QuadrantView } from './components/QuadrantView'
import { PomodoroView } from './components/pomodoro/PomodoroView'
import { HabitView } from './components/habit/HabitView'
import { useToast } from './components/Toast'
import { useTaskStore } from './stores/taskStore'
import { useListStore } from './stores/listStore'
import { useTagStore } from './stores/tagStore'
import { useUIStore } from './stores/uiStore'
import { useAppInit } from './hooks/useAppInit'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useTaskFiltering } from './hooks/useTaskFiltering'
import { useTaskActions } from './hooks/useTaskActions'
import { TaskListPanel } from './components/task-list/TaskListPanel'
import { CalendarPanel } from './components/CalendarPanel'
import { DetailPanel } from './components/DetailPanel'
import { ShortcutsHelp } from './components/ShortcutsHelp'

/**
 * App 根组件（重构后）
 *
 * 重构目标：把原 740 行的 App.tsx 拆分为：
 *   - hooks/useTaskListState.ts      列表状态聚合（newTaskTitle / 搜索 / 批量 / 筛选）
 *   - components/TaskListPanel.tsx   任务列表区 JSX（输入栏 + 列表 + 批量工具栏 + 筛选栏 + 迷你日历）
 *   - components/DetailPanel.tsx      右侧详情区（TaskDetail 或空）
 *   - components/CalendarPanel.tsx    日历视图区（CalendarView + 内联详情）
 *
 * App 现在只保留：
 *   1. TitleBar + Sidebar 布局
 *   2. currentView 视图路由 switch
 *   3. 仍需在 App 层聚合的共享逻辑：
 *      - useAppInit / useKeyboardShortcuts（全局副作用 + 全局快捷键，须在所有视图下生效）
 *      - useTaskFiltering（结果被 Sidebar 与 TaskListPanel 共用，单次计算避免重复）
 *      - useTaskActions（35 个 action 的聚合，被 Sidebar / CalendarPanel / TaskListPanel /
 *        DetailPanel / Quadrant / Pomodoro 等共用）
 *      - selectedTask（useMemo 单次计算，供日历内联详情 / 四象限内联详情 / 右侧独立详情共用）
 *      - newTaskInputRef / searchInputRef（被 useKeyboardShortcuts 与 TaskListPanel 输入框共享，
 *        按“保守策略：被多区域共享的状态保留在 App”）
 *
 * 注意：TaskActionProvider 已随 TaskListPanel 一并搬迁（它原本就只包裹任务列表），
 * TaskActionContext 的结构与 TaskItem 获取 action 的方式均未改变。
 */
function App() {
  const toast = useToast()

  // ===== Store: 数据 =====
  const tasks = useTaskStore(s => s.tasks)
  const lists = useListStore(s => s.lists)
  const tags = useTagStore(s => s.tags)
  const loading = useTaskStore(s => s.loading)

  // ===== Store: UI（仅保留 App 布局/路由/Sidebar 所需；列表专属状态已下沉到 useTaskListState）=====
  const currentView = useUIStore(s => s.currentView)
  const selectedListId = useUIStore(s => s.selectedListId)
  const selectedTagId = useUIStore(s => s.selectedTagId)
  const selectedTaskId = useUIStore(s => s.selectedTaskId)
  const setCurrentView = useUIStore(s => s.setCurrentView)
  const setSelectedListId = useUIStore(s => s.setSelectedListId)
  const setSelectedTagId = useUIStore(s => s.setSelectedTagId)
  const setSelectedTaskId = useUIStore(s => s.setSelectedTaskId)

  // ===== 快捷键帮助面板（共享状态：TitleBar 按钮 + ? / F1 监听均可触发）=====
  const shortcutsHelpOpen = useUIStore(s => s.shortcutsHelpOpen)
  const setShortcutsHelpOpen = useUIStore(s => s.setShortcutsHelpOpen)

  // ===== Refs（键盘快捷键 + TaskListPanel 输入框共享）=====
  const newTaskInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ===== 全局副作用 / 快捷键（须在所有视图下生效，故留在 App）=====
  useAppInit(toast)
  useKeyboardShortcuts(newTaskInputRef, searchInputRef)

  // ===== 任务筛选（结果被 Sidebar 与 TaskListPanel 共用）=====
  const {
    filteredTasks, taskTree, completedTaskTree, incompleteTaskTree,
    overdueTaskTree, todayCount, archivedCount, taskCounts, hasActiveFilters,
  } = useTaskFiltering()

  // Ref for incompleteTaskTree（reorder handler 需要最新值而不重建回调）
  const incompleteTaskTreeRef = useRef(incompleteTaskTree)
  incompleteTaskTreeRef.current = incompleteTaskTree

  // ===== 35 个 action 聚合（getState() 模式，引用稳定，供所有子组件共用）=====
  const actions = useTaskActions(toast, incompleteTaskTreeRef)

  // ===== 选中任务（单次计算，三处详情共用）=====
  const selectedTask = useMemo(() => {
    return tasks.find(t => t.id === selectedTaskId) || null
  }, [tasks, selectedTaskId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-secondary)] flex items-center justify-center">
        <p className="text-[var(--color-text-secondary)]">加载中...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg-secondary)] overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          lists={lists}
          tags={tags}
          selectedListId={selectedListId}
          selectedTagId={selectedTagId}
          currentView={currentView}
          onSelectList={(id) => setSelectedListId(id)}
          onSelectTag={(id) => setSelectedTagId(id)}
          onViewChange={setCurrentView}
          onCreateList={actions.handleCreateList}
          onUpdateList={actions.handleUpdateList}
          onDeleteList={actions.handleDeleteList}
          onCreateTag={actions.handleCreateTag}
          onDeleteTag={actions.handleDeleteTag}
          taskCounts={taskCounts}
          todayCount={todayCount}
          archivedCount={archivedCount}
        />

        {currentView === 'calendar' ? (
          <CalendarPanel selectedTask={selectedTask} actions={actions} />
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
                onToggleTask={(id) => actions.handleToggleTask(tasks.find(t => t.id === id)!)}
                onUpdateTaskPriority={(id, priority) => actions.handleUpdateTask(id, { priority })}
                actions={actions}
              />
            </div>
            <DetailPanel task={selectedTask} actions={actions} />
          </main>
        ) : currentView === 'pomodoro' ? (
          <PomodoroView
            tasks={tasks.filter(t => !t.completed && !t.archived)}
            onTaskClick={(id) => setSelectedTaskId(id)}
            onToggleTask={(id) => actions.handleToggleTask(tasks.find(t => t.id === id)!)}
          />
        ) : currentView === 'habit' ? (
          <HabitView />
        ) : (
          <TaskListPanel
            newTaskInputRef={newTaskInputRef}
            searchInputRef={searchInputRef}
            actions={actions}
            filteredTasks={filteredTasks}
            taskTree={taskTree}
            completedTaskTree={completedTaskTree}
            incompleteTaskTree={incompleteTaskTree}
            overdueTaskTree={overdueTaskTree}
            hasActiveFilters={hasActiveFilters}
          />
        )}

        {/* 右侧独立详情：仅在“非日历/非四象限/非设置/非番茄/非习惯”视图下显示，
            避免与日历/四象限的内联详情重复渲染。无选中任务时 DetailPanel 返回 null。 */}
        {selectedTask && currentView !== 'calendar' && currentView !== 'settings' && currentView !== 'quadrant' && currentView !== 'pomodoro' && currentView !== 'habit' && (
          <DetailPanel task={selectedTask} actions={actions} />
        )}
      </div>

      {/* 快捷键帮助面板（fixed 定位，按 ? / F1 或 TitleBar 帮助按钮打开）*/}
      <ShortcutsHelp open={shortcutsHelpOpen} onClose={() => setShortcutsHelpOpen(false)} />
    </div>
  )
}

export default App
