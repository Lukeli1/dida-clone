import { describe, expect, it } from 'vitest'
import { getWindowLayout, LAYOUT_BREAKPOINTS } from '../useWindowSize'

describe('getWindowLayout 主工作区断点', () => {
  it('移动端：窄屏抽屉 + 详情覆盖', () => {
    expect(getWindowLayout(700)).toMatchObject({
      breakpoint: 'mobile',
      isNarrow: true,
      isCompact: true,
      isDetailOverlay: true,
    })
  })

  it('768–899：侧栏折叠，详情仍为覆盖层', () => {
    expect(getWindowLayout(767)).toMatchObject({ isNarrow: true, isCompact: true, isDetailOverlay: true })
    expect(getWindowLayout(768)).toMatchObject({ breakpoint: 'tablet', isNarrow: false, isCompact: true, isDetailOverlay: true })
    expect(getWindowLayout(899)).toMatchObject({ breakpoint: 'tablet', isCompact: true, isDetailOverlay: true })
  })

  it('900–1099：详情可停靠，侧栏保持折叠', () => {
    expect(getWindowLayout(900)).toMatchObject({
      breakpoint: 'tablet',
      isNarrow: false,
      isCompact: true,
      isDetailOverlay: false,
    })
    expect(getWindowLayout(1024)).toMatchObject({ breakpoint: 'tablet', isCompact: true, isDetailOverlay: false })
    expect(getWindowLayout(1099)).toMatchObject({ breakpoint: 'tablet', isCompact: true, isDetailOverlay: false })
  })

  it('≥1100：完整三栏，不折叠侧栏、不覆盖详情', () => {
    expect(getWindowLayout(1100)).toMatchObject({
      breakpoint: 'desktop',
      isNarrow: false,
      isCompact: false,
      isDetailOverlay: false,
    })
    expect(getWindowLayout(1440)).toMatchObject({ breakpoint: 'desktop', isCompact: false })
  })

  it('断点常量与函数保持一致', () => {
    expect(LAYOUT_BREAKPOINTS).toEqual({ narrow: 768, detailOverlay: 900, compact: 1100 })
  })
})
