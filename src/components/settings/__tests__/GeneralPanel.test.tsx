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
})
