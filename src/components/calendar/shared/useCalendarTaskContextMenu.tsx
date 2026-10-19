import { useCallback, useMemo, useState } from 'react'
import type { Task } from '../../../types'
import type { TaskActions } from '../../../hooks/useTaskActions'
import { useTagStore } from '../../../stores/tagStore'
import { useListStore } from '../../../stores/listStore'
import { TaskActionProvider, type TaskActionContextValue } from '../../../contexts/TaskActionContext'
import { TaskContextMenu } from '../../task-item/TaskContextMenu'
import { TaskRenameInput } from '../../task-item/TaskRenameInput'

/**
 * 日历月 / 周 / 日视图的任务右键菜单能力（阶段复用 TaskContextMenu 全套交互）。
 *
 * - handleTaskContextMenu：任务块 onContextMenu 处理器，阻止原生菜单并记录目标任务；
 *   actions 未传入时直接放行（测试或特殊挂载场景无菜单可用）。
 * - 菜单「重命名」：TaskItem 的行内编辑器不在日历任务块上，改为挂载
 *   TaskRenameInput（fixed 定位贴近触发点），保存走 actions.handleInlineEdit，
 *   与任务列表内联重命名共用同一条任务更新路径。
 * - 菜单打开前广播 close-context-menus，与 TaskItem 行为一致，避免多菜单叠加。
 *
 * 菜单操作作用于任务本身：重复任务在日历中以 occurrence 展示时，
 * task 即其基础任务对象，删除 / 修改与任务列表右键语义一致（作用于整条规则），
 * 不引入 occurrence 级操作。
 */
interface UseCalendarTaskContextMenuOptions {
  actions?: TaskActions
  onTaskClick: (taskId: number) => void
}

interface ContextMenuTarget {
  task: Task
  x: number
  y: number
}

export function useCalendarTaskContextMenu({ actions, onTaskClick }: UseCalendarTaskContextMenuOptions) {
  const [menuTarget, setMenuTarget] = useState<ContextMenuTarget | null>(null)
  const [renaming, setRenaming] = useState<ContextMenuTarget | null>(null)
  const tags = useTagStore((s) => s.tags)
  const lists = useListStore((s) => s.lists)

  const handleTaskContextMenu = useCallback(
    (e: { preventDefault(): void; stopPropagation(): void; clientX: number; clientY: number }, task: Task) => {
      if (!actions) return
      e.preventDefault()
      e.stopPropagation()
      document.dispatchEvent(new CustomEvent('close-context-menus'))
      setRenaming(null)
      setMenuTarget({ task, x: e.clientX, y: e.clientY })
    },
    [actions],
  )

  const closeMenu = useCallback(() => setMenuTarget(null), [])

  // 先记下菜单目标任务再关菜单：菜单卸载后重命名输入框仍指向正确任务
  const handleRenameStart = useCallback(() => {
    setRenaming((current) => current ?? menuTarget)
    setMenuTarget(null)
  }, [menuTarget])

  const taskActionValue = useMemo<TaskActionContextValue | null>(() => {
    if (!actions) return null
    return {
      tags,
      lists,
      batchMode: false,
      isArchivedView: false,
      onToggle: (task) => actions.handleToggleTask(task),
      onToggleSubtask: actions.handleToggleSubtask,
      onClick: onTaskClick,
      onReorder: () => {},
      onDelete: actions.handleDeleteTask,
      onArchive: actions.handleArchiveTask,
      onUnarchive: actions.handleUnarchiveTask,
      onSetDate: actions.handleSetDate,
      onSetPriority: actions.handleSetPriority,
      onSetRepeatRule: actions.handleSetRepeatRule,
      onSetReminder: actions.handleSetReminder,
      onTogglePin: actions.handleTogglePin,
      onToggleTag: actions.handleToggleTag,
      onDuplicate: actions.handleDuplicateTask,
      onCreateNewTag: actions.handleCreateTag,
      onInlineEdit: actions.handleInlineEdit,
      onDragStartGlobal: actions.handleDragStartGlobal,
      onDragEndGlobal: actions.handleDragEndGlobal,
      onCreateSubtask: actions.handleCreateSubtask,
      onToggleExpand: () => {},
      onToggleSelect: () => {},
      onSubtaskInputChange: () => {},
    }
  }, [actions, onTaskClick, tags, lists])

  const menuElement = useMemo(() => {
    if (!taskActionValue) return null
    return (
      <>
        {menuTarget && (
          <TaskActionProvider value={taskActionValue}>
            <TaskContextMenu
              task={menuTarget.task}
              position={{ x: menuTarget.x, y: menuTarget.y }}
              variant="calendar"
              onClose={closeMenu}
              onRename={handleRenameStart}
            />
          </TaskActionProvider>
        )}
        {renaming && (
          <TaskRenameInput
            key={renaming.task.id}
            task={renaming.task}
            position={{ x: renaming.x, y: renaming.y }}
            onSave={(title) => {
              const trimmed = title.trim()
              if (trimmed) actions?.handleInlineEdit(renaming.task.id, trimmed)
              setRenaming(null)
            }}
            onCancel={() => setRenaming(null)}
          />
        )}
      </>
    )
  }, [taskActionValue, menuTarget, renaming, closeMenu, handleRenameStart, actions])

  return { handleTaskContextMenu, menuElement }
}
