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

describe('GeneralPanel 侧边栏显示设置', () => {
  beforeEach(() => {
    localStorage.removeItem(SIDEBAR_VISIBLE_ITEMS_KEY)
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
    expect(block).toHaveTextContent(/归档用于收纳任务，不会进入回收站/)
    expect(block).toHaveTextContent(/删除后将移入回收站，可在回收站恢复/)
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
