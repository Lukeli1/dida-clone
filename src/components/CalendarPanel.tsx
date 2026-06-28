import { useTaskStore } from '../stores/taskStore'
import { useListStore } from '../stores/listStore'
import { useUIStore } from '../stores/uiStore'
import { CalendarView } from './CalendarView'
import { DetailPanel } from './DetailPanel'
import type { Task } from '../types'
import type { TaskActions } from '../hooks/useTaskActions'

/**
 * 日历视图区（CalendarView + 内联详情）
 *
 * 对应原 App.tsx 中 `currentView === 'calendar'` 分支：
 *   <main>
 *     <CalendarView ... />
 *     {selectedTask && <TaskDetail ... />}   → 现由 DetailPanel 统一封装（无任务时返回 null）
 *   </main>
 *
 * 注意：CalendarView 内部包含 月/周/日/甘特 等子视图切换，本组件只负责把日历视图的
 * 外层布局与所需数据/回调组装起来，不改变 CalendarView 的任何内部行为。
 *
 * tasks / lists / setSelectedTaskId 在组件内部直接调用 store；
 * selectedTask 与 actions 由 App 层透传（selectedTask 在 App 层 useMemo 单次计算，
 * 供日历内联详情、四象限内联详情、右侧独立详情三处共用，避免重复计算）。
 */
interface CalendarPanelProps {
  selectedTask: Task | null
  actions: TaskActions
}

export function CalendarPanel({ selectedTask, actions }: CalendarPanelProps) {
  const tasks = useTaskStore(s => s.tasks)
  const lists = useListStore(s => s.lists)
  const setSelectedTaskId = useUIStore(s => s.setSelectedTaskId)

  return (
    <main className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <CalendarView
          tasks={tasks}
          lists={lists}
          onTaskClick={(id) => setSelectedTaskId(id)}
          onToggleTask={(id) => actions.handleToggleTask(tasks.find(t => t.id === id)!)}
          onMoveTask={actions.handleMoveTask}
          onCreateTask={actions.handleCreateTaskOnDate}
          onCreateTaskOnRange={actions.handleCreateTaskOnRange}
          onUpdateTask={actions.handleUpdateTask}
        />
      </div>
      {selectedTask && (
        <DetailPanel task={selectedTask} actions={actions} />
      )}
    </main>
  )
}
