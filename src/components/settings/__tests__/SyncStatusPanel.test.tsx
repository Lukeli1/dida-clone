import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SyncStatus } from '../../../types/sync'
import { SyncStatusPanel } from '../SyncStatusPanel'

/**
 * 仅验证 SyncStatusPanel 的既有回调契约。
 * SyncPanel.handleSyncNow 的真实分支（WebDAV 强制下载、Git 走 syncNow）
 * 由 SyncPanel.test.tsx 覆盖。
 */

const status: SyncStatus = {
  enabled: true,
  ahead: 2,
  behind: 1,
  last_sync: new Date().toISOString(),
  has_conflict: true,
  conflict_message:
    '本地数据库与远程仓库在多个任务字段上存在冲突：任务标题、完成状态、截止日期、标签关联和重复规则均被同时修改。',
}

describe('SyncStatusPanel 回调契约', () => {
  it('立即同步传 false，使用远程版本传 true，稍后处理触发 dismiss', () => {
    const onSyncNow = vi.fn()
    const onDismissConflict = vi.fn()
    render(
      <SyncStatusPanel
        status={status}
        syncing={false}
        onSyncNow={onSyncNow}
        onDismissConflict={onDismissConflict}
      />,
    )

    fireEvent.click(screen.getByTestId('sync-now'))
    expect(onSyncNow).toHaveBeenLastCalledWith(false)

    fireEvent.click(screen.getByTestId('sync-use-remote'))
    expect(onSyncNow).toHaveBeenLastCalledWith(true)

    fireEvent.click(screen.getByTestId('sync-dismiss-conflict'))
    expect(onDismissConflict).toHaveBeenCalledTimes(1)
  })

  it('同步中禁用全部操作并标注 aria-busy', () => {
    render(
      <SyncStatusPanel status={status} syncing onSyncNow={vi.fn()} onDismissConflict={vi.fn()} />,
    )

    expect(screen.getByTestId('sync-now')).toBeDisabled()
    expect(screen.getByTestId('sync-now')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByTestId('sync-use-remote')).toBeDisabled()
    expect(screen.getByTestId('sync-use-remote')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByTestId('sync-dismiss-conflict')).toBeDisabled()
  })
})
