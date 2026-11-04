import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { isTextEditableTarget } from '../../utils/contextMenuPolicy'

/**
 * 全局右键菜单集中策略层（挂载一次，见 App.tsx）。
 *
 * 背景：Tauri/WebView2 未配置自定义系统菜单，右键「返回/刷新/另存为/打印」
 * 是 WebView 默认浏览器菜单；页面 contextmenu preventDefault 即可抑制。
 *
 * 策略（document 冒泡末端监听，只 preventDefault，不 stopPropagation，
 * 业务菜单 handler 与其 window 级关闭监听不受影响）：
 * 1. 业务菜单已 preventDefault → 不处理（业务 handler 照常执行）
 * 2. input / textarea / contenteditable 及其子元素 → 不阻止，保留系统文本菜单
 * 3. 其余普通区域 → 阻止默认浏览器菜单；有选中文本时提供仅含「复制」的
 *    最小自定义菜单（只显示实际可用的编辑操作，不把浏览器菜单项带回业务区域）
 */

interface CopyMenuState {
  x: number
  y: number
  text: string
}

async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // WebView 内 clipboard API 不可用时回退到临时 textarea + execCommand
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      document.execCommand('copy')
    } finally {
      textarea.remove()
    }
  }
}

export function ContextMenuPolicyLayer() {
  const [copyMenu, setCopyMenu] = useState<CopyMenuState | null>(null)

  useEffect(() => {
    function handleContextMenu(e: MouseEvent) {
      // 业务菜单已处理（任务行 / 日历任务块 / 列表空白菜单等），不重复干预
      if (e.defaultPrevented) {
        setCopyMenu(null)
        return
      }
      // 编辑类目标保留系统文本编辑菜单
      if (isTextEditableTarget(e.target)) {
        setCopyMenu(null)
        return
      }
      // 普通区域：阻止 WebView 默认浏览器菜单
      e.preventDefault()
      const text = window.getSelection()?.toString() ?? ''
      setCopyMenu(text ? { x: e.clientX, y: e.clientY, text } : null)
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [])

  useEffect(() => {
    if (!copyMenu) return
    const close = () => setCopyMenu(null)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    // 与 TaskContextMenu 同款：延迟注册，避免打开菜单的同一个 contextmenu
    // 事件继续冒泡到 window 时立即触发关闭（React 离散事件同步 flush effects）
    const timer = setTimeout(() => {
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
      window.addEventListener('keydown', handleKeyDown)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [copyMenu])

  if (!copyMenu || typeof document === 'undefined') return null

  const menu = (
    <div
      data-testid="context-menu-copy-layer"
      className="fixed z-[200] min-w-[96px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg py-1 text-sm animate-scale-in origin-top-left"
      style={{
        left: Math.min(copyMenu.x, window.innerWidth - 110),
        top: Math.min(copyMenu.y, window.innerHeight - 50),
        boxShadow: 'var(--shadow-dropdown)',
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <button
        data-testid="context-menu-copy-action"
        onClick={() => {
          void copyTextToClipboard(copyMenu.text)
          setCopyMenu(null)
        }}
        className="w-full text-left px-3 py-2 hover:bg-[var(--color-surface-hover)] text-[var(--color-text-primary)] transition-colors"
      >
        复制
      </button>
    </div>
  )

  return createPortal(menu, document.body)
}
