/**
 * 通知权限管理工具。
 *
 * 封装系统通知权限的检查、请求与测试通知发送，兼容 Tauri 桌面环境与浏览器环境。
 *
 * - Tauri 环境：通过 `@tauri-apps/plugin-notification` 调用原生通知权限 API
 * - 浏览器环境（非 Tauri）：回退到 Web Notification API
 * - 既非 Tauri 也无 Web Notification API 时：统一返回 'default' / false
 *
 * 权限状态三态：
 * - 'granted'：已授权
 * - 'denied'：已拒绝
 * - 'default'：未决定（尚未请求过）
 */

/** 通知权限状态 */
export type NotificationPermissionStatus = 'granted' | 'denied' | 'default'

/**
 * 检测当前是否运行在 Tauri 桌面环境中。
 *
 * 通过 `window.__TAURI_INTERNALS__` 判定（Tauri v2 注入的全局对象），
 * 避免在浏览器/测试环境中误调原生 API。
 */
export function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * 检查通知权限状态。
 *
 * @returns 'granted' | 'denied' | 'default'
 */
export async function checkNotificationPermission(): Promise<NotificationPermissionStatus> {
  // Tauri 环境
  if (isTauriEnv()) {
    try {
      const { isPermissionGranted } = await import('@tauri-apps/plugin-notification')
      const granted = await isPermissionGranted()
      if (granted) return 'granted'
      // 未授权时，通过 Web Notification API 区分 denied / default
      if (typeof window !== 'undefined' && 'Notification' in window) {
        return Notification.permission === 'denied' ? 'denied' : 'default'
      }
      return 'default'
    } catch {
      return 'default'
    }
  }
  // 浏览器环境
  if (typeof window !== 'undefined' && 'Notification' in window) {
    return Notification.permission
  }
  return 'default'
}

/**
 * 请求通知权限。
 *
 * 仅在尚未授权时弹出系统权限请求对话框。
 *
 * @returns 用户是否授权
 */
export async function requestNotificationPermission(): Promise<boolean> {
  // Tauri 环境
  if (isTauriEnv()) {
    try {
      const { requestPermission, isPermissionGranted } = await import('@tauri-apps/plugin-notification')
      const granted = await isPermissionGranted()
      if (!granted) {
        const permission = await requestPermission()
        return permission === 'granted'
      }
      return true
    } catch {
      return false
    }
  }
  // 浏览器环境
  if (typeof window !== 'undefined' && 'Notification' in window) {
    return (await Notification.requestPermission()) === 'granted'
  }
  return false
}

/**
 * 发送一条测试通知。
 *
 * @returns 是否发送成功
 */
export async function sendTestNotification(): Promise<boolean> {
  // Tauri 环境
  if (isTauriEnv()) {
    try {
      const { sendNotification } = await import('@tauri-apps/plugin-notification')
      sendNotification({
        title: '滴答清单',
        body: '这是一条测试通知 🔔',
      })
      return true
    } catch {
      return false
    }
  }
  // 浏览器环境回退
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        new Notification('滴答清单', { body: '这是一条测试通知 🔔' })
        return true
      }
      return false
    } catch {
      return false
    }
  }
  return false
}
