import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    invoke<boolean>('window_is_maximized')
      .then(setIsMaximized)
      .catch(() => {})
  }, [])

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
      className="flex items-center justify-between h-10 shrink-0 select-none"
      style={{ backgroundColor: 'var(--titlebar-bg, #f8f9fb)' }}
    >
      {/* 左侧：应用名称 */}
      <div className="flex items-center gap-2.5 pl-4">
        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: 'var(--color-accent)' }}>
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <span className="text-[13px] font-semibold" style={{ color: 'var(--titlebar-fg, #5f6368)' }}>
          滴答清单
        </span>
      </div>

      {/* 右侧：窗口控制按钮 */}
      <div className="flex items-center h-full">
        <button
          onClick={() => invoke('window_minimize')}
          className="h-full px-4 flex items-center justify-center transition-colors duration-150"
          style={{ color: 'var(--titlebar-fg, #5f6368)' }}
          aria-label="最小化"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" d="M5 12h14" />
          </svg>
        </button>
        <button
          onClick={() => invoke('window_toggle_maximize')}
          className="h-full px-4 flex items-center justify-center transition-colors duration-150"
          style={{ color: 'var(--titlebar-fg, #5f6368)' }}
          aria-label={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" d="M8 8v6a2 2 0 002 2h6M16 16v-6a2 2 0 00-2-2H8" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          )}
        </button>
        <button
          onClick={() => invoke('window_close')}
          className="h-full px-4 flex items-center justify-center transition-colors duration-150 hover:!bg-red-500 hover:!text-white"
          style={{ color: 'var(--titlebar-fg, #5f6368)' }}
          aria-label="关闭"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
