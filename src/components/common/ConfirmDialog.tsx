import { createContext, useContext, useState, useCallback, useRef } from 'react'

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

export function useConfirm() {
  const ctx = useContext(ConfirmDialogContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmDialogProvider')
  return ctx.confirm
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)
  const [closing, setClosing] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve })
    })
  }, [])

  const handleClose = useCallback(
    (result: boolean) => {
      setClosing(true)
      timeoutRef.current = setTimeout(() => {
        state?.resolve(result)
        setState(null)
        setClosing(false)
      }, 150)
    },
    [state],
  )

  const handleConfirm = () => handleClose(true)
  const handleCancel = () => handleClose(false)

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          className={`fixed inset-0 z-[60] flex items-center justify-center p-4 transition-opacity duration-150 ${closing ? 'opacity-0' : 'opacity-100'}`}
          onClick={handleCancel}
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleCancel()
          }}
        >
          <div className="absolute inset-0 bg-[var(--color-mask)]" />
          <div
            className={`relative bg-[var(--color-surface)] rounded-xl w-full max-w-sm p-5 transition-transform duration-150 ${closing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
            style={{ boxShadow: 'var(--shadow-modal)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h3 id="confirm-title" className="text-base font-semibold text-[var(--color-text-primary)] mb-2">
              {state.title || '确认操作'}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-5 leading-relaxed">{state.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-tertiary)]/80 rounded-lg transition-all active:scale-[0.97]"
              >
                {state.cancelText || '取消'}
              </button>
              <button
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
