import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

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

const mockLists = [
  { id: 1, name: '工作', color: '#3b82f6', is_default: true, created_at: '', updated_at: '' },
  { id: 2, name: '生活', color: '#10b981', is_default: false, created_at: '', updated_at: '' },
]

const mockTags = [
  { id: 10, name: '重要', color: '#ef4444' },
  { id: 20, name: '日常', color: '#f59e0b' },
]

vi.mock('../../../stores/listStore', () => ({
  useListStore: (selector: (s: any) => any) => selector({ lists: mockLists }),
}))

vi.mock('../../../stores/tagStore', () => ({
  useTagStore: (selector: (s: any) => any) => selector({ tags: mockTags }),
}))

import { CalendarFilterMenu } from '../CalendarFilterMenu'

function renderMenu(onClose = vi.fn()) {
  return render(<CalendarFilterMenu onClose={onClose} />)
}

describe('CalendarFilterMenu 日历过滤菜单', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFilters = { listId: null, tagId: null, priority: null, showCompleted: true, allDayOnly: false }
  })

  describe('重置过滤', () => {
    it('无激活条件时不显示重置按钮', () => {
      renderMenu()
      expect(screen.queryByText('重置')).not.toBeInTheDocument()
    })

    it('有激活条件时显示重置按钮', () => {
      mockFilters = { listId: 1, tagId: null, priority: null, showCompleted: true, allDayOnly: false }
      renderMenu()
      expect(screen.getByText('重置')).toBeInTheDocument()
    })

    it('点击重置调用 resetFilters', () => {
      mockFilters = { listId: 1, tagId: null, priority: null, showCompleted: true, allDayOnly: false }
      renderMenu()
      fireEvent.click(screen.getByText('重置'))
      expect(mockResetFilters).toHaveBeenCalledOnce()
    })

    it('showCompleted=false 时显示重置按钮', () => {
      mockFilters = { listId: null, tagId: null, priority: null, showCompleted: false, allDayOnly: false }
      renderMenu()
      expect(screen.getByText('重置')).toBeInTheDocument()
    })

    it('allDayOnly=true 时显示重置按钮', () => {
      mockFilters = { listId: null, tagId: null, priority: null, showCompleted: true, allDayOnly: true }
      renderMenu()
      expect(screen.getByText('重置')).toBeInTheDocument()
    })
  })

  describe('清单过滤', () => {
    it('渲染全部清单选项', () => {
      renderMenu()
      const select = screen.getByDisplayValue('全部清单') as HTMLSelectElement
      expect(select).toBeInTheDocument()
      // 应有全部清单和工作、生活选项
      expect(screen.getByText('工作')).toBeInTheDocument()
      expect(screen.getByText('生活')).toBeInTheDocument()
    })

    it('选择清单调用 setListId', () => {
      renderMenu()
      const select = screen.getByDisplayValue('全部清单') as HTMLSelectElement
      fireEvent.change(select, { target: { value: '1' } })
      expect(mockSetListId).toHaveBeenCalledWith(1)
    })

    it('清空清单选择调用 setListId(null)', () => {
      mockFilters = { listId: 1, tagId: null, priority: null, showCompleted: true, allDayOnly: false }
      renderMenu()
      const select = screen.getByDisplayValue('工作') as HTMLSelectElement
      fireEvent.change(select, { target: { value: '' } })
      expect(mockSetListId).toHaveBeenCalledWith(null)
    })
  })

  describe('标签过滤', () => {
    it('渲染全部标签选项', () => {
      renderMenu()
      expect(screen.getByText('重要')).toBeInTheDocument()
      expect(screen.getByText('日常')).toBeInTheDocument()
    })

    it('选择标签调用 setTagId', () => {
      renderMenu()
      const select = screen.getByDisplayValue('全部标签') as HTMLSelectElement
      fireEvent.change(select, { target: { value: '10' } })
      expect(mockSetTagId).toHaveBeenCalledWith(10)
    })
  })

  describe('优先级过滤', () => {
    it('渲染全部/高/中/低/无 五个选项', () => {
      renderMenu()
      expect(screen.getByText('全部')).toBeInTheDocument()
      expect(screen.getByText('高')).toBeInTheDocument()
      expect(screen.getByText('中')).toBeInTheDocument()
      expect(screen.getByText('低')).toBeInTheDocument()
      expect(screen.getByText('无')).toBeInTheDocument()
    })

    it('点击高优先级调用 setPriority(1)', () => {
      renderMenu()
      fireEvent.click(screen.getByText('高'))
      expect(mockSetPriority).toHaveBeenCalledWith(1)
    })

    it('点击全部调用 setPriority(null)', () => {
      mockFilters = { listId: null, tagId: null, priority: 1, showCompleted: true, allDayOnly: false }
      renderMenu()
      fireEvent.click(screen.getByText('全部'))
      expect(mockSetPriority).toHaveBeenCalledWith(null)
    })
  })

  describe('显示已完成 toggle', () => {
    it('默认开启（showCompleted=true）', () => {
      renderMenu()
      expect(screen.getByText('显示已完成')).toBeInTheDocument()
    })

    it('点击切换调用 setShowCompleted', () => {
      renderMenu()
      fireEvent.click(screen.getByText('显示已完成'))
      expect(mockSetShowCompleted).toHaveBeenCalledWith(false)
    })
  })

  describe('仅全天任务 toggle', () => {
    it('默认关闭', () => {
      renderMenu()
      expect(screen.getByText('仅全天任务')).toBeInTheDocument()
    })

    it('点击切换调用 setAllDayOnly', () => {
      renderMenu()
      fireEvent.click(screen.getByText('仅全天任务'))
      expect(mockSetAllDayOnly).toHaveBeenCalledWith(true)
    })
  })

  describe('点击外部关闭', () => {
    it('点击面板外部触发 onClose', () => {
      const onClose = vi.fn()
      renderMenu(onClose)
      // 模拟点击面板外
      fireEvent.mouseDown(document.body)
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('点击面板内部不触发 onClose', () => {
      const onClose = vi.fn()
      renderMenu(onClose)
      // 点击面板内部的元素
      fireEvent.mouseDown(screen.getByText('日历过滤'))
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})
