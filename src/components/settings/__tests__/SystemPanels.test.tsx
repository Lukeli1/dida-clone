import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialogProvider } from '../../common/ConfirmDialog'
import type { ToastApi } from '../../Toast'

vi.mock('../../../api/snapshotApi', () => ({
  snapshotApi: {
    listSnapshots: vi.fn(),
    createSnapshot: vi.fn(),
    restoreSnapshot: vi.fn(),
    deleteSnapshot: vi.fn(),
  },
}))

vi.mock('../../../api/syncLogApi', () => ({
  syncLogApi: {
    listLogs: vi.fn(),
    clearLogs: vi.fn(),
  },
}))

import { snapshotApi } from '../../../api/snapshotApi'
import { syncLogApi } from '../../../api/syncLogApi'
import { DataPanel } from '../system/DataPanel'
import { SnapshotPanel } from '../system/SnapshotPanel'
import { SyncLogPanel } from '../system/SyncLogPanel'
import { ErrorLogPanel } from '../system/ErrorLogPanel'

const LONG_REASON =
  '导入前自动快照：包含一个用于验证窄屏换行的超长原因说明，覆盖清单、任务、标签、习惯和打卡记录。'
const LONG_SYNC_MESSAGE =
  'WebDAV 同步失败：无法连接到 https://dav.an-extremely-long-provider-name.example.com/remote.php/dav/files/layout-validator/，请检查网络、证书和凭据。'
const LONG_ERROR_MESSAGE =
  '渲染任务详情时发生异常：无法读取一个用于验证窄屏换行的超长错误信息，涉及清单、标签、截止日期、重复规则和附件记录。'
const LONG_ERROR_URL = 'https://app.local/settings/system?task=an-extremely-long-identifier&mode=detail'

function createToast(): ToastApi {
  return { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}

describe('系统设置子面板', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(snapshotApi.listSnapshots).mockResolvedValue([])
    vi.mocked(syncLogApi.listLogs).mockResolvedValue([])
  })

  it('数据导出/导入入口调用既有回调', () => {
    const onExport = vi.fn()
    const onSelectFile = vi.fn()
    render(<DataPanel exporting={null} onExport={onExport} onSelectFile={onSelectFile} />)

    expect(screen.getByTestId('data-export-grid')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('data-export-json'))
    expect(onExport).toHaveBeenLastCalledWith('json')
    fireEvent.click(screen.getByTestId('data-export-markdown'))
    expect(onExport).toHaveBeenLastCalledWith('markdown')
    fireEvent.click(screen.getByTestId('data-import-select'))
    expect(onSelectFile).toHaveBeenCalledTimes(1)
  })

  it('快照列表完整展示长原因，恢复/删除按钮具有明确名称', async () => {
    vi.mocked(snapshotApi.listSnapshots).mockResolvedValue([
      {
        file_name: 'snapshot-2026-10-21.db',
        reason: LONG_REASON,
        created_at: new Date().toISOString(),
        file_size: 1234567,
      },
    ])
    render(
      <ConfirmDialogProvider>
        <SnapshotPanel toast={createToast()} />
      </ConfirmDialogProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(LONG_REASON)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: `恢复快照「${LONG_REASON}」` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `删除快照「${LONG_REASON}」` })).toBeInTheDocument()
  })

  it('同步日志完整展示长消息与时间', async () => {
    vi.mocked(syncLogApi.listLogs).mockResolvedValue([
      {
        timestamp: new Date().toISOString(),
        action: 'sync_error',
        sync_type: 'webdav',
        status: 'error',
        message: LONG_SYNC_MESSAGE,
      },
    ])
    render(<SyncLogPanel toast={createToast()} />)

    await waitFor(() => {
      expect(screen.getByTestId('sync-log-list')).toHaveTextContent(LONG_SYNC_MESSAGE)
    })
    expect(screen.getByText('错误')).toBeInTheDocument()
    expect(screen.getByText('WEBDAV')).toBeInTheDocument()
  })

  it('错误日志展开按钮暴露 aria-expanded 与详情区域', async () => {
    localStorage.setItem(
      'error_logs',
      JSON.stringify([
        {
          id: 'error-1',
          timestamp: new Date().toISOString(),
          message: LONG_ERROR_MESSAGE,
          stack: 'Error: boom\n    at longFunction (src/very-long-file-name.ts:1:1)',
          componentStack: '\n    in TaskDetail',
          url: LONG_ERROR_URL,
          userAgent: 'mock',
        },
      ]),
    )
    render(<ErrorLogPanel toast={createToast()} />)

    const summary = screen.getByRole('button', { name: new RegExp('渲染任务详情时发生异常') })
    expect(summary).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(summary)

    expect(summary).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(LONG_ERROR_URL)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '错误详情' })).toBeInTheDocument()
    expect(screen.getByText(/at longFunction/)).toBeInTheDocument()
  })
})
