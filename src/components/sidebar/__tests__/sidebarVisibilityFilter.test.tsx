import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewSwitcher } from '../ViewSwitcher'
import { useUIStore } from '../../../stores/uiStore'
import {
  SIDEBAR_VISIBLE_ITEMS_KEY,
  createDefaultSidebarVisibility,
  isSidebarItemVisible,
} from '../../../utils/sidebarVisibility'

// 折叠导航过滤逻辑与 Sidebar.CollapsedNav 一致：复用 isSidebarItemVisible
function filterCollapsedIds(ids: string[], visibility: Record<string, boolean>) {
  return ids.filter((id) => isSidebarItemVisible(id, visibility))
}

describe('侧边栏完整态与折叠态可见性一致', () => {
  beforeEach(() => {
    localStorage.removeItem(SIDEBAR_VISIBLE_ITEMS_KEY)
    useUIStore.setState({
      visibleSidebarItems: createDefaultSidebarVisibility(),
      currentView: 'tasks',
      selectedListId: null,
      selectedTagId: null,
    })
  })

  it('关闭番茄钟后完整侧边栏不显示番茄钟', () => {
    useUIStore.getState().setSidebarItemVisible('pomodoro', false)
    render(
      <ViewSwitcher
        currentView="tasks"
        selectedListId={null}
        onViewChange={vi.fn()}
        onSelectList={vi.fn()}
        onSelectTag={vi.fn()}
        totalTasks={0}
        todayCount={0}
        archivedCount={0}
      />,
    )
    expect(screen.queryByTestId('nav-pomodoro')).not.toBeInTheDocument()
    expect(screen.getByTestId('nav-tasks')).toBeInTheDocument()
    expect(screen.getByTestId('nav-today')).toBeInTheDocument()
  })

  it('同一入口在折叠态过滤结果中也不显示，恢复后两边都显示', () => {
    const collapsedIds = [
      'tasks',
      'today',
      'calendar',
      'quadrant',
      'stats',
      'pomodoro',
      'habit',
      'template',
      'goals',
      'ai',
    ]

    useUIStore.getState().setSidebarItemVisible('pomodoro', false)
    const visibility = useUIStore.getState().visibleSidebarItems

    // 完整态
    render(
      <ViewSwitcher
        currentView="tasks"
        selectedListId={null}
        onViewChange={vi.fn()}
        onSelectList={vi.fn()}
        onSelectTag={vi.fn()}
        totalTasks={0}
        todayCount={0}
        archivedCount={0}
      />,
    )
    expect(screen.queryByTestId('nav-pomodoro')).not.toBeInTheDocument()

    // 折叠态同一配置
    expect(filterCollapsedIds(collapsedIds, visibility)).not.toContain('pomodoro')
    expect(filterCollapsedIds(collapsedIds, visibility)).toContain('tasks')

    // 恢复
    act(() => {
      useUIStore.getState().setSidebarItemVisible('pomodoro', true)
    })
    const restored = useUIStore.getState().visibleSidebarItems
    expect(filterCollapsedIds(collapsedIds, restored)).toContain('pomodoro')
    expect(isSidebarItemVisible('pomodoro', restored)).toBe(true)
  })

  it('隐藏全部高级视图后不渲染高级视图分组标题', () => {
    for (const id of ['quadrant', 'pomodoro', 'habit', 'template', 'goals'] as const) {
      useUIStore.getState().setSidebarItemVisible(id, false)
    }
    render(
      <ViewSwitcher
        currentView="tasks"
        selectedListId={null}
        onViewChange={vi.fn()}
        onSelectList={vi.fn()}
        onSelectTag={vi.fn()}
        totalTasks={0}
        todayCount={0}
        archivedCount={0}
      />,
    )
    expect(screen.queryByText('高级视图')).not.toBeInTheDocument()
    expect(screen.getByText('智能清单')).toBeInTheDocument()
  })
})
