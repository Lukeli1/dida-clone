import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ListSection } from '../ListSection'
import { TagSection } from '../TagSection'
import { ConfirmDialogProvider } from '../../common/ConfirmDialog'
import { ToastProvider } from '../../Toast'
import type { List, Tag } from '../../../types'

/**
 * 侧栏清单 / 标签右键菜单回归：本次审查补充了 Escape 关闭，
 * 同时锁定既有的「点击外部关闭 + 边界定位」不回退。
 */
const lists: List[] = [
  {
    id: 1,
    name: '收件箱',
    is_default: true,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: '工作清单',
    is_default: false,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  },
]

const tags: Tag[] = [
  {
    id: 11,
    name: '重要标签',
    color: '#ef4444',
    created_at: '2026-07-01T00:00:00.000Z',
  },
]

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <ConfirmDialogProvider>{ui}</ConfirmDialogProvider>
    </ToastProvider>,
  )
}

describe('侧栏清单右键菜单', () => {
  function renderListSection() {
    return renderWithProviders(
      <ListSection
        lists={lists}
        selectedListId={null}
        currentView="tasks"
        onSelectList={vi.fn()}
        onViewChange={vi.fn()}
        onCreateList={vi.fn()}
        onUpdateList={vi.fn()}
        onDeleteList={vi.fn()}
        taskCounts={{}}
      />,
    )
  }

  it('右键非默认清单打开菜单，Escape 关闭', () => {
    renderListSection()
    fireEvent.contextMenu(screen.getByText('工作清单'), { clientX: 40, clientY: 80 })
    expect(screen.getByText('编辑名称')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('编辑名称')).not.toBeInTheDocument()
  })

  it('默认清单不响应右键菜单', () => {
    renderListSection()
    fireEvent.contextMenu(screen.getByText('收件箱'), { clientX: 40, clientY: 40 })
    expect(screen.queryByText('编辑名称')).not.toBeInTheDocument()
  })

  it('点击菜单外部关闭', () => {
    renderListSection()
    fireEvent.contextMenu(screen.getByText('工作清单'), { clientX: 40, clientY: 80 })
    expect(screen.getByText('编辑名称')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('编辑名称')).not.toBeInTheDocument()
  })
})

describe('侧栏标签右键菜单', () => {
  function renderTagSection() {
    return renderWithProviders(
      <TagSection
        tags={tags}
        selectedTagId={null}
        onSelectTag={vi.fn()}
        onSelectList={vi.fn()}
        onViewChange={vi.fn()}
        onCreateTag={vi.fn()}
        onDeleteTag={vi.fn()}
      />,
    )
  }

  it('右键标签打开菜单，Escape 关闭', async () => {
    renderTagSection()
    fireEvent.contextMenu(await screen.findByText('重要标签'), { clientX: 40, clientY: 80 })
    expect(await screen.findByText('删除标签')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('删除标签')).not.toBeInTheDocument()
  })
})
