import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { Task } from '../../types'
import { useTaskActionContext } from '../../contexts/TaskActionContext'
import { useUIStore } from '../../stores/uiStore'
import { DateMenu } from './menu/DateMenu'
import { PriorityMenu } from './menu/PriorityMenu'
import { TagMenu } from './menu/TagMenu'
import { RepeatMenu } from './menu/RepeatMenu'
import { ReminderMenu } from './menu/ReminderMenu'
import {
  useMenuKeyboard,
  useMenuScope,
  MenuKeyboardScopeProvider,
  type MenuItemInfo,
} from '../../hooks/useMenuKeyboard'

/**
 * 任务右键菜单。
 *
 * 从 TaskItem 容器中拆出。菜单的「是否显示」由容器决定（通过 position 是否为 null），
 * 本组件仅在 position 存在时挂载。删除确认等内部展开状态由本组件自管，与原内联实现一致。
 *
 * - onClose:  关闭菜单（容器将 position 置空）
 * - onRename: 触发容器进入内联编辑模式（重命名）
 *
 * 关闭逻辑（点击外部 / Esc / 滚动 / 其它右键 / close-context-menus 事件）原样保留。
 * 日期 / 优先级 / 标签子菜单已拆分至 ./menu 下的独立组件，子菜单内部展开状态由各子组件自管，
 * 菜单卸载（onClose 触发）时自动重置。
 *
 * 键盘导航（P10-06）：主菜单的简单按钮项支持 ↑↓ 选择、Enter 确认、Esc 关闭；
 * 子菜单各自处理水平 ←→ 导航。主菜单与子菜单通过作用域协调器避免 Enter 冲突：
 * 鼠标悬停某个子菜单时该子菜单接管键盘，主菜单暂停；离开后回到主菜单。
 */
interface TaskContextMenuProps {
  task: Task
  position: { x: number; y: number }
  onClose: () => void
  onRename: () => void
}

export function TaskContextMenu(props: TaskContextMenuProps) {
  // Provider 必须在消费 useMenuScope 的组件之上，因此拆出内部组件
  return (
    <MenuKeyboardScopeProvider>
      <TaskContextMenuInner {...props} />
    </MenuKeyboardScopeProvider>
  )
}

function TaskContextMenuInner({ task, position, onClose, onRename }: TaskContextMenuProps) {
  const ctx = useTaskActionContext()
  const { isArchivedView } = ctx
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 主菜单作用域：仅当没有子菜单被悬停时才处理 ↑↓/Enter
  const { active: mainActive } = useMenuScope('main')

  function handlePin() {
    ctx.onTogglePin(task.id)
    onClose()
  }

  function handleDuplicate() {
    ctx.onDuplicate(task.id)
    onClose()
  }

  function handleDeleteClick() {
    setShowDeleteConfirm(true)
  }

  function handleDeleteConfirm() {
    ctx.onDelete(task.id)
    onClose()
    setShowDeleteConfirm(false)
  }

  function handleDeleteCancel() {
    setShowDeleteConfirm(false)
    onClose()
  }

  function handleAddSubtask() {
    // 展开父任务 + 请求聚焦既有「添加子任务…」输入框；不创建空子任务
    useUIStore.getState().openSubtaskInput(task.id)
    onClose()
  }

  const canAddSubtask =
    task.parent_id == null && !isArchivedView && !showDeleteConfirm

  // 构建可导航菜单项：删除确认面板展开时切换为「确认/取消」两项
  const items: MenuItemInfo[] = useMemo(() => {
    if (showDeleteConfirm) {
      return [
        { id: 'confirm-delete', label: '删除', onClick: handleDeleteConfirm },
        { id: 'cancel-delete', label: '取消', onClick: handleDeleteCancel },
      ]
    }
    if (isArchivedView) {
      return [
        {
          id: 'unarchive',
          label: '恢复任务',
          onClick: () => {
            ctx.onUnarchive(task.id)
            onClose()
          },
        },
        { id: 'delete', label: '删除', onClick: handleDeleteClick },
      ]
    }
    const list: MenuItemInfo[] = [
      {
        id: 'rename',
        label: '重命名',
        onClick: () => {
          // 先重命名再关闭：避免父组件 contextMenu 已被清空导致目标任务丢失
          onRename()
          onClose()
        },
      },
    ]
    if (canAddSubtask) {
      list.push({ id: 'add-subtask', label: '添加子任务', onClick: handleAddSubtask })
    }
    list.push(
      {
        id: 'archive',
        label: '归档',
        onClick: () => {
          ctx.onArchive(task.id)
          onClose()
        },
      },
      { id: 'pin', label: task.pinned ? '取消置顶' : '置顶', onClick: handlePin },
      { id: 'duplicate', label: '创建副本', onClick: handleDuplicate },
      { id: 'delete', label: '删除', onClick: handleDeleteClick },
    )
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeleteConfirm, isArchivedView, canAddSubtask, task.pinned, task.id, task.parent_id, onClose, onRename])

  const { selectedIndex } = useMenuKeyboard(items, onClose, {
    active: mainActive,
    resetKey: `${isArchivedView}-${showDeleteConfirm}`,
  })
  const selectedId = items[selectedIndex]?.id

  // 关闭逻辑：点击外部 / 其它右键 / 页面滚动 / close-context-menus。
  // 注意：菜单内部滚动/滚轮不得关闭菜单（P1-CTX-480 滚动 bug）。
  useEffect(() => {
    function closeMenu() {
      onClose()
      setShowDeleteConfirm(false)
    }
    function isInsideMenu(target: EventTarget | null) {
      return !!(menuRef.current && target instanceof Node && menuRef.current.contains(target))
    }
    function handleClickOutside(e: MouseEvent) {
      if (!isInsideMenu(e.target)) closeMenu()
    }
    function handleContextMenu(e: MouseEvent) {
      // 菜单内右键仅 preventDefault，不关闭（由 onContextMenu 处理）
      if (isInsideMenu(e.target)) return
      closeMenu()
    }
    function handleScroll(e: Event) {
      // 捕获阶段：菜单内滚动（含点滑轨）不要关闭
      if (isInsideMenu(e.target)) return
      closeMenu()
    }
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClickOutside)
      window.addEventListener('contextmenu', handleContextMenu)
      window.addEventListener('scroll', handleScroll, true)
    }, 0)
    document.addEventListener('close-context-menus', closeMenu)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('click', handleClickOutside)
      window.removeEventListener('contextmenu', handleContextMenu)
      window.removeEventListener('scroll', handleScroll, true)
      document.removeEventListener('close-context-menus', closeMenu)
    }
  }, [onClose])

  // P1-CTX-480：Portal 到 body；明确 height 约束 flex 滚动；危险区钉底。
  const [adjustedPos, setAdjustedPos] = useState(position)
  const [menuHeight, setMenuHeight] = useState<number>(320)
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const margin = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    const menuWidth = el.offsetWidth || 208
    // 窄窗尽量占满可用高度，让更多项可滚到
    const viewportMax = Math.max(240, vh - margin * 2)

    let x = position.x
    let y = position.y
    if (x + menuWidth > vw - margin) {
      x = Math.max(margin, vw - menuWidth - margin)
    }
    if (x < margin) x = margin

    // 先放开高度测自然内容高度（jsdom 下 scrollHeight 可能为 0，回退估算值）
    el.style.height = 'auto'
    el.style.maxHeight = 'none'
    const measured = el.scrollHeight
    const contentHeight = measured > 0 ? measured : Math.min(280, viewportMax)

    // 若向下放不下，上移；最终高度 = min(内容, 可用视口)
    let finalHeight = Math.min(contentHeight, viewportMax)
    if (y + finalHeight > vh - margin) {
      y = Math.max(margin, vh - finalHeight - margin)
    }
    if (y < margin) y = margin
    const available = Math.max(160, vh - y - margin)
    finalHeight = Math.min(contentHeight, available, viewportMax)
    if (finalHeight < 160) finalHeight = Math.min(160, viewportMax)

    setMenuHeight(finalHeight)
    setAdjustedPos({ x, y })
  }, [position, showDeleteConfirm, isArchivedView, canAddSubtask])

  // 选中项高亮：垂直按钮用 accent-light 背景
  const rowHighlight = (id: string) => (selectedId === id ? 'bg-[var(--color-accent-light)]' : '')
  const confirmHighlight = (id: string) => (selectedId === id ? 'ring-2 ring-[var(--color-accent)]/40' : '')

const menu = (
    <div
      ref={menuRef}
      data-testid="task-context-menu"
      data-confirm={showDeleteConfirm ? 'true' : 'false'}
      className="fixed z-[200] flex flex-col overflow-hidden bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] w-52 animate-scale-in origin-top-left"
      style={{
        left: adjustedPos.x,
        top: adjustedPos.y,
        boxShadow: 'var(--shadow-dropdown)',
        // 确认态改为内容自适应高度，避免留下大块空白
        height: showDeleteConfirm ? 'auto' : menuHeight,
        maxHeight: showDeleteConfirm ? undefined : menuHeight,
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onWheel={(e) => e.stopPropagation()}
    >
      {showDeleteConfirm ? (
        // 确认态：只渲染紧凑确认面板，不再保留空的 flex 滚动区
        <div
          className="px-3 py-2"
          data-testid="ctx-danger-zone"
        >
          <div data-testid="ctx-delete-confirm">
            <div className="text-xs font-medium text-[var(--color-text-primary)] mb-1">删除任务？</div>
            <div className="text-xs text-[var(--color-text-secondary)] mb-2">
              删除后将移入回收站，可在回收站恢复。
            </div>
            <div className="flex items-center gap-2">
              <button
                data-testid="ctx-delete-confirm-btn"
                onClick={handleDeleteConfirm}
                className={`flex-1 text-xs text-white bg-[var(--color-danger)] hover:brightness-110 rounded py-1.5 transition-colors ${confirmHighlight('confirm-delete')}`}
              >
                删除
              </button>
              <button
                data-testid="ctx-delete-cancel-btn"
                onClick={handleDeleteCancel}
                className={`flex-1 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-tertiary)]/80 rounded py-1.5 transition-colors ${confirmHighlight('cancel-delete')}`}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 可滚动主内容：父级明确 height + min-h-0，滚轮/滑轨可用 */}
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
            data-testid="ctx-scroll-body"
            style={{ overscrollBehavior: 'contain' }}
            onWheel={(e) => e.stopPropagation()}
          >
            {!isArchivedView && (
              <button
                data-testid="ctx-rename"
                onClick={() => {
                  onRename()
                  onClose()
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors ${rowHighlight('rename')}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                重命名
              </button>
            )}

            {canAddSubtask && (
              <button
                data-testid="ctx-add-subtask"
                onClick={handleAddSubtask}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors ${rowHighlight('add-subtask')}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                添加子任务
              </button>
            )}

            {isArchivedView ? (
              <button
                data-testid="ctx-unarchive"
                onClick={() => {
                  ctx.onUnarchive(task.id)
                  onClose()
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-success)] hover:bg-[var(--color-success)]/10 transition-colors ${rowHighlight('unarchive')}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                  />
                </svg>
                恢复任务
              </button>
            ) : (
              <button
                data-testid="ctx-archive"
                onClick={() => {
                  ctx.onArchive(task.id)
                  onClose()
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors ${rowHighlight('archive')}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  />
                </svg>
                归档
              </button>
            )}

            {!isArchivedView && <DateMenu task={task} onClose={onClose} />}
            {!isArchivedView && <PriorityMenu task={task} onClose={onClose} />}
            {!isArchivedView && <RepeatMenu task={task} onClose={onClose} />}
            {!isArchivedView && <ReminderMenu task={task} onClose={onClose} />}

            {!isArchivedView && (
              <>
                <div className="border-t border-[var(--color-border-light)] my-1" />
                <button
                  data-testid="ctx-pin"
                  onClick={handlePin}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    task.pinned
                      ? 'text-[var(--color-warning)] bg-[var(--color-warning)]/10'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                  } ${rowHighlight('pin')}`}
                >
                  <svg
                    className="w-4 h-4"
                    fill={task.pinned ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                    />
                  </svg>
                  {task.pinned ? '取消置顶' : '置顶'}
                </button>
              </>
            )}

            {!isArchivedView && <TagMenu task={task} onClose={onClose} />}
            {!isArchivedView && (
              <button
                data-testid="ctx-duplicate"
                onClick={handleDuplicate}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors ${rowHighlight('duplicate')}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                创建副本
              </button>
            )}
          </div>

          {/* 底部固定危险区 */}
          <div
            className="shrink-0 border-t border-[var(--color-border-light)] bg-[var(--color-surface)] rounded-b-lg"
            data-testid="ctx-danger-zone"
          >
            <button
              data-testid="ctx-delete"
              onClick={handleDeleteClick}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors ${rowHighlight('delete')}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              删除
            </button>
          </div>
        </>
      )}
    </div>
  )

  // 挂到 body：彻底脱离任务行/虚拟列表的 transform 与 overflow 裁切
  if (typeof document === 'undefined') return menu
  return createPortal(menu, document.body)
}
