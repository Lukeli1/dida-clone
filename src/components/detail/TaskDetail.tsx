import { useState, useEffect, useRef } from 'react'
import type { Task, Tag, List } from '../../types'
import { getTaskColor } from '../../utils/priority'
import { TaskNotes } from './TaskNotes'
import { SubtaskList, TaskAIPanel } from './SubtaskList'
import { SchedulePanel, TaskMetaPanel } from './TaskMetaPanel'

interface TaskDetailProps {
  task: Task
  tags: Tag[]
  lists?: List[]
  onUpdate: (id: number, updates: Partial<Task>) => void
  onDelete: (id: number) => void
  onClose: () => void
  onAddTag: (taskId: number, tagId: number) => void
  onRemoveTag: (taskId: number, tagId: number) => void
  onCreateSubtask: (parentId: number, title: string) => void
}

// 优先级对应的色条颜色
const PRIORITY_BAR_COLORS: Record<number, string> = {
  0: '#D1D5DB',
  1: '#EF4444',
  2: '#F59E0B',
  3: '#378ADD',
}

// 容器：任务基本信息 + 子组件编排
export function TaskDetail({ task, tags, lists, onUpdate, onDelete, onClose, onAddTag, onRemoveTag, onCreateSubtask }: TaskDetailProps) {
  const [title, setTitle] = useState(task.title)
  const [priority, setPriority] = useState(task.priority)
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showSubtaskInput, setShowSubtaskInput] = useState(false)

  const titleRef = useRef<HTMLTextAreaElement>(null)

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

  function handleDelete() {
    if (confirm('确定删除这个任务吗？')) {
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
          style={{ backgroundColor: PRIORITY_BAR_COLORS[priority] ?? PRIORITY_BAR_COLORS[0] }}
          className="w-1 self-stretch shrink-0 hover:opacity-80 transition-opacity"
        />

        <div className="flex-1 px-4 pt-4 pb-3 min-w-0">
          {/* 标题行：标题 + 子任务按钮（右侧留出关闭按钮空间） */}
          <div className="flex items-start gap-2 pr-8">
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleSave}
              rows={1}
              placeholder="任务标题"
              className="flex-1 text-[17px] font-semibold text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] border-none outline-none resize-none bg-transparent border-b-2 border-transparent focus:border-[var(--color-accent)] overflow-hidden transition-colors"
            />
            {/* 子任务按钮：列表图标，点击展开子任务区域 */}
            <button
              onClick={() => setShowSubtaskInput(v => !v)}
              className={`shrink-0 p-1 rounded transition-colors mt-0.5 ${
                showSubtaskInput ? 'text-[var(--color-accent)] bg-[var(--color-accent-light)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-secondary)]'
              }`}
              title="添加子任务"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* 日程（截止时间 / 提醒 / 重复） */}
          <SchedulePanel task={task} onUpdate={onUpdate} />
        </div>

        {/* 关闭按钮：右上角 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] rounded transition-colors"
          title="关闭"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ===== Middle zone (scrollable) ===== */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        <TaskNotes task={task} onUpdate={onUpdate} />
        <SubtaskList
          task={task}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onCreateSubtask={onCreateSubtask}
          visible={showSubtaskInput}
        />
        <TaskMetaPanel task={task} tags={tags} onAddTag={onAddTag} onRemoveTag={onRemoveTag} />
        <TaskAIPanel
          task={task}
          onCreateSubtask={onCreateSubtask}
          onUpdate={onUpdate}
          visible={showAIPanel}
        />
      </div>

      {/* ===== Bottom zone (fixed toolbar) ===== */}
      <div className="h-12 border-t border-[var(--color-border-light)] flex items-center justify-between px-4 relative shrink-0">
        {/* 左侧：清单标识（带颜色圆点） */}
        <div className="flex items-center gap-1.5">
          {(() => {
            const list = lists?.find(l => l.id === task.list_id)
            const color = getTaskColor(task, lists)
            return (
              <>
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm text-[var(--color-text-secondary)]">{list?.name || '清单'}</span>
              </>
            )
          })()}
        </div>

        {/* 右侧按钮组 */}
        <div className="flex items-center gap-2">
          {/* AI 魔法棒按钮，切换 AI 面板 */}
          <button
            onClick={() => setShowAIPanel(v => !v)}
            className={`p-1 transition-colors ${showAIPanel ? 'text-purple-600' : 'text-purple-500 hover:text-purple-600'}`}
            title="AI 助手"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          </button>

          {/* 更多选项按钮 */}
          <button
            onClick={() => setShowMoreMenu(v => !v)}
            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
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
          <div className="absolute bottom-full right-2 mb-1 w-52 bg-[var(--color-surface)] rounded-lg shadow-lg border border-[var(--color-border-light)] py-1 z-30">
            <button
              onClick={() => {
                setShowMoreMenu(false)
                handleDelete()
              }}
              className="w-full text-left px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors"
            >
              删除任务
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
