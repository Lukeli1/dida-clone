import { useState, useEffect, useRef } from 'react'
import type { Task, Tag, List } from '../../types'
import { getTaskColor, PRIORITY_STYLES } from '../../utils/priority'
import { TaskNotes } from './TaskNotes'
import { SubtaskList, TaskAIPanel } from './SubtaskList'
import { SchedulePanel, TaskMetaPanel } from './TaskMetaPanel'
import { TaskAttachments } from './TaskAttachments'
import { TimeTrackingSection } from './TimeTrackingSection'
import { RelatedTasksPanel } from './RelatedTasksPanel'
import { TaskGoalsPanel } from './TaskGoalsPanel'
import { useConfirm } from '../common/ConfirmDialog'
import { useTaskStore } from '../../stores/taskStore'
import { useUIStore } from '../../stores/uiStore'

interface TaskDetailProps {
  task: Task
  tags: Tag[]
  lists?: List[]
  onUpdate: (id: number, updates: Partial<Task>) => void
  onDelete: (id: number) => void
  onClose: () => void
  onAddTag: (taskId: number, tagId: number) => void
  onRemoveTag: (taskId: number, tagId: number) => void
  onCreateSubtask: (parentId: number, title: string) => Promise<boolean>
}

// 容器：任务基本信息 + 子组件编排
export function TaskDetail({
  task,
  tags,
  lists,
  onUpdate,
  onDelete,
  onClose,
  onAddTag,
  onRemoveTag,
  onCreateSubtask,
}: TaskDetailProps) {
  const [title, setTitle] = useState(task.title)
  const [priority, setPriority] = useState(task.priority)
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showMoreDetails, setShowMoreDetails] = useState(false)

  // 全部任务（用于"相关任务"推荐：AI 分析同项目/同人/同地点的关联）
  const tasks = useTaskStore((s) => s.tasks)

  const confirm = useConfirm()

  const titleRef = useRef<HTMLTextAreaElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const moreBtnRef = useRef<HTMLButtonElement>(null)

  // 点击外部关闭更多菜单
  useEffect(() => {
    if (!showMoreMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(e.target as Node) &&
        moreBtnRef.current &&
        !moreBtnRef.current.contains(e.target as Node)
      ) {
        setShowMoreMenu(false)
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowMoreMenu(false)
        onClose()
      }
    }
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEsc)
    }, 0)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [showMoreMenu, onClose])

  useEffect(() => {
    setTitle(task.title)
    setPriority(task.priority)
  }, [task])

  // 标题输入框自适应高度
  useEffect(() => {
    const el = titleRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }, [title])

  function handleSave() {
    const updates: Partial<Task> = {
      title: title.trim() || task.title,
      priority,
    }
    onUpdate(task.id, updates)
  }

  async function handleDelete() {
    const ok = await confirm({
      title: '删除任务？',
      message: '删除后将移入回收站，可在回收站恢复。',
      danger: true,
      confirmText: '删除',
      cancelText: '取消',
    })
    if (ok) {
      onDelete(task.id)
    }
  }

  // 点击色条循环切换优先级：0 -> 1 -> 2 -> 3 -> 0
  function cyclePriority() {
    const newPriority = (priority + 1) % 4
    setPriority(newPriority)
    onUpdate(task.id, { priority: newPriority })
  }

  return (
    <aside className="w-96 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col h-full">
      {/* ===== Top zone (fixed) ===== */}
      <div className="flex items-start relative shrink-0">
        {/* 优先级色条，点击循环切换 */}
        <button
          onClick={cyclePriority}
          title="点击切换优先级"
          style={{ backgroundColor: PRIORITY_STYLES[priority]?.hex || PRIORITY_STYLES[0].hex }}
          className="w-1.5 self-stretch shrink-0 hover:opacity-80 transition-opacity cursor-pointer active:scale-x-125"
        />

        <div className="flex-1 px-4 pt-4 pb-3 min-w-0">
          {/* 标题行（右侧留出关闭按钮空间） */}
          <div className="flex items-start pr-8">
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleSave}
              rows={1}
              placeholder="任务标题"
              className="flex-1 text-[17px] font-semibold text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] border-none outline-none resize-none bg-transparent border-b-2 border-transparent focus:border-[var(--color-accent)] overflow-y-auto max-h-40 transition-colors"
            />
          </div>

          {/* 日程（截止时间 / 提醒 / 重复） */}
          <SchedulePanel task={task} onUpdate={onUpdate} />
        </div>

        {/* 关闭按钮：右上角 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] rounded transition-all active:scale-90"
          title="关闭"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ===== Middle zone (scrollable) ===== */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <TaskNotes task={task} onUpdate={onUpdate} />
        {task.parent_id == null && (
          <SubtaskList
            key={task.id}
            task={task}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onCreateSubtask={onCreateSubtask}
          />
        )}
        <TaskMetaPanel task={task} tags={tags} onAddTag={onAddTag} onRemoveTag={onRemoveTag} />
        <TaskAIPanel task={task} onCreateSubtask={onCreateSubtask} onUpdate={onUpdate} visible={showAIPanel} />

        <div className="border-t border-[var(--color-border-light)] pt-2">
          <button
            type="button"
            onClick={() => setShowMoreDetails((value) => !value)}
            aria-expanded={showMoreDetails}
            className="flex min-h-9 w-full items-center gap-2 text-left text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <svg
              className={`h-4 w-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform ${showMoreDetails ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="flex-1">更多属性</span>
            <span className="text-xs text-[var(--color-text-tertiary)]">附件 · 时间追踪 · 目标</span>
          </button>

          {showMoreDetails && (
            <div className="space-y-4 pb-1 pt-3">
              <TaskAttachments task={task} />
              <TimeTrackingSection task={task} />
              <RelatedTasksPanel
                task={task}
                allTasks={tasks}
                onTaskClick={(id) => useUIStore.getState().setSelectedTaskId(id)}
              />
              <TaskGoalsPanel taskId={task.id} />
            </div>
          )}
        </div>
      </div>

      {/* ===== Bottom zone (fixed toolbar) ===== */}
      <div className="h-12 border-t border-[var(--color-border-light)] flex items-center justify-between px-4 relative shrink-0">
        {/* 左侧：清单标识（带颜色圆点） */}
        <div className="flex items-center gap-1.5">
          {(() => {
            const list = lists?.find((l) => l.id === task.list_id)
            const color = getTaskColor(task, lists)
            return (
              <>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-sm text-[var(--color-text-secondary)]">{list?.name || '清单'}</span>
              </>
            )
          })()}
        </div>

        {/* 右侧按钮组 */}
        <div className="flex items-center gap-2">
          {/* AI 魔法棒按钮，切换 AI 面板 */}
          <button
            onClick={() => setShowAIPanel((v) => !v)}
            className={`p-1.5 rounded-lg transition-all active:scale-90 ${showAIPanel ? 'text-[var(--color-ai)] bg-[var(--color-ai-light)]' : 'text-[var(--color-ai)] hover:bg-[var(--color-ai-light)]'}`}
            title="AI 助手"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          </button>

          {/* 更多选项按钮 */}
          <button
            ref={moreBtnRef}
            onClick={() => setShowMoreMenu((v) => !v)}
            className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-all active:scale-90"
            title="更多"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
        </div>

        {/* 更多菜单下拉 */}
        {showMoreMenu && (
          <div
            ref={moreMenuRef}
            className="absolute bottom-full right-2 mb-1 w-52 max-h-[300px] overflow-y-auto bg-[var(--color-surface)] rounded-lg border border-[var(--color-border-light)] py-1 z-30 origin-bottom-right animate-scale-in"
            style={{ boxShadow: 'var(--shadow-dropdown)' }}
          >
            <button
              onClick={() => {
                setShowMoreMenu(false)
                handleDelete()
              }}
              className="w-full text-left px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 active:bg-[var(--color-danger)]/15 transition-colors"
              data-testid="detail-delete"
            >
              删除
            </button>
            <div className="my-1 border-t border-[var(--color-border-light)]" />
            <div className="px-3 py-1.5 text-xs text-[var(--color-text-tertiary)]">
              创建于: {new Date(task.created_at).toLocaleString('zh-CN')}
            </div>
            <div className="px-3 py-1.5 text-xs text-[var(--color-text-tertiary)]">
              更新于: {new Date(task.updated_at).toLocaleString('zh-CN')}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
