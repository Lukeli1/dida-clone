import { useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/sidebar/Sidebar'
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
import { NotificationCenter } from './components/NotificationCenter'
import { OnboardingTour } from './components/OnboardingTour'
import { AppSkeleton } from './components/common/Skeleton'
import { TopProgressBar } from './components/common/TopProgressBar'

// 按需懒加载：非首屏视图（统计 / 设置 / AI / 四象限 / 番茄 / 习惯 / 模板 / 目标）
// 独立打包为各自 chunk，减小首屏 bundle 体积。首屏任务列表 / 日历仍走同步导入。
const StatsView = lazy(() => import('./components/StatsView').then(m => ({ default: m.StatsView })))
const SettingsView = lazy(() => import('./components/settings/SettingsView').then(m => ({ default: m.SettingsView })))
const AIAssistant = lazy(() => import('./components/ai/AIAssistant').then(m => ({ default: m.AIAssistant })))
const QuadrantView = lazy(() => import('./components/QuadrantView').then(m => ({ default: m.QuadrantView })))
const PomodoroView = lazy(() => import('./components/pomodoro/PomodoroView').then(m => ({ default: m.PomodoroView })))
const HabitView = lazy(() => import('./components/habit/HabitView').then(m => ({ default: m.HabitView })))
const TemplateView = lazy(() => import('./components/template/TemplateView').then(m => ({ default: m.TemplateView })))
const GoalView = lazy(() => import('./components/goal/GoalView').then(m => ({ default: m.GoalView })))

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

  // ===== 通知中心面板（共享状态：TitleBar 通知按钮触发）=====
  const notificationCenterOpen = useUIStore(s => s.notificationCenterOpen)
  const setNotificationCenterOpen = useUIStore(s => s.setNotificationCenterOpen)

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

  // ===== 视图专用派生数据（useMemo 缓存，避免每次渲染创建新数组）=====
  const activeTasks = useMemo(() => tasks.filter(t => !t.archived), [tasks])
  const activeIncompleteTasks = useMemo(() => tasks.filter(t => !t.completed && !t.archived), [tasks])

  // ===== 稳定回调（useCallback 缓存，避免每次渲染创建新函数引用）=====
  const handleCloseSettings = useCallback(() => setCurrentView('tasks'), [setCurrentView])
  const handleCloseAI = useCallback(() => setCurrentView('tasks'), [setCurrentView])
  const handleAITasksChange = useCallback(() => useTaskStore.getState().loadTasks(), [])
  const handleQuadrantTaskClick = useCallback((id: number) => setSelectedTaskId(id), [setSelectedTaskId])
  const handlePomodoroTaskClick = useCallback((id: number) => setSelectedTaskId(id), [setSelectedTaskId])
  const handleQuadrantToggleTask = useCallback((id: number) => {
    const task = tasks.find(t => t.id === id)
    if (task) actions.handleToggleTask(task)
  }, [tasks, actions])
  const handlePomodoroToggleTask = useCallback((id: number) => {
    const task = tasks.find(t => t.id === id)
    if (task) actions.handleToggleTask(task)
  }, [tasks, actions])
  const handleQuadrantUpdatePriority = useCallback((id: number, priority: number) => {
    actions.handleUpdateTask(id, { priority })
  }, [actions])
  const handleCloseShortcutsHelp = useCallback(() => setShortcutsHelpOpen(false), [setShortcutsHelpOpen])
  const handleCloseNotificationCenter = useCallback(() => setNotificationCenterOpen(false), [setNotificationCenterOpen])

  if (loading) {
    return <AppSkeleton />
  }

  // 视图路由：switch-case 替代原先 8 层嵌套三元表达式，可读性更好。
  // 懒加载视图（stats / settings / ai / quadrant / pomodoro / habit / template / goals）
  // 在下方由 <Suspense> 包裹，首次进入对应视图时加载 chunk 并展示 fallback。
  // tasks / today / archived 三种列表视图共用 TaskListPanel（同步导入，首屏优先）。
  let mainView
  switch (currentView) {
    case 'calendar':
      mainView = <CalendarPanel selectedTask={selectedTask} actions={actions} />
      break
    case 'stats':
      mainView = <StatsView tasks={tasks} lists={lists} />
      break
    case 'settings':
      mainView = <SettingsView onClose={handleCloseSettings} />
      break
    case 'ai':
      mainView = (
        <AIAssistant tasks={tasks} onClose={handleCloseAI} onTasksChange={handleAITasksChange} />
      )
      break
    case 'quadrant':
      mainView = (
        <main className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <QuadrantView
              tasks={activeTasks}
              onTaskClick={handleQuadrantTaskClick}
              onToggleTask={handleQuadrantToggleTask}
              onUpdateTaskPriority={handleQuadrantUpdatePriority}
              actions={actions}
            />
          </div>
          <DetailPanel task={selectedTask} actions={actions} />
        </main>
      )
      break
    case 'pomodoro':
      mainView = (
        <PomodoroView
          tasks={activeIncompleteTasks}
          onTaskClick={handlePomodoroTaskClick}
          onToggleTask={handlePomodoroToggleTask}
        />
      )
      break
    case 'habit':
      mainView = <HabitView />
      break
    case 'template':
      mainView = <TemplateView />
      break
    case 'goals':
      mainView = <GoalView />
      break
    case 'tasks':
    case 'today':
    case 'archived':
    default:
      mainView = (
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
      )
      break
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg-secondary)] overflow-hidden">
      <TopProgressBar />
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          lists={lists}
          tags={tags}
          selectedListId={selectedListId}
          selectedTagId={selectedTagId}
          currentView={currentView}
          onSelectList={setSelectedListId}
          onSelectTag={setSelectedTagId}
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

        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center text-[var(--color-text-tertiary)]">
              <svg className="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              加载中...
            </div>
          }
        >
          {mainView}
        </Suspense>

        {/* 右侧独立详情：仅在任务列表类视图（tasks / today / archived）下显示，
            避免与日历/四象限的内联详情重复渲染。无选中任务时 DetailPanel 返回 null。 */}
        {selectedTask && (currentView === 'tasks' || currentView === 'today' || currentView === 'archived') && (
          <DetailPanel task={selectedTask} actions={actions} />
        )}
      </div>

      {/* 快捷键帮助面板（fixed 定位，按 ? / F1 或 TitleBar 帮助按钮打开）*/}
      <ShortcutsHelp open={shortcutsHelpOpen} onClose={handleCloseShortcutsHelp} />

      {/* 通知中心面板（fixed 定位，按 TitleBar 通知按钮打开）*/}
      <NotificationCenter open={notificationCenterOpen} onClose={handleCloseNotificationCenter} />

      {/* 新用户引导教程（首次启动自动弹出，可在侧边栏底部重新触发）*/}
      <OnboardingTour />
    </div>
  )
}

export default App
