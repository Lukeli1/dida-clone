import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // 检测当前是否已最大化
    invoke<boolean>('window_is_maximized')
      .then(setIsMaximized)
      .catch(() => {})
  }, [])

  // 监听窗口大小变化（通过 resize 事件粗略检测最大化状态）
  useEffect(() => {
    function checkMaximize() {
      invoke<boolean>('window_is_maximized')
        .then(setIsMaximized)
        .catch(() => {})
    }
    window.addEventListener('resize', checkMaximize)
    return () => window.removeEventListener('resize', checkMaximize)
  }, [])

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-9 shrink-0 select-none"
      style={{ backgroundColor: 'var(--titlebar-bg, #1e293b)' }}
    >
      {/* 左侧：应用名称 */}
      <div className="flex items-center gap-2 pl-3">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--titlebar-fg, #94a3b8)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-xs font-medium" style={{ color: 'var(--titlebar-fg, #94a3b8)' }}>
          滴答清单
        </span>
      </div>

      {/* 右侧：窗口控制按钮 */}
      <div className="flex items-center h-full">
        <button
          onClick={() => invoke('window_minimize')}
          className="h-full px-3 hover:bg-white/10 transition-colors flex items-center"
          style={{ color: 'var(--titlebar-fg, #94a3b8)' }}
          aria-label="最小化"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeWidth={2} d="M5 12h14" />
          </svg>
        </button>
        <button
          onClick={() => invoke('window_toggle_maximize')}
          className="h-full px-3 hover:bg-white/10 transition-colors flex items-center"
          style={{ color: 'var(--titlebar-fg, #94a3b8)' }}
          aria-label={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeWidth={2} d="M8 8v6a2 2 0 002 2h6M16 16v-6a2 2 0 00-2-2H8" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          )}
        </button>
        <button
          onClick={() => invoke('window_close')}
          className="h-full px-3 hover:bg-[var(--color-danger)]/80 transition-colors flex items-center"
          style={{ color: 'var(--titlebar-fg, #94a3b8)' }}
          aria-label="关闭"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
