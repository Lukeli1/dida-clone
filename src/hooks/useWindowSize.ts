import { useState, useEffect } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'
export interface WindowSize {
  width: number
  height: number
  breakpoint: Breakpoint
  isNarrow: boolean // < 768：移动端抽屉侧栏 + 全屏详情
  isCompact: boolean // < 1100：侧栏折叠为图标条
  isDetailOverlay: boolean // < 900：详情改为覆盖层，避免挤压任务列表
}

const isBrowser = typeof window !== 'undefined'

/**
 * 主工作区宽度断点集中在这里，组件不重复写魔法数字：
 * - < 768px   ：移动端，侧栏为抽屉，详情为全屏覆盖。
 * - 768–899px ：侧栏折叠为图标条，详情仍为全屏覆盖（不挤压列表）。
 * - 900–1099px：侧栏折叠为图标条，详情可停靠（宽度按视口收敛）。
 * - ≥ 1100px  ：完整三栏（侧栏 + 内容 + 详情）。
 */
export const LAYOUT_BREAKPOINTS = {
  narrow: 768,
  detailOverlay: 900,
  compact: 1100,
} as const

type LayoutFlags = Pick<WindowSize, 'breakpoint' | 'isNarrow' | 'isCompact' | 'isDetailOverlay'>

export function getWindowLayout(width: number): LayoutFlags {
  const isNarrow = width < LAYOUT_BREAKPOINTS.narrow
  const isDetailOverlay = width < LAYOUT_BREAKPOINTS.detailOverlay
  const isCompact = width < LAYOUT_BREAKPOINTS.compact
  const breakpoint: Breakpoint = isNarrow ? 'mobile' : isCompact ? 'tablet' : 'desktop'

  return { breakpoint, isNarrow, isCompact, isDetailOverlay }
}

function getSize() {
  return {
    width: isBrowser ? window.innerWidth : 1200,
    height: isBrowser ? window.innerHeight : 800,
  }
}

/**
 * 响应式窗口尺寸 hook。
 *
 * SSR 安全：服务端渲染时返回桌面默认值，避免 window 未定义报错。
 * 断点语义由 {@link getWindowLayout} 统一计算，便于单测覆盖。
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

  return { ...size, ...getWindowLayout(size.width) }
}
