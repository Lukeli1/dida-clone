import { useState, useEffect } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'
export interface WindowSize {
  width: number
  height: number
  breakpoint: Breakpoint
  isNarrow: boolean // < 768
  isCompact: boolean // < 1024
}

const isBrowser = typeof window !== 'undefined'

function getSize() {
  return {
    width: isBrowser ? window.innerWidth : 1200,
    height: isBrowser ? window.innerHeight : 800,
  }
}

/**
 * 响应式窗口尺寸 hook。
 *
 * - mobile  : width < 768
 * - tablet  : 768 <= width < 1024
 * - desktop : width >= 1024
 *
 * SSR 安全：服务端渲染时返回桌面默认值，避免 window 未定义报错。
 */
export function useWindowSize(): WindowSize {
  const [size, setSize] = useState(getSize)

  useEffect(() => {
    if (!isBrowser) return
    function update() {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const breakpoint: Breakpoint = size.width < 768 ? 'mobile' : size.width < 1024 ? 'tablet' : 'desktop'

  return {
    ...size,
    breakpoint,
    isNarrow: size.width < 768,
    isCompact: size.width < 1024,
  }
}
