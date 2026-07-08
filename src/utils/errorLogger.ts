import { getItem, setItem, removeItem } from './storage'
/**
 * 错误日志持久化工具（P11-09）
 *
 * 将运行时错误（渲染错误、未捕获 Promise rejection 等）持久化到 localStorage，
 * 供设置面板查看 / 导出 / 清除。
 *
 * 存储结构：localStorage['error_logs'] = JSON.stringify(ErrorLog[])
 * 上限 MAX_LOGS 条，超出后丢弃最旧的一条（新日志插在数组头部）。
 */

export interface ErrorLog {
  /** 唯一标识，格式 `${Date.now()}-${随机6位}` */
  id: string
  /** ISO 8601 时间戳 */
  timestamp: string
  /** 错误消息（error.message） */
  message: string
  /** 错误堆栈（可能很长，UI 中用 <pre> + overflow-scroll 展示） */
  stack?: string
  /** React 组件堆栈（componentDidCatch 的 errorInfo.componentStack） */
  componentStack?: string
  /** 发生错误时的页面 URL */
  url: string
  /** 用户代理字符串 */
  userAgent: string
}

const LOG_KEY = 'error_logs'
export const MAX_LOGS = 50

/**
 * 从 localStorage 读取全部错误日志。
 * - 未存储 / 解析失败时返回空数组，绝不抛错。
 */
export function loadErrorLogs(): ErrorLog[] {
  try {
    const data = getItem(LOG_KEY)
    return data ? (JSON.parse(data) as ErrorLog[]) : []
  } catch {
    return []
  }
}

/**
 * 记录一条错误日志并持久化。
 * 新日志插在数组头部，超过 MAX_LOGS 条时截断丢弃最旧的。
 */
export function logError(error: Error, componentStack?: string): void {
  try {
    const logs = loadErrorLogs()
    logs.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      componentStack,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    })
    // 限制最多 MAX_LOGS 条
    if (logs.length > MAX_LOGS) logs.length = MAX_LOGS
    setItem(LOG_KEY, JSON.stringify(logs))
  } catch {
    // localStorage 满或不可用时静默丢弃，避免日志记录本身引发二次错误
  }
}

/**
 * 清空全部错误日志。
 */
export function clearErrorLogs(): void {
  try {
    removeItem(LOG_KEY)
  } catch {
    // 忽略
  }
}

/**
 * 导出全部错误日志为格式化的 JSON 字符串。
 */
export function exportErrorLogs(): string {
  return JSON.stringify(loadErrorLogs(), null, 2)
}
