import { useEffect, useState } from 'react'
import {
  getTaskQuickProcessEnabled,
  saveTaskQuickProcessEnabled,
  subscribeTaskQuickProcessEnabled,
} from '../utils/taskQuickProcessSettings'

/**
 * 任务快速处理设置开关的 React 绑定。
 * 设置页与任务列表共用，同一窗口内保存后通过事件即时同步。
 */
export function useTaskQuickProcessEnabled() {
  const [enabled, setEnabled] = useState<boolean>(() => getTaskQuickProcessEnabled())

  useEffect(() => subscribeTaskQuickProcessEnabled(setEnabled), [])

  function updateEnabled(next: boolean) {
    setEnabled(saveTaskQuickProcessEnabled(next))
  }

  return { enabled, setEnabled: updateEnabled }
}
