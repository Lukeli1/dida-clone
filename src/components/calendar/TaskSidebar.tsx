import { useState } from 'react'
import type { Task, List } from '../../types'

/**
 * 任务侧边栏
 *
 * 固定显示在日历右侧，按清单分组展示未完成任务，支持搜索与拖拽到日历设置截止日期。
 * 拖拽过程中保持开启，不会自动收起。
 */
interface TaskSidebarProps {
  open: boolean
  onClose: () => void
  tasks: Task[]
  lists: List[]
  onTaskClick: (taskId: number) => void
}

export function TaskSidebar({ open, onClose, tasks, lists, onTaskClick }: TaskSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedLists, setExpandedLists] = useState<Set<number>>(new Set([lists[0]?.id].filter(Boolean) as number[]))

  function toggleList(listId: number) {
    setExpandedLists((prev) => {
      const next = new Set(prev)
      if (next.has(listId)) {
        next.delete(listId)
      } else {
        next.add(listId)
      }
      return next
    })
  }

  // 按清单分组（仅未完成、未归档）
  const tasksByList = new Map<number, Task[]>()
  tasks.forEach((t) => {
    if (t.completed || t.archived) return
    const arr = tasksByList.get(t.list_id) || []
    arr.push(t)
    tasksByList.set(t.list_id, arr)
  })

  // 搜索过滤
  const q = searchQuery.trim().toLowerCase()
  const displayData = new Map<number, Task[]>()
  tasksByList.forEach((taskArr, listId) => {
    const filtered = q ? taskArr.filter((t) => t.title.toLowerCase().includes(q)) : taskArr
    if (filtered.length > 0) {
      displayData.set(listId, filtered)
    }
  })

  // 拖拽开始：设置数据，不关闭侧边栏
  function handleDragStart(e: React.DragEvent, taskId: number) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(taskId))
    // 设置一个透明的拖拽图像（部分 WebView 需要）
    const ghost = document.createElement('div')
    ghost.style.position = 'absolute'
    ghost.style.top = '-1000px'
    ghost.textContent = '移动任务'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => document.body.removeChild(ghost), 0)
  }

  return (
    <>
      {/* 侧边栏本体 */}
      <div
        className={`flex-shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col transition-all duration-200 overflow-hidden ${
          open ? 'w-72' : 'w-0'
        }`}
      >
        {open && (
          <div className="w-72 flex flex-col h-full">
            {/* 标题栏 */}
            <div className="px-3 py-2.5 border-b border-[var(--color-border-light)] flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-text-secondary)]">任务列表</span>
              <button
                onClick={onClose}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] p-0.5 rounded hover:bg-[var(--color-bg-tertiary)]"
                aria-label="关闭侧边栏"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 搜索框 */}
            <div className="p-2 border-b border-[var(--color-border-light)]">
              <div className="relative">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-tertiary)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索任务..."
                  className="w-full pl-8 pr-2 py-1.5 text-xs border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]"
                />
              </div>
            </div>

            {/* 提示 */}
            <div className="px-3 py-1.5 bg-[var(--color-accent-light)]/50 text-[11px] text-[var(--color-accent)] flex items-center gap-1 border-b border-[var(--color-accent-light)]">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              拖拽任务到日历设置截止日期
            </div>

            {/* 清单列表 */}
            <div className="flex-1 overflow-y-auto">
              {lists.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-[var(--color-text-tertiary)]">暂无清单</div>
              ) : displayData.size === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-[var(--color-text-tertiary)]">
                  {q ? '没有匹配的任务' : '暂无未完成任务'}
                </div>
              ) : (
                lists.map((list) => {
                  const listTasks = displayData.get(list.id) || []
                  if (q && listTasks.length === 0) return null
                  const isExpanded = q ? true : expandedLists.has(list.id)
                  const totalCount = tasksByList.get(list.id)?.length || 0
                  return (
                    <div key={list.id} className="border-b border-[var(--color-border-light)] last:border-b-0">
                      <button
                        onClick={() => toggleList(list.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-bg-secondary)] transition-colors"
                      >
                        <svg
                          className={`w-3 h-3 text-[var(--color-text-tertiary)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: list.color || '#6B7280' }}
                        />
                        <span className="text-sm text-[var(--color-text-secondary)] flex-1 text-left truncate">
                          {list.name}
                        </span>
                        <span className="text-xs text-[var(--color-text-tertiary)]">{totalCount}</span>
                      </button>
                      {isExpanded && listTasks.length > 0 && (
                        <div className="pb-1">
                          {listTasks.map((task) => (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              onClick={() => onTaskClick(task.id)}
                              className="flex items-center gap-2 px-3 pl-8 py-1.5 mx-1 rounded-md cursor-grab hover:bg-[var(--color-accent-light)] active:cursor-grabbing transition-colors group select-none"
                              title="拖拽到日历或点击查看详情"
                            >
                              <svg
                                className="w-3 h-3 text-[var(--color-text-tertiary)] group-hover:text-[var(--color-accent)] flex-shrink-0 pointer-events-none"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 8h16M4 16h16"
                                />
                              </svg>
                              <span
                                className={`text-xs flex-1 truncate pointer-events-none ${task.due_date ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-secondary)]'}`}
                              >
                                {task.title}
                              </span>
                              {task.priority > 0 && (
                                <span
                                  className="w-1.5 h-1.5 rounded-full flex-shrink-0 pointer-events-none"
                                  style={{
                                    backgroundColor:
                                      task.priority === 1 ? '#EF4444' : task.priority === 2 ? '#F59E0B' : '#3B82F6',
                                  }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
