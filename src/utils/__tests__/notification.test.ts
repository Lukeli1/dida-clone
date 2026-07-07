import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  checkNotificationPermission,
  requestNotificationPermission,
  sendTestNotification,
  isTauriEnv,
} from '../notification'

/**
 * 通知权限工具测试。
 *
 * - 非 Tauri 环境（jsdom 默认无 __TAURI_INTERNALS__ 与 Notification）：返回 default / false
 * - Tauri 环境（注入 __TAURI_INTERNALS__）：通过 vi.mock 拦截动态导入，验证插件 API 调用
 */

// 使用 vi.hoisted 创建 mock 函数，避免 vi.mock 工厂因 hoisting 引用未定义变量
const mocks = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}))

// 拦截 @tauri-apps/plugin-notification 的（动态）导入
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: mocks.isPermissionGranted,
  requestPermission: mocks.requestPermission,
  sendNotification: mocks.sendNotification,
}))

beforeEach(() => {
  vi.clearAllMocks()
  // 确保非 Tauri 环境
  delete (window as any).__TAURI_INTERNALS__
  // jsdom 默认不实现 Notification，确保清理
  delete (window as any).Notification
})

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__
  delete (window as any).Notification
})

describe('isTauriEnv', () => {
  it('非 Tauri 环境返回 false', () => {
    expect(isTauriEnv()).toBe(false)
  })

  it('存在 __TAURI_INTERNALS__ 时返回 true', () => {
    ;(window as any).__TAURI_INTERNALS__ = {}
    expect(isTauriEnv()).toBe(true)
  })
})

describe('非 Tauri 环境', () => {
  it('checkNotificationPermission 返回 default', async () => {
    const result = await checkNotificationPermission()
    expect(result).toBe('default')
    // 不应调用插件 API
    expect(mocks.isPermissionGranted).not.toHaveBeenCalled()
  })

  it('requestNotificationPermission 返回 false', async () => {
    const result = await requestNotificationPermission()
    expect(result).toBe(false)
    expect(mocks.requestPermission).not.toHaveBeenCalled()
  })

  it('sendTestNotification 返回 false', async () => {
    const result = await sendTestNotification()
    expect(result).toBe(false)
    expect(mocks.sendNotification).not.toHaveBeenCalled()
  })
})

describe('Tauri 环境', () => {
  beforeEach(() => {
    ;(window as any).__TAURI_INTERNALS__ = {}
  })

  it('checkNotificationPermission 已授权返回 granted', async () => {
    mocks.isPermissionGranted.mockResolvedValue(true)
    const result = await checkNotificationPermission()
    expect(result).toBe('granted')
    expect(mocks.isPermissionGranted).toHaveBeenCalled()
  })

  it('checkNotificationPermission 未授权（无 Notification API）返回 default', async () => {
    mocks.isPermissionGranted.mockResolvedValue(false)
    const result = await checkNotificationPermission()
    expect(result).toBe('default')
  })

  it('checkNotificationPermission 已拒绝返回 denied', async () => {
    mocks.isPermissionGranted.mockResolvedValue(false)
    // 模拟 Web Notification API：permission === 'denied'
    ;(window as any).Notification = { permission: 'denied' }
    const result = await checkNotificationPermission()
    expect(result).toBe('denied')
  })

  it('checkNotificationPermission 异常时返回 default', async () => {
    mocks.isPermissionGranted.mockRejectedValue(new Error('plugin error'))
    const result = await checkNotificationPermission()
    expect(result).toBe('default')
  })

  it('requestNotificationPermission 已授权时直接返回 true，不再次请求', async () => {
    mocks.isPermissionGranted.mockResolvedValue(true)
    const result = await requestNotificationPermission()
    expect(result).toBe(true)
    expect(mocks.requestPermission).not.toHaveBeenCalled()
  })

  it('requestNotificationPermission 未授权时请求并获授权', async () => {
    mocks.isPermissionGranted.mockResolvedValue(false)
    mocks.requestPermission.mockResolvedValue('granted')
    const result = await requestNotificationPermission()
    expect(result).toBe(true)
    expect(mocks.requestPermission).toHaveBeenCalled()
  })

  it('requestNotificationPermission 被拒绝时返回 false', async () => {
    mocks.isPermissionGranted.mockResolvedValue(false)
    mocks.requestPermission.mockResolvedValue('denied')
    const result = await requestNotificationPermission()
    expect(result).toBe(false)
  })

  it('requestNotificationPermission 异常时返回 false', async () => {
    mocks.isPermissionGranted.mockRejectedValue(new Error('fail'))
    const result = await requestNotificationPermission()
    expect(result).toBe(false)
  })

  it('sendTestNotification 调用 sendNotification 并返回 true', async () => {
    const result = await sendTestNotification()
    expect(result).toBe(true)
    expect(mocks.sendNotification).toHaveBeenCalledWith(expect.objectContaining({ title: '滴答清单' }))
  })

  it('sendTestNotification 异常时返回 false', async () => {
    mocks.sendNotification.mockImplementation(() => {
      throw new Error('send failed')
    })
    const result = await sendTestNotification()
    expect(result).toBe(false)
  })
})
