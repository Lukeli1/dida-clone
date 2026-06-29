// DayView 时间网格相关纯计算逻辑
// 包含：时间格常量、任务块定位/高度、分钟格式化、
// 鼠标位置→分钟换算、创建弹窗构建、拖放落点 ISO 日期构建等。
// 该文件为纯函数模块，不依赖 React，便于测试与复用。

import { getHours, getMinutes } from 'date-fns'
import type { Task } from '../types'

/** 每小时占用的像素高度 */
export const HOUR_HEIGHT = 60

/** 0~23 小时序列，用于渲染时间格 */
export const HOURS = Array.from({ length: 24 }, (_, i) => i)

/** 时间区间选择状态 */
export interface Selection {
  startMinute: number
  endMinute: number
}

/** 创建任务弹窗状态 */
export interface CreatePopup {
  startHour: number
  startMin: number
  endHour: number
  endMin: number
  top: number
  isQuickAdd: boolean
}

/** 计算任务块顶部的偏移量（像素） */
export function getTaskTop(task: Task): number {
  if (!task.due_date) return 0
  const d = new Date(task.due_date)
  return getHours(d) * HOUR_HEIGHT + getMinutes(d)
}

/** 计算任务块高度（像素），最小 30px */
export function getTaskHeight(task: Task): number {
  if (!task.due_date) return 30
  if (!task.end_date) return 30
  const start = new Date(task.due_date)
  const end = new Date(task.end_date)
  const diffMs = end.getTime() - start.getTime()
  const diffMin = diffMs / 60000
  if (diffMin <= 0) return 30
  return Math.max(30, (diffMin / 60) * HOUR_HEIGHT)
}

/** 将分钟数格式化为 HH:mm */
export function formatMinute(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/**
 * 根据鼠标 clientY 与时间列元素，换算出吸附到 15 分钟刻度的分钟数。
 * 返回 null 表示无法计算（例如列元素不存在）。
 */
export function getMinuteFromY(clientY: number, columnEl: HTMLElement | null): number | null {
  if (!columnEl) return null
  const rect = columnEl.getBoundingClientRect()
  const y = clientY - rect.top
  const raw = (y / HOUR_HEIGHT) * 60
  return Math.max(0, Math.min(24 * 60, Math.round(raw / 15) * 15))
}

/**
 * 根据拖选的起止分钟数构建创建弹窗状态。
 * 短按（区间 < 15 分钟）→ 快速添加，默认 1 小时；
 * 拖选（区间 >= 15 分钟）→ 详细弹窗。
 */
export function makeCreatePopup(startMinute: number, endMinute: number): CreatePopup {
  const top = (startMinute / 60) * HOUR_HEIGHT
  if (endMinute - startMinute < 15) {
    const quickStart = startMinute
    const quickEnd = Math.min(startMinute + 60, 24 * 60)
    return {
      startHour: Math.floor(quickStart / 60),
      startMin: quickStart % 60,
      endHour: Math.floor(quickEnd / 60),
      endMin: quickEnd % 60,
      top,
      isQuickAdd: true,
    }
  }
  return {
    startHour: Math.floor(startMinute / 60),
    startMin: startMinute % 60,
    endHour: Math.floor(endMinute / 60),
    endMin: endMinute % 60,
    top,
    isQuickAdd: false,
  }
}

/**
 * 根据拖放落点的 clientY 与时间列元素，构建目标日期时间的 ISO 字符串。
 * 落点吸附到 15 分钟刻度，并限制在当天 00:00~23:45 之间。
 * 返回 null 表示无法计算（例如列元素不存在）。
 */
export function makeDropISODate(dateKey: string, clientY: number, columnEl: HTMLElement | null): string | null {
  if (!columnEl) return null
  const rect = columnEl.getBoundingClientRect()
  const y = clientY - rect.top
  const rawMinute = (y / HOUR_HEIGHT) * 60
  const clampedMinute = Math.max(0, Math.min(24 * 60 - 15, Math.round(rawMinute / 15) * 15))
  const hour = Math.floor(clampedMinute / 60)
  const minute = clampedMinute % 60
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day, hour, minute).toISOString()
}
