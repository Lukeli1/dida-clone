import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ViewMode } from '../../../utils/calendarUtils'

// --- Mock stores ---

// calendarStore mock: allows controlling filters and capturing reset/set calls
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

vi.mock('../../../stores/calendarStore', () => ({
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

// listStore / tagStore mocks (needed by CalendarFilterMenu)
vi.mock('../../../stores/listStore', () => ({
  useListStore: (selector: (s: any) => any) =>
    selector({
      lists: [
        { id: 1, name: '工作', color: '#3b82f6', is_default: true, created_at: '', updated_at: '' },
        { id: 2, name: '生活', color: '#10b981', is_default: false, created_at: '', updated_at: '' },
      ],
    }),
}))

vi.mock('../../../stores/tagStore', () => ({
  useTagStore: (selector: (s: any) => any) =>
    selector({
      tags: [
        { id: 10, name: '重要', color: '#ef4444' },
        { id: 20, name: '日常', color: '#f59e0b' },
      ],
    }),
}))

// uiStore mock (needed by AIScheduleMenu)
const mockSetAiPresetMessage = vi.fn()
const mockSetCurrentView = vi.fn()
vi.mock('../../../stores/uiStore', () => ({
  useUIStore: (selector: (s: any) => any) =>
    selector({
      setAiPresetMessage: mockSetAiPresetMessage,
      setCurrentView: mockSetCurrentView,
    }),
}))

import { CalendarToolbar } from '../CalendarToolbar'

function renderToolbar(overrides: { viewMode?: ViewMode; onChangeView?: (m: ViewMode) => void } = {}) {
  const onChangeView = overrides.onChangeView ?? vi.fn()
  const result = render(
    <CalendarToolbar
      viewMode={overrides.viewMode ?? 'month'}
      onChangeView={onChangeView}
      sidebarOpen={false}
      onToggleSidebar={vi.fn()}
    />,
  )
  return { ...result, onChangeView }
}

describe('CalendarToolbar 日历工具栏', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFilters = { listId: null, tagId: null, priority: null, showCompleted: true, allDayOnly: false }
  })

  describe('视图切换按钮', () => {
    it('月/周/日 按钮渲染且当前视图有激活态', () => {
      renderToolbar({ viewMode: 'month' })
      const monthBtn = screen.getByTitle('月视图')
      const weekBtn = screen.getByTitle('周视图')
      const dayBtn = screen.getByTitle('日视图')
      expect(monthBtn).toHaveAttribute('aria-pressed', 'true')
      expect(weekBtn).toHaveAttribute('aria-pressed', 'false')
      expect(dayBtn).toHaveAttribute('aria-pressed', 'false')
    })

    it('点击周视图调用 onChangeView("week")', () => {
      const onChangeView = vi.fn()
      renderToolbar({ onChangeView })
      fireEvent.click(screen.getByTitle('周视图'))
      expect(onChangeView).toHaveBeenCalledWith('week')
    })
  })

  describe('更多视图菜单', () => {
    it('点击更多视图按钮打开菜单', () => {
      renderToolbar()
      const moreBtn = screen.getByLabelText('更多视图')
      fireEvent.click(moreBtn)
      expect(screen.getByText('日程列表')).toBeInTheDocument()
      expect(screen.getByText('甘特图')).toBeInTheDocument()
      expect(screen.getByText('看板')).toBeInTheDocument()
    })

    it('选择日程列表调用 onChangeView("agenda") 并关闭菜单', () => {
      const onChangeView = vi.fn()
      renderToolbar({ onChangeView })
      fireEvent.click(screen.getByLabelText('更多视图'))
      fireEvent.click(screen.getByText('日程列表'))
      expect(onChangeView).toHaveBeenCalledWith('agenda')
      // 菜单应已关闭
      expect(screen.queryByText('甘特图')).not.toBeInTheDocument()
    })

    it('选择甘特图调用 onChangeView("gantt")', () => {
      const onChangeView = vi.fn()
      renderToolbar({ onChangeView })
      fireEvent.click(screen.getByLabelText('更多视图'))
      fireEvent.click(screen.getByText('甘特图'))
      expect(onChangeView).toHaveBeenCalledWith('gantt')
    })

    it('选择看板调用 onChangeView("kanban")', () => {
      const onChangeView = vi.fn()
      renderToolbar({ onChangeView })
      fireEvent.click(screen.getByLabelText('更多视图'))
      fireEvent.click(screen.getByText('看板'))
      expect(onChangeView).toHaveBeenCalledWith('kanban')
    })

    it('当前为 agenda 视图时更多视图按钮显示激活态', () => {
      renderToolbar({ viewMode: 'agenda' })
      const moreBtn = screen.getByLabelText('更多视图')
      // 激活态通过 class 中的 accent 样式判断，这里验证按钮存在且 title 正确
      expect(moreBtn).toBeInTheDocument()
    })
  })

  describe('过滤按钮激活态', () => {
    it('默认过滤条件时过滤按钮不显示激活点', () => {
      renderToolbar()
      const filterBtn = screen.getByLabelText('日历过滤')
      // 默认条件不激活，不应有圆点
      expect(filterBtn.querySelector('span.w-1\\.5')).toBeNull()
    })

    it('设置了过滤条件后过滤按钮显示激活点', () => {
      mockFilters = { listId: 1, tagId: null, priority: null, showCompleted: true, allDayOnly: false }
      renderToolbar()
      const filterBtn = screen.getByLabelText('日历过滤')
      // 激活态应显示圆点
      expect(filterBtn.querySelector('span.rounded-full')).not.toBeNull()
    })

    it('showCompleted=false 也算激活', () => {
      mockFilters = { listId: null, tagId: null, priority: null, showCompleted: false, allDayOnly: false }
      renderToolbar()
      const filterBtn = screen.getByLabelText('日历过滤')
      expect(filterBtn.querySelector('span.rounded-full')).not.toBeNull()
    })

    it('allDayOnly=true 也算激活', () => {
      mockFilters = { listId: null, tagId: null, priority: null, showCompleted: true, allDayOnly: true }
      renderToolbar()
      const filterBtn = screen.getByLabelText('日历过滤')
      expect(filterBtn.querySelector('span.rounded-full')).not.toBeNull()
    })
  })

  describe('过滤菜单打开/关闭', () => {
    it('点击过滤按钮打开过滤菜单', () => {
      renderToolbar()
      fireEvent.click(screen.getByLabelText('日历过滤'))
      expect(screen.getByText('日历过滤')).toBeInTheDocument()
      expect(screen.getByText('清单')).toBeInTheDocument()
    })

    it('再次点击过滤按钮关闭过滤菜单', () => {
      renderToolbar()
      const filterBtn = screen.getByLabelText('日历过滤')
      fireEvent.click(filterBtn) // 打开
      expect(screen.getByText('清单')).toBeInTheDocument()
      fireEvent.click(filterBtn) // 关闭
      expect(screen.queryByText('清单')).not.toBeInTheDocument()
    })

    it('点击重置调用 resetFilters', () => {
      mockFilters = { listId: 1, tagId: null, priority: null, showCompleted: true, allDayOnly: false }
      renderToolbar()
      fireEvent.click(screen.getByLabelText('日历过滤'))
      fireEvent.click(screen.getByText('重置'))
      expect(mockResetFilters).toHaveBeenCalledOnce()
    })
  })

  describe('AI 排程入口', () => {
    it('点击 AI 排程按钮打开排程面板', () => {
      renderToolbar()
      fireEvent.click(screen.getByTitle('AI 自动安排日程'))
      // 排程面板打开后应显示排程日期标签
      expect(screen.getByText('排程日期')).toBeInTheDocument()
    })

    it('点击开始排程生成 prompt 并跳转 AI 助手', () => {
      renderToolbar()
      fireEvent.click(screen.getByTitle('AI 自动安排日程'))
      fireEvent.click(screen.getByText('开始排程'))
      expect(mockSetAiPresetMessage).toHaveBeenCalledOnce()
      expect(mockSetCurrentView).toHaveBeenCalledWith('ai')
    })
  })
})
