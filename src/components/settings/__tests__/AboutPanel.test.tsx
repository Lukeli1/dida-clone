import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../Toast'

vi.mock('../../../api/updaterApi', () => ({
  checkForUpdate: vi.fn(),
  downloadAndInstall: vi.fn(),
}))

import { checkForUpdate, downloadAndInstall } from '../../../api/updaterApi'
import { AboutPanel } from '../AboutPanel'

const LONG_NOTES =
  '本次更新包含界面视觉优化、设置页响应式修复和多项可访问性改进。详细说明：修复窄屏下性能表格被裁切的问题；长日志与长快照原因改为完整换行。'

function renderPanel() {
  return render(
    <ToastProvider>
      <AboutPanel />
    </ToastProvider>,
  )
}

describe('AboutPanel 关于页', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkForUpdate).mockResolvedValue({ available: false })
    vi.mocked(downloadAndInstall).mockResolvedValue(undefined)
  })

  it('无更新时提示已是最新版本', async () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('check-update-btn'))

    await waitFor(() => {
      expect(checkForUpdate).toHaveBeenCalledTimes(1)
      expect(screen.getByText('已是最新版本')).toBeInTheDocument()
    })
  })

  it('发现新版本时展示长说明与更新入口', async () => {
    vi.mocked(checkForUpdate).mockResolvedValue({
      available: true,
      version: '1.48.0',
      notes: LONG_NOTES,
    })
    renderPanel()
    fireEvent.click(screen.getByTestId('check-update-btn'))

    const available = await screen.findByTestId('update-available')
    expect(available).toHaveAttribute('role', 'status')
    expect(screen.getByText('发现新版本 v1.48.0')).toBeInTheDocument()
    expect(available).toHaveTextContent(LONG_NOTES)
    expect(screen.getByTestId('update-now-btn')).toBeEnabled()
  })

  it('下载过程展示可访问进度条', async () => {
    vi.mocked(checkForUpdate).mockResolvedValue({
      available: true,
      version: '1.48.0',
      notes: LONG_NOTES,
    })
    vi.mocked(downloadAndInstall).mockImplementation(async (onProgress) => {
      onProgress?.({ chunkLength: 50, contentLength: 100 })
    })
    renderPanel()
    fireEvent.click(screen.getByTestId('check-update-btn'))
    const updateButton = await screen.findByTestId('update-now-btn')
    fireEvent.click(updateButton)

    const progress = await screen.findByRole('progressbar', { name: '更新下载进度' })
    expect(progress).toHaveAttribute('aria-valuemin', '0')
    expect(progress).toHaveAttribute('aria-valuemax', '100')
    expect(progress).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByText('下载中... 50%')).toBeInTheDocument()
    expect(screen.queryByTestId('update-now-btn')).not.toBeInTheDocument()
  })
})
