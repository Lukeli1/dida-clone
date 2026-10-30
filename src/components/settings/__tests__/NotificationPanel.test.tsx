import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../Toast'
import { useUIStore } from '../../../stores/uiStore'

vi.mock('../../../utils/notification', () => ({
  checkNotificationPermission: vi.fn(),
  requestNotificationPermission: vi.fn(),
  sendTestNotification: vi.fn(),
}))

import {
  checkNotificationPermission,
  requestNotificationPermission,
  sendTestNotification,
} from '../../../utils/notification'
import { NotificationPanel } from '../NotificationPanel'

function renderPanel() {
  return render(
    <ToastProvider>
      <NotificationPanel />
    </ToastProvider>,
  )
}

describe('NotificationPanel 提醒与通知设置', () => {
  beforeEach(() => {
    localStorage.clear()
    useUIStore.setState({ defaultReminderOffset: 0 })
    vi.clearAllMocks()
    vi.mocked(checkNotificationPermission).mockResolvedValue('denied')
    vi.mocked(requestNotificationPermission).mockResolvedValue(false)
    vi.mocked(sendTestNotification).mockResolvedValue(false)
  })

  it('权限被拒绝时显示未开启状态、原因说明，并禁用测试通知', async () => {
    renderPanel()

    await waitFor(() => {
      expect(screen.getByTestId('notification-permission-status')).toHaveTextContent('未开启')
    })
    const testButton = screen.getByRole('button', { name: '发送测试通知' })
    expect(testButton).toBeDisabled()
    expect(testButton).toHaveAttribute('aria-describedby', 'notification-permission-help')
    expect(screen.getByText(/系统已拒绝通知权限/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新请求权限' })).toBeEnabled()
  })

  it('权限已开启时可发送测试通知，并阻止重复请求权限', async () => {
    vi.mocked(checkNotificationPermission).mockResolvedValue('granted')
    vi.mocked(sendTestNotification).mockResolvedValue(true)
    renderPanel()

    await waitFor(() => {
      expect(screen.getByTestId('notification-permission-status')).toHaveTextContent('已开启')
    })
    expect(screen.getByRole('button', { name: '请求权限' })).toBeDisabled()
    const testButton = screen.getByRole('button', { name: '发送测试通知' })
    expect(testButton).toBeEnabled()

    fireEvent.click(testButton)
    await waitFor(() => {
      expect(sendTestNotification).toHaveBeenCalledTimes(1)
    })
  })

  it('重新请求权限成功后更新状态并保留开关状态', async () => {
    vi.mocked(requestNotificationPermission).mockResolvedValue(true)
    renderPanel()

    await waitFor(() => {
      expect(screen.getByTestId('notification-permission-status')).toHaveTextContent('未开启')
    })
    fireEvent.click(screen.getByRole('button', { name: '重新请求权限' }))

    await waitFor(() => {
      expect(screen.getByTestId('notification-permission-status')).toHaveTextContent('已开启')
    })
    expect(screen.getByText('通知权限已开启')).toBeInTheDocument()
  })

  it('开关和默认提醒时间使用可访问名称，修改后写入既有存储键', async () => {
    renderPanel()

    const desktopToggle = screen.getByRole('switch', { name: '桌面通知' })
    const soundToggle = screen.getByRole('switch', { name: '提醒声音' })
    expect(desktopToggle).toBeChecked()
    expect(soundToggle).toBeChecked()

    fireEvent.click(desktopToggle)
    fireEvent.click(soundToggle)
    await waitFor(() => {
      expect(localStorage.getItem('notifications')).toBe('false')
      expect(localStorage.getItem('reminderSound')).toBe('false')
    })

    const offsetSelect = screen.getByLabelText('默认提醒时间')
    expect(offsetSelect).toHaveValue('0')
    fireEvent.change(offsetSelect, { target: { value: '15' } })

    await waitFor(() => {
      expect(localStorage.getItem('default_reminder_offset')).toBe('15')
      expect(useUIStore.getState().defaultReminderOffset).toBe(15)
    })
    expect(offsetSelect).toHaveAttribute('aria-describedby', 'notification-reminder-offset-help')
  })
})
