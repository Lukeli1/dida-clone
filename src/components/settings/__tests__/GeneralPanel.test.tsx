import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { GeneralPanel } from '../GeneralPanel'
import { useUIStore } from '../../../stores/uiStore'
import {
  ALWAYS_VISIBLE_SIDEBAR_ITEMS,
  SIDEBAR_VISIBLE_ITEMS_KEY,
  TOGGLEABLE_SIDEBAR_ITEMS,
  createDefaultSidebarVisibility,
} from '../../../utils/sidebarVisibility'
import { STORAGE_KEYS } from '../../../config/localStorageKeys'
import { DEFAULT_CALENDAR_VIEW_OPTIONS } from '../../../utils/calendarUtils'
import { DEFAULT_CALENDAR_TASK_DRAG_ACTIONS, getCalendarTaskDragActions } from '../../../utils/calendarTaskDragActions'

describe('GeneralPanel 侧边栏显示设置', () => {
  beforeEach(() => {
    localStorage.removeItem(SIDEBAR_VISIBLE_ITEMS_KEY)
    localStorage.removeItem('weekStart')
    localStorage.removeItem('confirmDelete')
    useUIStore.setState({
      visibleSidebarItems: createDefaultSidebarVisibility(),
      currentView: 'tasks',
      selectedListId: null,
      selectedTagId: null,
    })
  })

  it('仅显示可隐藏入口的 Toggle，核心入口没有 Toggle', () => {
    render(<GeneralPanel />)
    expect(screen.getByTestId('sidebar-visibility-settings')).toBeInTheDocument()

    for (const item of TOGGLEABLE_SIDEBAR_ITEMS) {
      expect(screen.getByTestId(`sidebar-visibility-row-${item.id}`)).toBeInTheDocument()
      expect(screen.getByText(item.label)).toBeInTheDocument()
    }

    for (const id of ALWAYS_VISIBLE_SIDEBAR_ITEMS) {
      expect(screen.queryByTestId(`sidebar-visibility-row-${id}`)).not.toBeInTheDocument()
    }
    // 文案中说明始终显示，但无对应开关行
    expect(screen.getByText(/全部任务、今日任务、设置始终显示/)).toBeInTheDocument()
  })

  it('关闭番茄钟后 store 立即更新为隐藏', () => {
    render(<GeneralPanel />)
    const row = screen.getByTestId('sidebar-visibility-row-pomodoro')
    const toggle = row.querySelector('[role="switch"]') as HTMLElement
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    expect(useUIStore.getState().isSidebarItemVisible('pomodoro')).toBe(false)
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('删除前确认区域说明归档与回收站差异', () => {
    render(<GeneralPanel />)
    const block = screen.getByTestId('delete-confirm-setting')
    expect(block).toHaveTextContent(/归档只是收纳任务/)
    expect(block).toHaveTextContent(/删除会移入回收站，可从回收站恢复/)
  })

  it('一周开始与删除确认具备稳定的可访问名称和状态', () => {
    render(<GeneralPanel />)
    const weekStart = screen.getByRole('group', { name: '一周开始于' })
    expect(weekStart).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '周日' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '周一' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: '周一' }))
    expect(screen.getByRole('button', { name: '周一' })).toHaveAttribute('aria-pressed', 'true')

    expect(screen.getByRole('switch', { name: '删除前确认' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: '在侧边栏显示习惯打卡' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('GeneralPanel 日历默认视图设置', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.calendarDefaultView)
  })

  it('展示日/周/月三个选项，未设置时默认选中月视图', () => {
    render(<GeneralPanel />)
    const setting = screen.getByTestId('calendar-default-view-setting')
    expect(setting).toHaveTextContent('进入日历时默认显示')
    for (const option of DEFAULT_CALENDAR_VIEW_OPTIONS) {
      expect(screen.getByTestId(`calendar-default-view-option-${option}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId('calendar-default-view-option-month')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('calendar-default-view-option-week')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('calendar-default-view-option-day')).toHaveAttribute('aria-pressed', 'false')
  })

  it('三种选项点击后均可保存到持久化存储', () => {
    render(<GeneralPanel />)
    for (const option of DEFAULT_CALENDAR_VIEW_OPTIONS) {
      fireEvent.click(screen.getByTestId(`calendar-default-view-option-${option}`))
      expect(localStorage.getItem(STORAGE_KEYS.calendarDefaultView)).toBe(option)
      expect(screen.getByTestId(`calendar-default-view-option-${option}`)).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('重启（重新挂载）后恢复已保存的偏好', () => {
    const first = render(<GeneralPanel />)
    fireEvent.click(screen.getByTestId('calendar-default-view-option-week'))
    expect(localStorage.getItem(STORAGE_KEYS.calendarDefaultView)).toBe('week')
    first.unmount()

    // 模拟应用重启：组件重新挂载，从持久化存储恢复选中态
    render(<GeneralPanel />)
    expect(screen.getByTestId('calendar-default-view-option-week')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('calendar-default-view-option-month')).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('GeneralPanel 日历任务拖拽动作设置', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.calendarTaskDragActions)
  })

  it('默认左侧置顶、右侧删除，并显示当前值与全部动作选项', () => {
    render(<GeneralPanel />)
    expect(screen.getByTestId('calendar-task-drag-actions-setting')).toHaveTextContent('日历任务拖拽动作')

    const left = screen.getByRole('combobox', { name: '向左拖拽动作' })
    const right = screen.getByRole('combobox', { name: '向右拖拽动作' })
    expect(left).toHaveValue('pin')
    expect(right).toHaveValue('delete')
    expect(screen.getByTestId('calendar-task-drag-actions-current')).toHaveTextContent('向左「置顶」，向右「删除」')

    for (const label of [
      '无操作',
      '置顶',
      '取消置顶',
      '删除',
      '标记完成',
      '取消完成',
      '将过期任务移动到当前时间',
      '清除日期',
    ]) {
      expect(screen.getAllByRole('option', { name: label }).length).toBeGreaterThan(0)
    }
  })

  it('修改左右动作后立即持久化，并可重新挂载恢复', () => {
    const first = render(<GeneralPanel />)
    fireEvent.change(screen.getByRole('combobox', { name: '向左拖拽动作' }), {
      target: { value: 'complete' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: '向右拖拽动作' }), {
      target: { value: 'move-overdue-to-now' },
    })

    expect(getCalendarTaskDragActions()).toEqual({ left: 'complete', right: 'move-overdue-to-now' })
    expect(screen.getByTestId('calendar-task-drag-actions-current')).toHaveTextContent(
      '向左「标记完成」，向右「将过期任务移动到当前时间」',
    )
    first.unmount()

    render(<GeneralPanel />)
    expect(screen.getByRole('combobox', { name: '向左拖拽动作' })).toHaveValue('complete')
    expect(screen.getByRole('combobox', { name: '向右拖拽动作' })).toHaveValue('move-overdue-to-now')
  })

  it('恢复默认按钮将左右动作重置为置顶 / 删除', () => {
    render(<GeneralPanel />)
    fireEvent.change(screen.getByRole('combobox', { name: '向左拖拽动作' }), {
      target: { value: 'none' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: '向右拖拽动作' }), {
      target: { value: 'unpin' },
    })
    fireEvent.click(screen.getByRole('button', { name: '恢复默认拖拽动作' }))

    expect(screen.getByRole('combobox', { name: '向左拖拽动作' })).toHaveValue(DEFAULT_CALENDAR_TASK_DRAG_ACTIONS.left)
    expect(screen.getByRole('combobox', { name: '向右拖拽动作' })).toHaveValue(DEFAULT_CALENDAR_TASK_DRAG_ACTIONS.right)
    expect(getCalendarTaskDragActions()).toEqual({ left: 'pin', right: 'delete' })
  })

  it('损坏的持久化配置显示默认值并安全修复', () => {
    localStorage.setItem(STORAGE_KEYS.calendarTaskDragActions, '{broken')
    render(<GeneralPanel />)
    expect(screen.getByRole('combobox', { name: '向左拖拽动作' })).toHaveValue('pin')
    expect(screen.getByRole('combobox', { name: '向右拖拽动作' })).toHaveValue('delete')
    expect(getCalendarTaskDragActions()).toEqual({ left: 'pin', right: 'delete' })
  })
})
