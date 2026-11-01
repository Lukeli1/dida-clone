import { describe, expect, it } from 'vitest'
import {
  CALENDAR_HORIZONTAL_DRAG_MIN_PX,
  nextCalendarTaskDragIntent,
  resolveCalendarTaskDragIntent,
} from '../calendarTaskGesture'

const start = { x: 200, y: 200 }

describe('resolveCalendarTaskDragIntent', () => {
  it('超过 48px 的纯水平向左 / 向右位移判定为水平动作', () => {
    expect(resolveCalendarTaskDragIntent(start, { x: 200 - 48, y: 200 })).toBe('left')
    expect(resolveCalendarTaskDragIntent(start, { x: 200 + 48, y: 200 })).toBe('right')
  })

  it('不足 48px 的水平位移不进入水平动作，按移动意图交给普通拖放', () => {
    expect(resolveCalendarTaskDragIntent(start, { x: 200 - 47, y: 200 })).toBe('vertical')
  })

  it('水平位移未明显大于垂直位移时保持垂直意图', () => {
    expect(resolveCalendarTaskDragIntent(start, { x: 200 + 60, y: 200 + 50 })).toBe('vertical')
    expect(resolveCalendarTaskDragIntent(start, { x: 200 - 60, y: 200 - 50 })).toBe('vertical')
  })

  it('水平位移明显大于垂直位移时进入水平动作', () => {
    expect(resolveCalendarTaskDragIntent(start, { x: 200 + 60, y: 200 + 20 })).toBe('right')
    expect(resolveCalendarTaskDragIntent(start, { x: 200 - 60, y: 200 - 20 })).toBe('left')
  })

  it('位移不足 6px 仍视为点击，不产生拖拽意图', () => {
    expect(resolveCalendarTaskDragIntent(start, { x: 200 + 4, y: 200 + 4 })).toBe('idle')
    expect(resolveCalendarTaskDragIntent(start, start)).toBe('idle')
  })

  it('默认阈值可配置，且水平阈值参数生效', () => {
    expect(CALENDAR_HORIZONTAL_DRAG_MIN_PX).toBe(48)
    expect(resolveCalendarTaskDragIntent(start, { x: 200 + 30, y: 200 }, { horizontalThresholdPx: 24 })).toBe('right')
  })
})

describe('nextCalendarTaskDragIntent', () => {
  it('进入水平动作后本次拖拽保持锁定', () => {
    const right = resolveCalendarTaskDragIntent(start, { x: 260, y: 200 })
    expect(right).toBe('right')
    // 后续坐标回到垂直方向，仍保持 right，避免一次手势改判成日期移动
    expect(nextCalendarTaskDragIntent(right, start, { x: 205, y: 400 })).toBe('right')
    expect(nextCalendarTaskDragIntent('left', start, { x: 500, y: 500 })).toBe('left')
  })

  it('水平意图锁定后不会重复计算为相反方向', () => {
    expect(nextCalendarTaskDragIntent('left', start, { x: 400, y: 200 })).toBe('left')
  })

  it('未进入水平动作时继续按坐标实时判定', () => {
    expect(nextCalendarTaskDragIntent('vertical', start, { x: 300, y: 200 })).toBe('right')
    expect(nextCalendarTaskDragIntent('idle', start, { x: 205, y: 205 })).toBe('idle')
  })
})
