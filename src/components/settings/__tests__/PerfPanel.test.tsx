import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '../../Toast'
import { PerfPanel } from '../PerfPanel'

const LONG_NAME = 'loadAnExtremelyLongTaskCollectionForLayoutValidationWithNestedTagsAndSubtasks'

function renderPanel() {
  return render(
    <ToastProvider>
      <PerfPanel />
    </ToastProvider>,
  )
}

describe('PerfPanel 性能监控', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('空数据展示空态并禁用清空', () => {
    renderPanel()

    expect(screen.getByText('暂无性能数据')).toBeInTheDocument()
    expect(screen.getByTestId('perf-clear')).toBeDisabled()
    expect(screen.getByTestId('perf-refresh')).toBeEnabled()
  })

  it('展示完整操作名、五列统计和具名表头', () => {
    localStorage.setItem(
      'perf_records',
      JSON.stringify([
        { name: LONG_NAME, duration: 12.34, timestamp: Date.now() },
        { name: LONG_NAME, duration: 23.45, timestamp: Date.now() - 1 },
        { name: 'loadTasks', duration: 5.6, timestamp: Date.now() - 2 },
      ]),
    )
    renderPanel()

    expect(screen.getByTestId('perf-table')).toHaveAttribute('aria-label', '性能统计数据')
    expect(screen.getByRole('columnheader', { name: '操作名' })).toHaveAttribute('scope', 'col')
    expect(screen.getByRole('columnheader', { name: '次数' })).toHaveAttribute('scope', 'col')
    expect(screen.getByRole('columnheader', { name: '平均 (ms)' })).toHaveAttribute('scope', 'col')
    expect(screen.getByRole('columnheader', { name: '最大 (ms)' })).toHaveAttribute('scope', 'col')
    expect(screen.getByRole('columnheader', { name: '最近 (ms)' })).toHaveAttribute('scope', 'col')
    expect(screen.getByText(LONG_NAME)).toBeInTheDocument()
    expect(screen.getByText('17.90')).toBeInTheDocument()
    expect(screen.getByText('23.45')).toBeInTheDocument()
    expect(screen.getByText('12.34')).toBeInTheDocument()
    expect(screen.getByTestId('perf-clear')).toBeEnabled()
  })

  it('刷新重新读取记录并显示提示', async () => {
    renderPanel()
    expect(screen.getByText('暂无性能数据')).toBeInTheDocument()

    localStorage.setItem('perf_records', JSON.stringify([{ name: 'loadTags', duration: 8.8, timestamp: Date.now() }]))
    fireEvent.click(screen.getByTestId('perf-refresh'))

    await waitFor(() => {
      expect(screen.getByText('loadTags')).toBeInTheDocument()
      expect(screen.getByText('已刷新性能数据')).toBeInTheDocument()
    })
  })
})
