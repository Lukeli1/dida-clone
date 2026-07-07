import { Component, type ReactNode, type ErrorInfo } from 'react'
import { logError } from '../utils/errorLogger'
import { useUIStore } from '../stores/uiStore'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  /** 是否展开技术详情（stack + componentStack） */
  showDetails: boolean
  /** 复制按钮反馈 */
  copied: boolean
}

/**
 * 全局错误边界：防止单个组件崩溃导致整个应用白屏。
 *
 * - componentDidCatch 将错误持久化到 localStorage（errorLogger），便于在设置面板查看/导出。
 * - fallback UI 提供错误摘要、可展开的技术详情、复制错误信息、刷新应用、返回首页。
 *
 * 注意：ErrorBoundary 位于 ToastProvider 之外（见 main.tsx），因此 fallback UI 不能使用 toast。
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false, copied: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('应用崩溃:', error, errorInfo)
    // 持久化错误日志（含 React 组件堆栈）
    logError(error, errorInfo.componentStack ?? undefined)
    this.setState({ errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false, copied: false })
  }

  /** 返回首页：重置路由 + 清除错误状态，使子树重新渲染 */
  handleGoHome = () => {
    try {
      const { setCurrentView, setSelectedTaskId, setSelectedListId, setSelectedTagId, clearSelection } =
        useUIStore.getState()
      setCurrentView('tasks')
      setSelectedTaskId(null)
      setSelectedListId(null)
      setSelectedTagId(null)
      clearSelection()
    } catch {
      // store 不可用时忽略，仅重置错误状态
    }
    this.handleReset()
  }

  handleToggleDetails = () => {
    this.setState((s) => ({ showDetails: !s.showDetails }))
  }

  handleCopy = async () => {
    const { error, errorInfo } = this.state
    const parts = [
      `Message: ${error?.message ?? 'Unknown error'}`,
      error?.stack ? `\nStack:\n${error.stack}` : '',
      errorInfo?.componentStack ? `\nComponent Stack:\n${errorInfo.componentStack}` : '',
      `\nURL: ${typeof window !== 'undefined' ? window.location.href : ''}`,
      `\nTime: ${new Date().toISOString()}`,
    ].join('')
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(parts)
      } else {
        // 回退方案：使用临时 textarea + execCommand
        const ta = document.createElement('textarea')
        ta.value = parts
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    } catch {
      // clipboard 不可用时静默失败
    }
  }

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, showDetails, copied } = this.state
      const hasDetails = !!(error?.stack || errorInfo?.componentStack)
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] p-8 overflow-auto">
          <div className="max-w-lg w-full text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h2 className="text-lg font-semibold mb-2">应用发生错误</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-1 break-all">
              {error?.message || '发生了未知错误'}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-5">
              错误已自动记录，可在「设置 → 系统」中查看详情。
            </p>

            {/* 可展开的技术详情 */}
            {hasDetails && (
              <div className="mb-5 text-left">
                <button
                  onClick={this.handleToggleDetails}
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  {showDetails ? '收起技术详情' : '展开技术详情'}
                </button>
                {showDetails && (
                  <pre className="mt-2 max-h-64 overflow-auto p-3 rounded-lg bg-[var(--color-bg-tertiary)] text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap break-all">
                    {[
                      error?.stack ? `Error stack:\n${error.stack}` : '',
                      errorInfo?.componentStack ? `\nComponent stack:\n${errorInfo.componentStack}` : '',
                    ]
                      .filter(Boolean)
                      .join('\n')}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={this.handleCopy}
                className="px-4 py-2 text-sm bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-lg hover:opacity-80 transition-colors"
              >
                {copied ? '已复制' : '复制错误信息'}
              </button>
              <button
                onClick={this.handleGoHome}
                className="px-4 py-2 text-sm bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-lg hover:opacity-80 transition-colors"
              >
                返回首页
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                刷新应用
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
