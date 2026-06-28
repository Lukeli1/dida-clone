import { useTagStore } from '../stores/tagStore'
import { useListStore } from '../stores/listStore'
import { useUIStore } from '../stores/uiStore'
import { TaskDetail } from './detail/TaskDetail'
import type { Task } from '../types'
import type { TaskActions } from '../hooks/useTaskActions'

/**
 * 右侧任务详情区
 *
 * 封装原 App.tsx 中重复出现 3 次的 TaskDetail 渲染块：
 *   1. 日历视图内联详情（CalendarPanel）
 *   2. 四象限视图内联详情（App.tsx quadrant 分支）
 *   3. 任务列表/今日/归档等视图的右侧独立详情（App.tsx 末尾）
 *
 * 设计要点：
 *   - tags / lists / setSelectedTaskId 均在组件内部直接调用 store（遵循“子组件内部各自
 *     调用 store selector，不从 App 传递”原则）。
 *   - task 允许为 null：当无选中任务时返回 null（等价于原 `{selectedTask && <TaskDetail/>}`）。
 *     注意：hooks 必须在条件 return 之前调用，以遵守 React Hooks 规则。
 *   - actions 由 App 层的 useTaskActions 聚合后透传，保持 35 个 action 的稳定引用。
 *   - 不改变 TaskDetail 的 props 结构与行为。
 */
interface DetailPanelProps {
  task: Task | null
  actions: TaskActions
}

export function DetailPanel({ task, actions }: DetailPanelProps) {
  const tags = useTagStore(s => s.tags)
  const lists = useListStore(s => s.lists)
  const setSelectedTaskId = useUIStore(s => s.setSelectedTaskId)

  if (!task) return null

  return (
    <TaskDetail
      task={task}
      tags={tags}
      lists={lists}
      onUpdate={actions.handleUpdateTask}
      onDelete={actions.handleDeleteTask}
      onClose={() => setSelectedTaskId(null)}
      onAddTag={actions.handleAddTagToTask}
      onRemoveTag={actions.handleRemoveTagFromTask}
      onCreateSubtask={actions.handleCreateSubtask}
    />
  )
}
