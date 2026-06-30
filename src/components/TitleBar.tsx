import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useUIStore } from '../stores/uiStore'

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const setShortcutsHelpOpen = useUIStore(s => s.setShortcutsHelpOpen)
  const setNotificationCenterOpen = useUIStore(s => s.setNotificationCenterOpen)
  const hasUnreadNotifications = useUIStore(s =>
    s.notificationHistory.some(n => !n.read)
  )

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
        {/* 通知中心按钮：打开通知中心抽屉，有未读时显示小红点 */}
        <button
          onClick={() => setNotificationCenterOpen(true)}
          className="relative h-full px-3 flex items-center justify-center transition-all duration-150 active:scale-90 hover:bg-[var(--color-bg-tertiary)]"
          style={{ color: 'var(--titlebar-fg, #5f6368)' }}
          aria-label="通知中心"
          title="通知中心"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          {hasUnreadNotifications && (
            <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-[var(--color-danger, #ef4444)]" />
          )}
        </button>
        {/* 帮助按钮：打开快捷键帮助面板 */}
        <button
          onClick={() => setShortcutsHelpOpen(true)}
          className="h-full px-3 flex items-center justify-center transition-all duration-150 active:scale-90 hover:bg-[var(--color-bg-tertiary)]"
          style={{ color: 'var(--titlebar-fg, #5f6368)' }}
          aria-label="快捷键帮助"
          title="快捷键帮助 (?)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <button
          onClick={() => invoke('window_minimize')}
          className="h-full px-4 flex items-center justify-center transition-all duration-150 active:scale-90"
          style={{ color: 'var(--titlebar-fg, #5f6368)' }}
          aria-label="最小化"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" d="M5 12h14" />
          </svg>
        </button>
        <button
          onClick={() => invoke('window_toggle_maximize')}
          className="h-full px-4 flex items-center justify-center transition-all duration-150 active:scale-90"
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
          className="h-full px-4 flex items-center justify-center transition-all duration-150 hover:!bg-red-500 hover:!text-white active:scale-90"
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
