import { useState, useRef, useEffect } from 'react'
import { getAvatar, setAvatar, removeAvatar, fileToAvatar } from '../../utils/avatar'
import { useToast } from '../Toast'
import type { SidebarFooterProps } from './types'

// 用户头像逻辑：状态 + 上传/移除 + 菜单开关 + 点击外部关闭
export function useAvatar() {
  const toast = useToast()
  const [avatar, setAvatarState] = useState<string | null>(() => getAvatar())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const avatarMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await fileToAvatar(file)
      setAvatar(dataUrl)
      setAvatarState(dataUrl)
      setAvatarMenuOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败')
    }
    e.target.value = ''
  }

  function handleRemoveAvatar() {
    removeAvatar()
    setAvatarState(null)
    setAvatarMenuOpen(false)
  }

  return {
    avatar,
    fileInputRef,
    avatarMenuRef,
    avatarMenuOpen,
    setAvatarMenuOpen,
    handleAvatarChange,
    handleRemoveAvatar,
  }
}

// 顶部头像区域
export function AvatarSection() {
  const {
    avatar,
    fileInputRef,
    avatarMenuRef,
    avatarMenuOpen,
    setAvatarMenuOpen,
    handleAvatarChange,
    handleRemoveAvatar,
  } = useAvatar()

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarChange}
      />
      <div className="p-4 border-b border-[var(--color-border)]">
        <div className="relative" ref={avatarMenuRef}>
          <button
            onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
            className="flex items-center gap-3 w-full group"
          >
            {avatar ? (
              <img
                src={avatar}
                alt="头像"
                className="w-11 h-11 rounded-full object-cover ring-2 ring-[var(--color-border)] group-hover:ring-[var(--color-accent)] transition-all duration-200"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-hover)] flex items-center justify-center ring-2 ring-[var(--color-border)] group-hover:ring-[var(--color-accent)] transition-all duration-200 shadow-sm">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">滴答清单</p>
              <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">点击上传头像</p>
            </div>
            <svg className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-200 ${avatarMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {/* 下拉菜单 */}
          {avatarMenuOpen && (
            <div className="absolute top-full left-0 mt-2 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg py-1.5 z-50 animate-scale-in">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors rounded-lg mx-1 w-[calc(100%-8px)]"
              >
                <svg className="w-4 h-4 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {avatar ? '更换头像' : '上传头像'}
              </button>
              {avatar && (
                <button
                  onClick={handleRemoveAvatar}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors rounded-lg mx-1 w-[calc(100%-8px)]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  移除头像
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// 底部固定栏：设置入口
export function SidebarFooter({ currentView, onViewChange }: SidebarFooterProps) {
  return (
    <div className="border-t border-[var(--color-border)] p-3">
      <button
        onClick={() => onViewChange('settings')}
        className={`w-full flex items-center gap-2.5 sidebar-nav-item px-3 py-[9px] rounded-xl text-[13px] font-medium transition-all duration-200 ${
          currentView === 'settings'
            ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]'
        }`}
      >
        <svg className={`w-[18px] h-[18px] ${currentView === 'settings' ? 'opacity-100' : 'opacity-60'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        设置
      </button>
    </div>
  )
}
