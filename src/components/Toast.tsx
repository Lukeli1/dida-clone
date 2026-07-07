import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
  closing: boolean
}

export type ToastApi = {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

interface ToastContextValue {
  toast: ToastApi
}

const ToastContext = createContext<ToastContextValue | null>(null)

const MAX_TOASTS = 5
const TOAST_DURATION = 3000
const EXIT_ANIMATION_DURATION = 250

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastIdRef = useRef(0)
  const timerRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  // 用 ref 跟踪最新 toasts，避免在 setState updater 中做副作用
  const toastsRef = useRef<ToastItem[]>([])

  useEffect(() => {
    toastsRef.current = toasts
  }, [toasts])

  const actuallyRemove = useCallback((id: number) => {
    timerRefs.current.delete(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const startTimer = useCallback(
    (id: number) => {
      if (timerRefs.current.has(id)) {
        clearTimeout(timerRefs.current.get(id))
      }
      const timer = setTimeout(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)))
        const removeTimer = setTimeout(() => actuallyRemove(id), EXIT_ANIMATION_DURATION)
        timerRefs.current.set(id, removeTimer)
      }, TOAST_DURATION)
      timerRefs.current.set(id, timer)
    },
    [actuallyRemove],
  )

  const clearTimer = useCallback((id: number) => {
    const timer = timerRefs.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timerRefs.current.delete(id)
    }
  }, [])

  const removeToast = useCallback(
    (id: number) => {
      clearTimer(id)
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)))
      setTimeout(() => actuallyRemove(id), EXIT_ANIMATION_DURATION)
    },
    [actuallyRemove, clearTimer],
  )

  const closeExcessToasts = useCallback(
    (newId: number) => {
      // 获取最新的 toasts（含刚添加的 newId）
      const current = toastsRef.current
      const activeToasts = current.filter((t) => !t.closing)
      if (activeToasts.length <= MAX_TOASTS) return

      const toCloseCount = activeToasts.length - MAX_TOASTS
      // 关闭最早的非 closing toast（跳过刚添加的 newId）
      const idsToClose: number[] = []
      for (const t of activeToasts) {
        if (idsToClose.length >= toCloseCount) break
        if (t.id !== newId) {
          idsToClose.push(t.id)
        }
      }
      // 如果新 toast 自己也需要被关（极端情况），也关闭
      if (idsToClose.length < toCloseCount) {
        idsToClose.push(newId)
      }

      if (idsToClose.length > 0) {
        setToasts((prev) => prev.map((t) => (idsToClose.includes(t.id) ? { ...t, closing: true } : t)))
        idsToClose.forEach((closeId) => {
          clearTimer(closeId)
          setTimeout(() => actuallyRemove(closeId), EXIT_ANIMATION_DURATION)
        })
      }
    },
    [clearTimer, actuallyRemove],
  )

  const addToast = useCallback(
    (message: string, type: ToastType) => {
      const id = ++toastIdRef.current
      setToasts((prev) => [...prev, { id, message, type, closing: false }])
      startTimer(id)
      // 在下一个微任务中检查并关闭超出限制的 toast（确保 toastsRef 已更新）
      queueMicrotask(() => closeExcessToasts(id))
    },
    [startTimer, closeExcessToasts],
  )

  const toast = {
    success: (message: string) => addToast(message, 'success'),
    error: (message: string) => addToast(message, 'error'),
    info: (message: string) => addToast(message, 'info'),
  }

  // 卸载时清理所有 timer
  useEffect(() => {
    return () => {
      timerRefs.current.forEach((t) => clearTimeout(t))
      timerRefs.current.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
        role="region"
        aria-label="通知"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            onMouseEnter={() => clearTimer(t.id)}
            onMouseLeave={() => {
              if (!t.closing) startTimer(t.id)
            }}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm text-white pointer-events-auto ${
              t.closing ? 'animate-slide-out' : 'animate-slide-in'
            } ${
              t.type === 'success'
                ? 'bg-[var(--color-success)]'
                : t.type === 'error'
                  ? 'bg-[var(--color-danger)]'
                  : 'bg-[var(--color-info)]'
            }`}
            style={{ boxShadow: 'var(--shadow-dropdown)' }}
          >
            {t.type === 'success' && (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {t.type === 'error' && (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {t.type === 'info' && (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
            <span>{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-2 p-1 opacity-70 hover:opacity-100 transition-all rounded active:scale-90"
              aria-label="关闭"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx.toast
}
