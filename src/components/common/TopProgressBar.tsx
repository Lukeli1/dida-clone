import { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'

/**
 * 顶部进度条
 *
 * 监听 uiStore.globalLoading：开启时进度从 0 推进到 ~90% 并停留（模拟加载中），
 * 关闭时一次性推进到 100% 再淡出隐藏。fixed 定位、z-index 极高、pointer-events-none，
 * 不阻挡任何点击。
 */
export function TopProgressBar() {
  const globalLoading = useUIStore((s) => s.globalLoading)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!globalLoading) {
      setProgress(100)
      const timer = setTimeout(() => setProgress(0), 300)
      return () => clearTimeout(timer)
    }
    setProgress(0)
    const timer = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 15, 90))
    }, 200)
    return () => clearInterval(timer)
  }, [globalLoading])

  if (progress === 0) return null

  return (
    <div className="fixed top-0 left-0 right-0 h-0.5 z-[9999] pointer-events-none">
      <div
        className="h-full bg-[var(--color-accent)] transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
