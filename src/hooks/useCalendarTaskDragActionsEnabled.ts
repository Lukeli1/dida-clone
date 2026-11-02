import { useEffect, useState } from 'react'
import {
  getCalendarTaskDragActionsEnabled,
  saveCalendarTaskDragActionsEnabled,
  subscribeCalendarTaskDragActionsEnabled,
} from '../utils/calendarTaskDragActionsSettings'

/**
 * 日历任务水平拖拽开关的 React 绑定。
 * 设置页与已打开日历共用，同一窗口内保存后通过事件即时同步。
 */
export function useCalendarTaskDragActionsEnabled() {
  const [enabled, setEnabled] = useState<boolean>(() => getCalendarTaskDragActionsEnabled())

  useEffect(() => subscribeCalendarTaskDragActionsEnabled(setEnabled), [])

  function updateEnabled(next: boolean) {
    setEnabled(saveCalendarTaskDragActionsEnabled(next))
  }

  return { enabled, setEnabled: updateEnabled }
}
