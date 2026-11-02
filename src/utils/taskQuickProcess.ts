/**
 * 任务快速处理模式的纯规则：支持视图、初始选择、推进与键盘焦点保护。
 *
 * 与设置存储（taskQuickProcessSettings）和 React 状态（useTaskQuickProcess）分离，
 * 便于独立测试，也避免任务列表组件内散落判断逻辑。
 */

import type { Task } from '../types'

export const TASK_QUICK_PROCESS_VIEWS = ['tasks', 'today'] as const

export function isTaskQuickProcessView(view: string | null | undefined): boolean {
  return view === 'tasks' || view === 'today'
}

type TaskIdLike = Pick<Task, 'id'>

/** 进入模式：优先保留当前详情选中项，否则选第一个可处理任务 */
export function resolveQuickProcessInitialTaskId(tasks: TaskIdLike[], preferredId: number | null): number | null {
  if (preferredId !== null && tasks.some((task) => task.id === preferredId)) return preferredId
  return tasks[0]?.id ?? null
}

/** 动作执行后推进到下一个任务；末尾返回 null，由调用方保持当前选择 */
export function resolveQuickProcessNextTaskId(tasks: TaskIdLike[], currentId: number): number | null {
  const index = tasks.findIndex((task) => task.id === currentId)
  if (index === -1) return null
  return tasks[index + 1]?.id ?? null
}

/**
 * 任务集合变化后的选择校正：
 * - 当前任务仍在集合中 → 保持不变；
 * - 当前任务离开集合 → 按原索引选择下一个仍可见任务，末尾回退到最后一个；
 * - 空集合 → null。
 */
export function reconcileQuickProcessTaskId(
  tasks: TaskIdLike[],
  selectedId: number | null,
  lastIndex: number,
): number | null {
  if (tasks.length === 0) return null
  if (selectedId !== null && tasks.some((task) => task.id === selectedId)) return selectedId
  const index = Math.min(Math.max(lastIndex, 0), tasks.length - 1)
  return tasks[index]?.id ?? null
}

/**
 * 方向键焦点保护：输入类控件、按钮、可编辑区域不拦截，避免破坏既有编辑 / 操作。
 * 事件目标可能是 svg 等子元素，因此同时检查祖先。
 */
export function isEditableQuickProcessTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false
  const element = target as Element
  const tag = element.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return true
  if ((element as HTMLElement).isContentEditable) return true
  return Boolean(element.closest('input, textarea, select, button, [contenteditable="true"], [contenteditable=""]'))
}
