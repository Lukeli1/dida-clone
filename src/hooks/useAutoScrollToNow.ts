// 日 / 周视图进入时，把时间轴滚动位置定位到「当前本地时间」附近。
//
// 约定：
//  - 时间计算复用 useCurrentTime 的 toDayMinutes（与「当前时间红线」同源，均为本地时间），
//    不引入额外的 UTC / 本地时间判断。
//  - 每次挂载只执行一次（视图切换会重新挂载组件）。执行完成后不再干预滚动位置，
//    用户之后的手动滚动不会被拉回。
//  - 容器尚未完成渲染 / 布局（scrollHeight 为 0）时短暂重试几次后放弃，不报错。

import { useLayoutEffect, useRef } from 'react'
import { HOUR_HEIGHT } from '../utils/dayViewUtils'
import { toDayMinutes } from './useCurrentTime'

/** 视图顶部日期头行高度（日/周视图均为 h-12 = 48px） */
const VIEW_HEADER_HEIGHT = 48

/** 当前时间定位到视口的比例位置（约上三分之一，保证当前时间附近内容直接可见） */
const NOW_VIEWPORT_RATIO = 1 / 3

/** 容器未就绪时的最大重试次数（每次间隔约一帧） */
const MAX_ATTEMPTS = 5
const RETRY_INTERVAL_MS = 16

/**
 * 计算时间轴滚动目标位置（纯函数，便于测试）。
 *
 * @param scrollHeight 滚动容器总内容高度
 * @param clientHeight 滚动容器可视高度
 * @param minutes 当前本地时间的分钟数（00:00 起）
 * @param allDayAreaHeight 全天任务区高度（时间网格之前的固定内容）
 */
export function computeTimeAxisScrollTop(opts: {
  scrollHeight: number
  clientHeight: number
  minutes: number
  allDayAreaHeight: number
}): number {
  const contentTop = VIEW_HEADER_HEIGHT + Math.max(0, opts.allDayAreaHeight)
  const minutesPx = (Math.max(0, Math.min(24 * 60, opts.minutes)) / 60) * HOUR_HEIGHT
  const target = contentTop + minutesPx - opts.clientHeight * NOW_VIEWPORT_RATIO
  const maxScroll = Math.max(0, opts.scrollHeight - opts.clientHeight)
  return Math.max(0, Math.min(target, maxScroll))
}

/**
 * 挂载后把滚动容器定位到当前本地时间附近，仅执行一次。
 *
 * @param scrollRef 时间轴滚动容器
 * @param allDayAreaHeight 全天任务区高度（日期头与时间网格之间的固定区域）
 */
export function useAutoScrollToNow(scrollRef: React.RefObject<HTMLElement | null>, allDayAreaHeight: number): void {
  const doneRef = useRef(false)

  useLayoutEffect(() => {
    if (doneRef.current) return

    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    function tryScroll() {
      const el = scrollRef.current
      // 容器未挂载或尚未完成布局（如测试环境初始尺寸为 0）：短暂重试后放弃
      if (!el || el.scrollHeight <= 0) {
        attempts += 1
        if (attempts < MAX_ATTEMPTS) {
          timer = setTimeout(tryScroll, RETRY_INTERVAL_MS)
        } else {
          doneRef.current = true
        }
        return
      }
      doneRef.current = true
      el.scrollTop = computeTimeAxisScrollTop({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        minutes: toDayMinutes(new Date()),
        allDayAreaHeight,
      })
    }

    tryScroll()
    return () => {
      if (timer !== undefined) clearTimeout(timer)
    }
    // 仅在挂载时执行一次：进入或切换到日/周视图时自动定位，
    // 之后不再重复执行，避免抢占用户手动滚动。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
