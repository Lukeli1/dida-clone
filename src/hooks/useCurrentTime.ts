import { useEffect, useState } from 'react'

/**
 * 返回当前时间，每分钟刷新一次。
 *
 * 用于在周视图 / 日视图的时间轴上绘制「当前时间红线」。
 * 组件挂载时立即以真实时间初始化，之后每 60 秒更新一次，
 * 既能保证红线位置随分钟推进而移动，又避免高频重渲染。
 */
export function useCurrentTime(): Date {
  const [now, setNow] = useState<Date>(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  return now
}

/**
 * 将 Date 转换为「当天自 00:00 起的分钟数」。
 * 红线的垂直偏移量以此为基准计算。
 */
export function toDayMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}
