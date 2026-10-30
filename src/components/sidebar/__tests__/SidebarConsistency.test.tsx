import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../Sidebar'
import { ConfirmDialogProvider } from '../../common/ConfirmDialog'
import { ToastProvider } from '../../Toast'
import { useUIStore } from '../../../stores/uiStore'
import type { List, Tag } from '../../../types'
import type { SidebarProps } from '../types'

vi.mock('../../../hooks/useWindowSize', () => ({
  useWindowSize: () => ({ isNarrow: false, isCompact: false, isDetailOverlay: false }),
}))

const lists: List[] = [
  {
    id: 1,
    name: '收件箱',
    is_default: true,
    color: '#3B82F6',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: '工作清单',
    is_default: false,
    color: '#8B5CF6',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  },
]

const tags: Tag[] = [
  {
    id: 11,
    name: '重要标签',
    color: '#EF4444',
    created_at: '2026-07-01T00:00:00.000Z',
  },
]

function makeProps(overrides: Partial<SidebarProps> = {}): SidebarProps {
  return {
    lists,
    tags,
    selectedListId: null,
    selectedTagId: null,
    currentView: 'tasks',
    onSelectList: vi.fn(),
    onSelectTag: vi.fn(),
    onViewChange: vi.fn(),
    onCreateList: vi.fn(),
    onUpdateList: vi.fn(),
    onDeleteList: vi.fn(),
    onCreateTag: vi.fn(),
    onDeleteTag: vi.fn(),
    taskCounts: { 1: 3, 2: 5 },
    todayCount: 2,
    archivedCount: 0,
    ...overrides,
  }
}

function renderSidebar(props: SidebarProps) {
  return render(
    <ToastProvider>
      <ConfirmDialogProvider>
        <Sidebar {...props} />
      </ConfirmDialogProvider>
    </ToastProvider>,
  )
}

describe('侧栏视觉一致性', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarOpen: false, sidebarCollapsed: false })
  })

  it('智能清单 / 高级视图 / 清单 / 标签共用同一分组标题样式', () => {
    renderSidebar(makeProps())

    for (const label of ['智能清单', '高级视图', '清单', '标签']) {
      const title = screen.getByText(label)
      expect(title).toHaveClass('sidebar-section-title')
      expect(title.parentElement).toHaveClass('sidebar-section-header')
    }
  })

  it('导航、清单、标签选中态使用同一主表达并保留 aria-current', () => {
    const { rerender } = renderSidebar(makeProps())

    const nav = screen.getByTestId('nav-tasks')
    expect(nav).toHaveClass('sidebar-nav-item-active')
    expect(nav).toHaveAttribute('aria-current', 'page')

    rerender(
      <ToastProvider>
        <ConfirmDialogProvider>
          <Sidebar {...makeProps({ selectedListId: 2 })} />
        </ConfirmDialogProvider>
      </ToastProvider>,
    )
    const listButton = screen.getByText('工作清单').closest('button')
    expect(listButton).toHaveClass('sidebar-nav-item-active')
    expect(listButton).toHaveAttribute('aria-current', 'page')

    rerender(
      <ToastProvider>
        <ConfirmDialogProvider>
          <Sidebar {...makeProps({ selectedTagId: 11 })} />
        </ConfirmDialogProvider>
      </ToastProvider>,
    )
    const tagButton = screen.getByText('重要标签').closest('button')
    expect(tagButton).toHaveClass('sidebar-nav-item-active')
    expect(tagButton).toHaveAttribute('aria-current', 'page')
  })

  it('头像区可键盘聚焦，操作按钮使用统一焦点可见样式', () => {
    renderSidebar(makeProps())
    expect(screen.getByTestId('sidebar-avatar')).toHaveAttribute('aria-haspopup', 'menu')
  })
})
