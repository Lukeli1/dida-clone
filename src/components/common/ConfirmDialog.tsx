import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface ConfirmDialogContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmDialogContext = createContext<ConfirmDialogContextType | null>(null)

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && !el.closest('.hidden, [hidden]'),
  )
}

/** 找到当前确认框下方仍在页面中的最上层模态框，用作焦点恢复兜底。 */
function findUnderlyingModalFocus(exclude: HTMLElement | null): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter(
    (el) =>
      el !== exclude &&
      el.getAttribute('aria-hidden') !== 'true' &&
      !el.closest('[aria-hidden="true"], [inert]'),
  )
  const underlying = dialogs[dialogs.length - 1]
  return underlying ? underlying.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) : null
}

export function useConfirm() {
  const ctx = useContext(ConfirmDialogContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmDialogProvider')
  return ctx.confirm
}

/**
 * 可选确认框：供可能在测试 / 独立挂载场景下运行的共享 hook 使用。
 * 无 Provider 时返回 null；业务调用方需自行决定降级策略。
 */
export function useOptionalConfirm() {
  return useContext(ConfirmDialogContext)?.confirm ?? null
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)
  const [closing, setClosing] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const closingRef = useRef(false)

  const confirm = useCallback((options: ConfirmOptions) => {
    const active = typeof document !== 'undefined' ? document.activeElement : null
    restoreFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null
    closingRef.current = false
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve })
    })
  }, [])

  const handleClose = useCallback(
    (result: boolean) => {
      if (!state || closingRef.current) return
      closingRef.current = true
      setClosing(true)
      timeoutRef.current = setTimeout(() => {
        state.resolve(result)
        setState(null)
        setClosing(false)
        closingRef.current = false
      }, 150)
    },
    [state],
  )

  const handleConfirm = useCallback(() => handleClose(true), [handleClose])
  const handleCancel = useCallback(() => handleClose(false), [handleClose])

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [],
  )

  // 确认框是最上层模态框：接管 Tab / Escape，底层详情不得同时响应。
  useEffect(() => {
    if (!state) return

    cancelRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        handleCancel()
        return
      }
      if (e.key !== 'Tab') return

      // 无论是否在边界，都阻止底层详情继续处理 Tab。
      e.stopImmediatePropagation()
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = getFocusableElements(dialog)
      if (focusable.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement
      const inside = current instanceof Node && dialog.contains(current)

      if (e.shiftKey) {
        if (!inside || current === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (!inside || current === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      const previous = restoreFocusRef.current
      restoreFocusRef.current = null
      if (previous?.isConnected) {
        previous.focus()
        return
      }
      findUnderlyingModalFocus(dialogRef.current)?.focus()
    }
  }, [state, handleCancel])

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          className={`fixed inset-0 z-[60] flex items-center justify-center p-4 transition-opacity duration-150 ${closing ? 'opacity-0' : 'opacity-100'}`}
          onClick={handleCancel}
        >
          <div className="absolute inset-0 bg-[var(--color-mask)]" />
          <div
            ref={dialogRef}
            data-testid="confirm-dialog"
            className={`relative bg-[var(--color-surface)] rounded-xl w-full max-w-sm p-5 transition-transform duration-150 ${closing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
            style={{ boxShadow: 'var(--shadow-modal)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            tabIndex={-1}
          >
            <h3 id="confirm-title" className="text-base font-semibold text-[var(--color-text-primary)] mb-2">
              {state.title || '确认操作'}
            </h3>
            <p id="confirm-message" className="text-sm text-[var(--color-text-secondary)] mb-5 leading-relaxed">
              {state.message}
            </p>
            <div className="flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-tertiary)]/80 rounded-lg transition-all active:scale-[0.97]"
              >
                {state.cancelText || '取消'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className={`px-4 py-2 text-sm text-white rounded-lg transition-all active:scale-[0.97] ${
                  state.danger
                    ? 'bg-[var(--color-danger)] hover:brightness-110'
                    : 'bg-[var(--color-accent)] hover:brightness-110'
                }`}
              >
                {state.confirmText || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  )
}
