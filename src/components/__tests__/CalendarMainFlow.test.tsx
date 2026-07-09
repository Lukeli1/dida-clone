import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Task, List } from '../../types'

// --- Mock stores ---

let mockFilters = {
  listId: null as number | null,
  tagId: null as number | null,
  priority: null as number | null,
  showCompleted: true,
  allDayOnly: false,
}

const mockResetFilters = vi.fn(() => {
  mockFilters = { listId: null, tagId: null, priority: null, showCompleted: true, allDayOnly: false }
})
const mockSetListId = vi.fn()
const mockSetTagId = vi.fn()
const mockSetPriority = vi.fn()
const mockSetShowCompleted = vi.fn()
const mockSetAllDayOnly = vi.fn()

vi.mock('../../stores/calendarStore', () => ({
  useCalendarStore: (selector: (s: any) => any) =>
    selector({
      filters: mockFilters,
      setListId: mockSetListId,
      setTagId: mockSetTagId,
      setPriority: mockSetPriority,
      setShowCompleted: mockSetShowCompleted,
      setAllDayOnly: mockSetAllDayOnly,
      resetFilters: mockResetFilters,
    }),
}))

vi.mock('../../stores/listStore', () => ({
  useListStore: (selector: (s: any) => any) =>
    selector({
      lists: [
        { id: 1, name: '工作', color: '#3b82f6', is_default: true, created_at: '', updated_at: '' },
        { id: 2, name: '生活', color: '#10b981', is_default: false, created_at: '', updated_at: '' },
      ],
    }),
}))

vi.mock('../../stores/tagStore', () => ({
  useTagStore: (selector: (s: any) => any) =>
    selector({
      tags: [{ id: 10, name: '重要', color: '#ef4444' }],
    }),
}))

const mockSetAiPresetMessage = vi.fn()
const mockSetCurrentView = vi.fn()
vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector: (s: any) => any) =>
    selector({
      setAiPresetMessage: mockSetAiPresetMessage,
      setCurrentView: mockSetCurrentView,
    }),
}))

// --- Mock ViewRenderer to capture tasks and allow interaction ---

let viewRendererTasks: Task[] = []
let viewRendererViewMode: string = ''

vi.mock('../calendar/ViewRenderer', () => ({
  ViewRenderer: (props: any) => {
    viewRendererTasks = props.tasks
    viewRendererViewMode = props.viewMode
    return (
      <div data-testid="view-renderer-mock">
        <span data-testid="vr-task-count">{props.tasks.length}</span>
        <span data-testid="vr-view-mode">{props.viewMode}</span>
        {props.tasks.map((t: Task) => (
          <div key={t.id} data-testid={`vr-task-${t.id}`}>
            <button data-testid={`vr-click-${t.id}`} onClick={() => props.onTaskClick(t.id)}>
              Click {t.id}
            </button>
            <button data-testid={`vr-toggle-${t.id}`} onClick={() => props.onToggleTask(t.id)}>
              Toggle {t.id}
            </button>
          </div>
        ))}
      </div>
    )
  },
}))

vi.mock('../calendar/TaskSidebar', () => ({
  TaskSidebar: (props: any) => (
    <div data-testid="task-sidebar-mock">
      <span data-testid="ts-task-count">{props.tasks.length}</span>
    </div>
  ),
}))

import { CalendarView } from '../CalendarView'

const lists: List[] = [
  { id: 1, name: '工作', color: '#3b82f6', is_default: true, created_at: '', updated_at: '' },
  { id: 2, name: '生活', color: '#10b981', is_default: false, created_at: '', updated_at: '' },
]

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  const now = '2026-07-01T00:00:00'
  return {
    id,
    title: `任务 ${id}`,
    notes: null,
    priority: 0,
    due_date: '2026-07-03T09:00:00',
    end_date: null,
    all_day: false,
    reminder: null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: id,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

function renderCalendarView(tasks: Task[], handlers?: Partial<React.ComponentProps<typeof CalendarView>>) {
  return render(
    <CalendarView
      tasks={tasks}
      lists={lists}
      onTaskClick={handlers?.onTaskClick ?? vi.fn()}
      onToggleTask={handlers?.onToggleTask ?? vi.fn()}
      onMoveTask={handlers?.onMoveTask ?? vi.fn()}
      onCreateTask={handlers?.onCreateTask ?? vi.fn()}
      onCreateTaskOnRange={handlers?.onCreateTaskOnRange ?? vi.fn()}
      onUpdateTask={handlers?.onUpdateTask ?? vi.fn()}
      actions={new Proxy({}, { get: () => vi.fn() }) as any}
    />,
  )
}

describe('CalendarMainFlow 日历主流程集成测试', () => {
  // 此测试覆盖用户从进入日历到完成任务的主要操作路径，
  // 作为 E2E 测试的等效替代（E2E 环境因 Tauri IPC 不可用而受限）。

  beforeEach(() => {
    vi.clearAllMocks()
    mockFilters = { listId: null, tagId: null, priority: null, showCompleted: true, allDayOnly: false }
  })

  it('完整流程：进入日历 → 切换视图 → 打开过滤 → 点击任务 → 完成任务 → AI 排程', () => {
    const tasks = [
      makeTask(1, { title: '设计评审', list_id: 1, priority: 1 }),
      makeTask(2, { title: '写文档', list_id: 2, completed: true }),
      makeTask(3, { title: '测试代码', list_id: 1, priority: 2 }),
    ]

    const onTaskClick = vi.fn()
    const onToggleTask = vi.fn()

    // 1. 进入日历视图
    renderCalendarView(tasks, { onTaskClick, onToggleTask })

    // 验证日历已渲染，所有任务可见
    expect(screen.getByTestId('view-renderer-mock')).toBeInTheDocument()
    expect(viewRendererTasks).toHaveLength(3)
    expect(viewRendererViewMode).toBe('month')

    // 2. 通过真实 CalendarToolbar 切换到周视图
    fireEvent.click(screen.getByTitle('周视图'))
    expect(viewRendererViewMode).toBe('week')

    // 3. 切换到日程列表视图（通过更多视图菜单）
    fireEvent.click(screen.getByLabelText('更多视图'))
    fireEvent.click(screen.getByText('日程列表'))
    expect(viewRendererViewMode).toBe('agenda')

    // 4. 打开过滤菜单
    fireEvent.click(screen.getByLabelText('日历过滤'))
    expect(screen.getByText('清单')).toBeInTheDocument()

    // 5. 设置过滤：选择清单
    const listSelect = screen.getByDisplayValue('全部清单') as HTMLSelectElement
    fireEvent.change(listSelect, { target: { value: '1' } })
    expect(mockSetListId).toHaveBeenCalledWith(1)

    // 6. 点击任务触发 onTaskClick（使用原始 taskId）
    fireEvent.click(screen.getByTestId('vr-click-1'))
    expect(onTaskClick).toHaveBeenCalledWith(1)

    // 7. 完成任务触发 onToggleTask（使用原始 taskId）
    fireEvent.click(screen.getByTestId('vr-toggle-3'))
    expect(onToggleTask).toHaveBeenCalledWith(3)

    // 8. 关闭过滤菜单，打开 AI 排程菜单
    fireEvent.click(screen.getByLabelText('日历过滤')) // 关闭过滤菜单
    fireEvent.click(screen.getByTitle('AI 自动安排日程'))
    expect(screen.getByText('排程日期')).toBeInTheDocument()

    // 9. 点击开始排程生成 prompt 并跳转
    fireEvent.click(screen.getByText('开始排程'))
    expect(mockSetAiPresetMessage).toHaveBeenCalledOnce()
    expect(mockSetCurrentView).toHaveBeenCalledWith('ai')

    // 验证生成的 prompt 包含关键信息
    const presetMsg = mockSetAiPresetMessage.mock.calls[0][0] as string
    expect(presetMsg).toContain('帮我安排')
  })

  it('过滤 + 视图切换不丢失过滤条件：设置 showCompleted=false 后切换视图仍保持过滤', () => {
    const tasks = [
      makeTask(1, { completed: false }),
      makeTask(2, { completed: true }),
    ]

    renderCalendarView(tasks)

    // 初始所有任务可见
    expect(viewRendererTasks).toHaveLength(2)

    // 设置 showCompleted=false（模拟过滤生效）
    mockFilters = { listId: null, tagId: null, priority: null, showCompleted: false, allDayOnly: false }

    // 通过真实 CalendarToolbar 触发重渲染（切换视图）
    fireEvent.click(screen.getByTitle('周视图'))
    expect(viewRendererViewMode).toBe('week')
    // 过滤生效：已完成任务被隐藏
    expect(viewRendererTasks.map((t) => t.id)).toEqual([1])

    // 切换到 day 视图
    fireEvent.click(screen.getByTitle('日视图'))
    expect(viewRendererViewMode).toBe('day')
    expect(viewRendererTasks.map((t) => t.id)).toEqual([1])

    // 切换到 agenda 视图
    fireEvent.click(screen.getByLabelText('更多视图'))
    fireEvent.click(screen.getByText('日程列表'))
    expect(viewRendererViewMode).toBe('agenda')
    expect(viewRendererTasks.map((t) => t.id)).toEqual([1])
  })

  it('侧边栏只收到 visibleTasks 且过滤后同步更新', () => {
    const tasks = [
      makeTask(1, { list_id: 1 }),
      makeTask(2, { list_id: 2 }),
    ]

    renderCalendarView(tasks)

    // 打开侧边栏
    fireEvent.click(screen.getByLabelText('任务列表侧边栏'))

    // 初始所有任务可见
    expect(viewRendererTasks).toHaveLength(2)

    // 设置 listId=1 过滤
    mockFilters = { listId: 1, tagId: null, priority: null, showCompleted: true, allDayOnly: false }

    // 通过真实 CalendarToolbar 触发重渲染（切换视图）
    fireEvent.click(screen.getByTitle('周视图'))

    // ViewRenderer 和 TaskSidebar 都只收到过滤后的任务
    expect(viewRendererTasks.map((t) => t.id)).toEqual([1])
    expect(screen.getByTestId('ts-task-count').textContent).toBe('1')
  })
})
