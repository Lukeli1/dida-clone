import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface CalendarToolbarMenuProps {
  open: boolean
  anchorRef: RefObject<HTMLElement>
  onClose: () => void
  children: ReactNode
  width?: number
  className?: string
}

/**
 * 日历工具栏弹出层的统一容器。
 *
 * - Portal 到 body，避免被日历内容区的 overflow-hidden 裁切；
 * - 固定定位并按视口夹取左右/上下边界，空间不足时向上翻转；
 * - 打开后聚焦第一个可操作控件，Escape 关闭并把焦点还给触发按钮；
 * - 点击触发按钮本身不视为“外部点击”，避免与按钮 toggle 冲突。
 */
export function CalendarToolbarMenu({
  open,
  anchorRef,
  onClose,
  children,
  width = 256,
  className = '',
}: CalendarToolbarMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return

    let frame = 0
    function update() {
      const anchor = anchorRef.current
      const panel = panelRef.current
      if (!anchor || !panel) return
      const rect = anchor.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const menuWidth = Math.min(width, viewportWidth - 16)
      const panelHeight = Math.min(panel.scrollHeight || panel.offsetHeight, viewportHeight - 16)

      const left = Math.min(Math.max(8, rect.right - menuWidth), viewportWidth - menuWidth - 8)
      let top = rect.bottom + 6
      if (top + panelHeight > viewportHeight - 8) {
        top = Math.max(8, rect.top - panelHeight - 6)
      }

      setPosition({ top, left })
    }

    update()
    frame = requestAnimationFrame(update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined' && panelRef.current) {
      observer = new ResizeObserver(update)
      observer.observe(panelRef.current)
    }

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      observer?.disconnect()
    }
  }, [open, anchorRef, width])

  useEffect(() => {
    if (!open) return undefined

    const focusFrame = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      first?.focus()
    })

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose()
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
      anchorRef.current?.focus()
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  const menuWidth = typeof window === 'undefined' ? width : Math.min(width, window.innerWidth - 16)

  return createPortal(
    <div
      ref={panelRef}
      className={`fixed z-[55] max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface)] ${className}`}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        width: menuWidth,
        maxHeight: 'calc(100vh - 16px)',
        visibility: position ? 'visible' : 'hidden',
        boxShadow: 'var(--shadow-dropdown)',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
