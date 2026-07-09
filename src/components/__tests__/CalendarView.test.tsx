import { act, fireEvent, render, screen } from '@testing-library/react'
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

vi.mock('../../stores/calendarStore', () => ({
  useCalendarStore: (selector: (s: any) => any) =>
    selector({
      filters: mockFilters,
      setListId: vi.fn(),
      setTagId: vi.fn(),
      setPriority: vi.fn(),
      setShowCompleted: vi.fn(),
      setAllDayOnly: vi.fn(),
      resetFilters: vi.fn(),
    }),
}))

// --- Mock child components to capture received props ---

// Capture the last tasks prop passed to ViewRenderer
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
        {/* Render toggle buttons for testing callbacks */}
        <button data-testid="vr-task-click" onClick={() => props.onTaskClick(99)}>
          TaskClick
        </button>
        <button data-testid="vr-toggle-task" onClick={() => props.onToggleTask(99)}>
          ToggleTask
        </button>
        <button data-testid="vr-update-task" onClick={() => props.onUpdateTask(99, { title: 'updated' })}>
          UpdateTask
        </button>
      </div>
    )
  },
}))

// Capture the last tasks prop passed to TaskSidebar
let sidebarTasks: Task[] = []
let sidebarOpen = false

vi.mock('../calendar/TaskSidebar', () => ({
  TaskSidebar: (props: any) => {
    sidebarTasks = props.tasks
    sidebarOpen = props.open
    return (
      <div data-testid="task-sidebar-mock">
        <span data-testid="ts-task-count">{props.tasks.length}</span>
        <button data-testid="ts-task-click" onClick={() => props.onTaskClick(42)}>
          SidebarTaskClick
        </button>
      </div>
    )
  },
}))

// Mock CalendarToolbar to allow controlling viewMode changes
let capturedOnChangeView: (mode: any) => void = vi.fn()
vi.mock('../calendar/CalendarToolbar', () => ({
  CalendarToolbar: (props: any) => {
    capturedOnChangeView = props.onChangeView
    return (
      <div data-testid="calendar-toolbar-mock">
        <button data-testid="toolbar-toggle-sidebar" onClick={props.onToggleSidebar}>
          ToggleSidebar
        </button>
      </div>
    )
  },
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
  const defaultProps: React.ComponentProps<typeof CalendarView> = {
    tasks,
    lists,
    onTaskClick: handlers?.onTaskClick ?? vi.fn(),
    onToggleTask: handlers?.onToggleTask ?? vi.fn(),
    onMoveTask: handlers?.onMoveTask ?? vi.fn(),
    onCreateTask: handlers?.onCreateTask ?? vi.fn(),
    onCreateTaskOnRange: handlers?.onCreateTaskOnRange ?? vi.fn(),
    onUpdateTask: handlers?.onUpdateTask ?? vi.fn(),
    actions: new Proxy({}, { get: () => vi.fn() }) as any,
  }
  return render(<CalendarView {...defaultProps} />)
}

describe('CalendarView 集成测试', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFilters = { listId: null, tagId: null, priority: null, showCompleted: true, allDayOnly: false }
    viewRendererTasks = []
    sidebarTasks = []
    viewRendererViewMode = ''
    sidebarOpen = false
  })

  describe('过滤后 visibleTasks 透传', () => {
    it('默认过滤条件时所有任务传递给 ViewRenderer 和 TaskSidebar', () => {
      const tasks = [makeTask(1), makeTask(2, { completed: true })]
      renderCalendarView(tasks)

      expect(screen.getByTestId('view-renderer-mock')).toBeInTheDocument()
      expect(viewRendererTasks).toHaveLength(2)
      expect(screen.getByTestId('task-sidebar-mock')).toBeInTheDocument()
      // TaskSidebar 进一步过滤已完成，只展示未完成
      expect(sidebarTasks).toHaveLength(2) // 传入的是 visibleTasks，sidebar 内部自己过滤
    })

    it('listId 过滤后只传递匹配任务给 ViewRenderer', () => {
      mockFilters = { listId: 2, tagId: null, priority: null, showCompleted: true, allDayOnly: false }
      const tasks = [makeTask(1, { list_id: 1 }), makeTask(2, { list_id: 2 })]
      renderCalendarView(tasks)

      expect(viewRendererTasks.map((t) => t.id)).toEqual([2])
    })

    it('showCompleted=false 时已完成任务不传递给 ViewRenderer', () => {
      mockFilters = { listId: null, tagId: null, priority: null, showCompleted: false, allDayOnly: false }
      const tasks = [makeTask(1, { completed: false }), makeTask(2, { completed: true })]
      renderCalendarView(tasks)

      expect(viewRendererTasks.map((t) => t.id)).toEqual([1])
    })

    it('priority 过滤后只传递匹配优先级的任务', () => {
      mockFilters = { listId: null, tagId: null, priority: 1, showCompleted: true, allDayOnly: false }
      const tasks = [makeTask(1, { priority: 0 }), makeTask(2, { priority: 1 }), makeTask(3, { priority: 1 })]
      renderCalendarView(tasks)

      expect(viewRendererTasks.map((t) => t.id)).toEqual([2, 3])
    })

    it('allDayOnly=true 时只传递全天任务', () => {
      mockFilters = { listId: null, tagId: null, priority: null, showCompleted: true, allDayOnly: true }
      const tasks = [
        makeTask(1, { all_day: true }),
        makeTask(2, { all_day: false, due_date: '2026-07-03T09:00:00' }),
      ]
      renderCalendarView(tasks)

      expect(viewRendererTasks.map((t) => t.id)).toEqual([1])
    })

    it('tagId 过滤后只传递包含该标签的任务', () => {
      mockFilters = { listId: null, tagId: 10, priority: null, showCompleted: true, allDayOnly: false }
      const tasks = [
        makeTask(1, { tag_ids: [10, 20] }),
        makeTask(2, { tag_ids: [30] }),
        makeTask(3, { tag_ids: [10] }),
      ]
      renderCalendarView(tasks)

      expect(viewRendererTasks.map((t) => t.id)).toEqual([1, 3])
    })
  })

  describe('过滤只影响展示，不影响回调', () => {
    it('ViewRenderer 的 onTaskClick 回调使用原始 taskId', () => {
      const onTaskClick = vi.fn()
      const tasks = [makeTask(1)]
      renderCalendarView(tasks, { onTaskClick })

      fireEvent.click(screen.getByTestId('vr-task-click'))
      expect(onTaskClick).toHaveBeenCalledWith(99)
    })

    it('ViewRenderer 的 onToggleTask 回调使用原始 taskId', () => {
      const onToggleTask = vi.fn()
      const tasks = [makeTask(1)]
      renderCalendarView(tasks, { onToggleTask })

      fireEvent.click(screen.getByTestId('vr-toggle-task'))
      expect(onToggleTask).toHaveBeenCalledWith(99)
    })

    it('ViewRenderer 的 onUpdateTask 回调使用原始 taskId', () => {
      const onUpdateTask = vi.fn()
      const tasks = [makeTask(1)]
      renderCalendarView(tasks, { onUpdateTask })

      fireEvent.click(screen.getByTestId('vr-update-task'))
      expect(onUpdateTask).toHaveBeenCalledWith(99, { title: 'updated' })
    })

    it('TaskSidebar 的 onTaskClick 回调使用原始 taskId', () => {
      const onTaskClick = vi.fn()
      const tasks = [makeTask(1)]
      renderCalendarView(tasks, { onTaskClick })

      fireEvent.click(screen.getByTestId('ts-task-click'))
      expect(onTaskClick).toHaveBeenCalledWith(42)
    })
  })

  describe('视图切换不丢失过滤条件', () => {
    it('切换视图模式后过滤条件仍然生效', () => {
      mockFilters = { listId: null, tagId: null, priority: null, showCompleted: false, allDayOnly: false }
      const tasks = [makeTask(1, { completed: false }), makeTask(2, { completed: true })]
      renderCalendarView(tasks)

      // 初始 month 视图：已完成任务被过滤
      expect(viewRendererTasks.map((t) => t.id)).toEqual([1])
      expect(viewRendererViewMode).toBe('month')

      // 切换到 week 视图
      act(() => {
        capturedOnChangeView('week')
      })
      expect(viewRendererViewMode).toBe('week')
      // 过滤条件仍然生效
      expect(viewRendererTasks.map((t) => t.id)).toEqual([1])

      // 切换到 agenda 视图
      act(() => {
        capturedOnChangeView('agenda')
      })
      expect(viewRendererViewMode).toBe('agenda')
      expect(viewRendererTasks.map((t) => t.id)).toEqual([1])
    })

    it('切换到 day 视图后 listId 过滤仍然生效', () => {
      mockFilters = { listId: 2, tagId: null, priority: null, showCompleted: true, allDayOnly: false }
      const tasks = [makeTask(1, { list_id: 1 }), makeTask(2, { list_id: 2 })]
      renderCalendarView(tasks)

      act(() => {
        capturedOnChangeView('day')
      })
      expect(viewRendererViewMode).toBe('day')
      expect(viewRendererTasks.map((t) => t.id)).toEqual([2])
    })
  })

  describe('侧边栏开关', () => {
    it('点击侧边栏切换按钮打开侧边栏', () => {
      renderCalendarView([makeTask(1)])
      expect(sidebarOpen).toBe(false)

      fireEvent.click(screen.getByTestId('toolbar-toggle-sidebar'))
      expect(sidebarOpen).toBe(true)
    })

    it('侧边栏打开后也只收到 visibleTasks', () => {
      mockFilters = { listId: 1, tagId: null, priority: null, showCompleted: true, allDayOnly: false }
      const tasks = [makeTask(1, { list_id: 1 }), makeTask(2, { list_id: 2 })]
      renderCalendarView(tasks)

      fireEvent.click(screen.getByTestId('toolbar-toggle-sidebar'))
      expect(sidebarOpen).toBe(true)
      expect(sidebarTasks.map((t) => t.id)).toEqual([1])
    })
  })
})
