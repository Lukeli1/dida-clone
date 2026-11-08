import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { List, Task } from '../../../types'
import { WeekView } from '../WeekView'

/**
 * 周视图左右边缘「日期跨度调整」组件回归。
 *
 * 覆盖：手柄按真实端点渲染（裁剪边界不冒充端点）、实时预览、一次提交、
 * 取消不写入（Escape / pointercancel / blur / 未拉伸）、不触发详情点击与整体拖拽。
 * 日期语义由 dateSpanResize 单元测试覆盖，这里验证接线行为。
 */

const lists: List[] = [
  {
    id: 1,
    name: '默认清单',
    color: '#3b82f6',
    is_default: true,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  },
]

const localIso = (y: number, m: number, d: number, hour = 0, minute = 0) =>
  new Date(y, m - 1, d, hour, minute, 0, 0).toISOString()

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `跨度任务 ${id}`,
    notes: null,
    priority: 0,
    due_date: localIso(2026, 11, 4, 9),
    end_date: localIso(2026, 11, 4, 10),
    all_day: false,
    reminder: null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: id,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

// jsdom 无布局：时间网格固定 700px 宽，每天列 100px；2026-11-02(周一) 为第 0 列
const DAY_WIDTH = 100
const dayCenterX = (index: number) => index * DAY_WIDTH + DAY_WIDTH / 2

function renderWeekView(tasks: Task[]) {
  const onUpdateTask = vi.fn()
  const onTaskClick = vi.fn()
  const renderView = (nextTasks: Task[]) => (
    <WeekView
      currentDate={new Date(2026, 10, 4)} // 2026-11-04 周三，周为 11-02..11-08
      tasks={nextTasks}
      lists={lists}
      onDateClick={vi.fn()}
      onTaskClick={onTaskClick}
      onToggleTask={vi.fn()}
      onPrevWeek={vi.fn()}
      onNextWeek={vi.fn()}
      onToday={vi.fn()}
      onMoveTask={vi.fn()}
      onCreateTaskOnRange={vi.fn()}
      onUpdateTask={onUpdateTask}
    />
  )
  const view = render(renderView(tasks))

  const mockGridRect = () => {
    const grid = view.container.querySelector<HTMLElement>('[data-testid="week-time-grid"]')
    expect(grid).not.toBeNull()
    Object.defineProperty(grid!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: DAY_WIDTH * 7,
        bottom: 1440,
        width: DAY_WIDTH * 7,
        height: 1440,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
  }
  mockGridRect()

  return {
    onUpdateTask,
    onTaskClick,
    container: view.container,
    rerender: (nextTasks: Task[]) => {
      view.rerender(renderView(nextTasks))
      mockGridRect()
    },
  }
}

function firePointer(target: EventTarget, type: string, clientX = 0, clientY = 0) {
  act(() => {
    // button/buttons 必须经构造参数传入（MouseEvent 原型上为只读 getter）
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
    })
    Object.assign(event, { pointerId: 1, pointerType: 'mouse' })
    target.dispatchEvent(event)
  })
}

describe('周视图日期跨度调整', () => {
  it('全天单日条左右边缘渲染手柄；右拉至周四实时预览，松开后一次提交周五 00:00 排他结束', () => {
    const task = makeTask(1, { due_date: localIso(2026, 11, 4), end_date: null, all_day: true })
    const { onUpdateTask } = renderWeekView([task])

    const bar = screen.getByTestId('calendar-all-day-task-1')
    const startHandle = bar.querySelector('[data-span-resize-handle="start"]')
    const endHandle = bar.querySelector('[data-span-resize-handle="end"]')
    expect(startHandle).not.toBeNull()
    expect(endHandle).not.toBeNull()

    // 按下时还没有预览
    firePointer(endHandle!, 'pointerdown', dayCenterX(2))
    expect(screen.queryByTestId('week-span-preview')).not.toBeInTheDocument()

    // 移动到周四列：实时预览出现
    firePointer(window, 'pointermove', dayCenterX(3))
    const preview = screen.getByTestId('week-span-preview')
    expect(preview.getAttribute('data-start-key')).toBe('2026-11-04')
    expect(preview.getAttribute('data-end-key')).toBe('2026-11-05')

    // 松开：只提交一次，排他结束为周五本地 00:00
    firePointer(window, 'pointerup', dayCenterX(3))
    expect(onUpdateTask).toHaveBeenCalledTimes(1)
    expect(onUpdateTask).toHaveBeenCalledWith(1, { end_date: localIso(2026, 11, 6) })
    expect(screen.queryByTestId('week-span-preview')).not.toBeInTheDocument()
  })

  it('定时任务周三 09:00-10:00 右拉至周四：预览后一次提交周四 10:00，保留原有时分', () => {
    const task = makeTask(1)
    const { onUpdateTask } = renderWeekView([task])

    const block = container_first_timed_block(1)
    const endHandle = block.querySelector('[data-span-resize-handle="end"]')
    expect(endHandle).not.toBeNull()

    firePointer(endHandle!, 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointermove', dayCenterX(3))
    expect(screen.getByTestId('week-span-preview').getAttribute('data-end-key')).toBe('2026-11-05')
    firePointer(window, 'pointerup', dayCenterX(3))

    expect(onUpdateTask).toHaveBeenCalledTimes(1)
    expect(onUpdateTask).toHaveBeenCalledWith(1, { end_date: localIso(2026, 11, 5, 10) })
  })

  /** 预览几何（相对时间网格）与已提交任务块几何（相对日列） */
  function previewGeometry() {
    const preview = screen.getByTestId('week-span-preview')
    return {
      top: Number.parseFloat(preview.style.top),
      height: Number.parseFloat(preview.style.height),
      left: preview.style.left,
      width: preview.style.width,
    }
  }

  function blockGeometry(block: HTMLElement) {
    return {
      top: Number.parseFloat(block.style.top),
      height: Number.parseFloat(block.style.height),
      left: Number.parseFloat(block.style.left),
      width: Number.parseFloat(block.style.width),
    }
  }

  function endHandleOf(block: HTMLElement) {
    const handle = block.querySelector('[data-span-resize-handle="end"]')
    expect(handle).not.toBeNull()
    return handle!
  }

  function startHandleOf(block: HTMLElement) {
    const handle = block.querySelector('[data-span-resize-handle="start"]')
    expect(handle).not.toBeNull()
    return handle!
  }

  it('单日→跨日右拉：预览与保存后的轨道顺序一致（既有跨日在任务列表中更早）', () => {
    const existingCross = makeTask(3, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 5, 10) })
    const converting = makeTask(6)
    const { onUpdateTask, rerender } = renderWeekView([existingCross, converting])

    firePointer(endHandleOf(container_first_timed_block(6)), 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointermove', dayCenterX(3))
    expect(previewGeometry()).toMatchObject({ top: 570, height: 30 })
    firePointer(window, 'pointerup', dayCenterX(3))
    expect(onUpdateTask).toHaveBeenCalledWith(6, { end_date: localIso(2026, 11, 5, 10) })

    rerender([existingCross, makeTask(6, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 5, 10) })])
    expect(blockGeometry(container_first_timed_block(6))).toMatchObject({ top: 570, height: 30 })
  })

  it('单日→跨日右拉：任务顺序反转时预览与保存后的轨道同样一致', () => {
    const existingCross = makeTask(3, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 5, 10) })
    const converting = makeTask(6)
    const { rerender } = renderWeekView([converting, existingCross])

    firePointer(endHandleOf(container_first_timed_block(6)), 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointermove', dayCenterX(3))
    expect(previewGeometry()).toMatchObject({ top: 540, height: 30 })
    firePointer(window, 'pointerup', dayCenterX(3))

    rerender([makeTask(6, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 5, 10) }), existingCross])
    expect(blockGeometry(container_first_timed_block(6))).toMatchObject({ top: 540, height: 30 })
  })

  it('单日→跨日右拉：同时间多条跨日任务时按任务顺序稳定分轨', () => {
    const crossA = makeTask(3, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 5, 10) })
    const crossB = makeTask(5, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 5, 10) })
    const converting = makeTask(6)
    const { rerender } = renderWeekView([crossA, crossB, converting])

    firePointer(endHandleOf(container_first_timed_block(6)), 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointermove', dayCenterX(3))
    expect(previewGeometry()).toMatchObject({ top: 580, height: 20 })
    firePointer(window, 'pointerup', dayCenterX(3))

    rerender([crossA, crossB, makeTask(6, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 5, 10) })])
    expect(blockGeometry(container_first_timed_block(6))).toMatchObject({ top: 580, height: 20 })
  })

  it('单日→跨日左拉：预览与保存后的轨道顺序一致', () => {
    const existingCross = makeTask(3, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 5, 10) })
    const converting = makeTask(6)
    const { onUpdateTask, rerender } = renderWeekView([existingCross, converting])

    firePointer(startHandleOf(container_first_timed_block(6)), 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointermove', dayCenterX(1))
    expect(previewGeometry()).toMatchObject({ top: 570, height: 30 })
    firePointer(window, 'pointerup', dayCenterX(1))
    expect(onUpdateTask).toHaveBeenCalledWith(6, { due_date: localIso(2026, 11, 3, 9) })

    rerender([existingCross, makeTask(6, { due_date: localIso(2026, 11, 3, 9), end_date: localIso(2026, 11, 4, 10) })])
    expect(blockGeometry(container_first_timed_block(6))).toMatchObject({ top: 570, height: 30 })
  })

  it('跨日→单日右拉：预览应用 lane 最终避让位置，与保存后一致', () => {
    const cross = makeTask(3, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 5, 10) })
    const displacedSingle = makeTask(6)
    const tailCross = makeTask(7, { due_date: localIso(2026, 11, 4, 10), end_date: localIso(2026, 11, 5, 11) })
    const { onUpdateTask, rerender } = renderWeekView([cross, displacedSingle, tailCross])

    const tailSegments = container_all_timed_blocks(7)
    expect(tailSegments).toHaveLength(2)
    firePointer(endHandleOf(tailSegments[1]), 'pointerdown', dayCenterX(3))
    firePointer(window, 'pointermove', dayCenterX(2))
    expect(previewGeometry()).toMatchObject({ top: 660, height: 60 })
    firePointer(window, 'pointerup', dayCenterX(2))
    expect(onUpdateTask).toHaveBeenCalledWith(7, { end_date: localIso(2026, 11, 4, 11) })

    rerender([
      cross,
      displacedSingle,
      makeTask(7, { due_date: localIso(2026, 11, 4, 10), end_date: localIso(2026, 11, 4, 11) }),
    ])
    expect(blockGeometry(container_first_timed_block(7))).toMatchObject({ top: 660, height: 60 })
  })

  it('跨日→单日右拉：无避让时预览保持在原时间位置', () => {
    const cross = makeTask(3, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 5, 10) })
    const tailCross = makeTask(7, { due_date: localIso(2026, 11, 4, 10), end_date: localIso(2026, 11, 5, 11) })
    const { rerender } = renderWeekView([cross, tailCross])

    firePointer(endHandleOf(container_all_timed_blocks(7)[1]), 'pointerdown', dayCenterX(3))
    firePointer(window, 'pointermove', dayCenterX(2))
    expect(previewGeometry()).toMatchObject({ top: 600, height: 60 })
    firePointer(window, 'pointerup', dayCenterX(2))

    rerender([cross, makeTask(7, { due_date: localIso(2026, 11, 4, 10), end_date: localIso(2026, 11, 4, 11) })])
    expect(blockGeometry(container_first_timed_block(7))).toMatchObject({ top: 600, height: 60 })
  })

  it('跨日→单日右拉：lane 横向分列时预览宽度与保存后一致', () => {
    const cross = makeTask(3, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 5, 10) })
    const displacedSingle = makeTask(6)
    const tailCross = makeTask(7, { due_date: localIso(2026, 11, 4, 10), end_date: localIso(2026, 11, 5, 11) })
    const laterSingle = makeTask(8, {
      due_date: localIso(2026, 11, 4, 10, 30),
      end_date: localIso(2026, 11, 4, 11, 30),
    })
    const { rerender } = renderWeekView([cross, displacedSingle, tailCross, laterSingle])

    firePointer(endHandleOf(container_all_timed_blocks(7)[1]), 'pointerdown', dayCenterX(3))
    firePointer(window, 'pointermove', dayCenterX(2))
    const preview = previewGeometry()
    const widthMatch = /^calc\(([\d.]+)% - ([\d.]+)px\)$/.exec(preview.width)
    expect(widthMatch).not.toBeNull()
    // 周三列左边界 + lane0；宽度 = 半列内容宽（列宽 100px，扣除 1px 右边框）
    expect((Number.parseFloat(preview.left) / 100) * DAY_WIDTH * 7).toBeCloseTo(2 * DAY_WIDTH)
    const previewWidthPx = (Number(widthMatch![1]) / 100) * DAY_WIDTH * 7 - Number(widthMatch![2])
    expect(previewWidthPx).toBeCloseTo((49.25 / 100) * (DAY_WIDTH - 1))
    expect(preview).toMatchObject({ top: 660, height: 60 })
    firePointer(window, 'pointerup', dayCenterX(2))

    rerender([
      cross,
      displacedSingle,
      makeTask(7, { due_date: localIso(2026, 11, 4, 10), end_date: localIso(2026, 11, 4, 11) }),
      laterSingle,
    ])
    expect(blockGeometry(container_first_timed_block(7))).toMatchObject({
      top: 660,
      height: 60,
      left: 0,
      width: 49.25,
    })
  })

  it('跨日→单日左拉：预览应用最终 lane 位置，与保存后一致', () => {
    const cross = makeTask(3, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 5, 10) })
    const displacedSingle = makeTask(6)
    const tailCross = makeTask(7, { due_date: localIso(2026, 11, 4, 10), end_date: localIso(2026, 11, 5, 11) })
    const { onUpdateTask, rerender } = renderWeekView([cross, displacedSingle, tailCross])

    firePointer(startHandleOf(container_all_timed_blocks(7)[0]), 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointermove', dayCenterX(3))
    // 左拉到周四：真实范围变为周四 10:00-11:00，落在无冲突的周四列，无额外避让
    expect(previewGeometry()).toMatchObject({ top: 600, height: 60 })
    firePointer(window, 'pointerup', dayCenterX(3))
    expect(onUpdateTask).toHaveBeenCalledWith(7, { due_date: localIso(2026, 11, 5, 10) })

    rerender([
      cross,
      displacedSingle,
      makeTask(7, { due_date: localIso(2026, 11, 5, 10), end_date: localIso(2026, 11, 5, 11) }),
    ])
    expect(blockGeometry(container_first_timed_block(7))).toMatchObject({ top: 600, height: 60 })
  })

  it('无 end_date 的定时任务：右拉形成范围以原时分为结束时分；未拉伸不提交不自动补 end_date', () => {
    const task = makeTask(1, { end_date: null })
    const { onUpdateTask } = renderWeekView([task])

    const block = container_first_timed_block(1)
    const endHandle = block.querySelector('[data-span-resize-handle="end"]')
    expect(endHandle).not.toBeNull()

    // 未拉伸：按下即松开，不写入
    firePointer(endHandle!, 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointerup', dayCenterX(2))
    expect(onUpdateTask).not.toHaveBeenCalled()

    // 右拉至周四：原时分 09:00 作为目标日期的结束时分
    firePointer(endHandle!, 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointermove', dayCenterX(3))
    firePointer(window, 'pointerup', dayCenterX(3))
    expect(onUpdateTask).toHaveBeenCalledTimes(1)
    expect(onUpdateTask).toHaveBeenCalledWith(1, { end_date: localIso(2026, 11, 5, 9) })
  })

  it('跨周裁剪：start 段只有左手柄；拖左手柄只写 due_date，真实另一端不写入', () => {
    // 11-04 09:00 开始、11-11 10:00 结束：定时跨日留在时间网格，周内呈 start 段，右缘是裁剪边界
    const task = makeTask(1, { due_date: localIso(2026, 11, 4, 9), end_date: localIso(2026, 11, 11, 10) })
    const { onUpdateTask } = renderWeekView([task])

    const segments = container_all_timed_blocks(1)
    expect(segments.length).toBe(5) // 周三..周日 5 个日段
    const startHandles = document.querySelectorAll('[data-task][data-task-id="1"] [data-span-resize-handle="start"]')
    const endHandles = document.querySelectorAll('[data-task][data-task-id="1"] [data-span-resize-handle="end"]')
    expect(startHandles).toHaveLength(1) // 仅真实起点段有左手柄
    expect(endHandles).toHaveLength(0) // 真实结束在下周：裁剪边界不冒充端点

    firePointer(startHandles[0], 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointermove', dayCenterX(0)) // 拉到周一
    firePointer(window, 'pointerup', dayCenterX(0))

    expect(onUpdateTask).toHaveBeenCalledTimes(1)
    const patch = onUpdateTask.mock.calls[0][1] as Record<string, string>
    expect(patch.due_date).toBe(localIso(2026, 11, 2, 9))
    expect(patch).not.toHaveProperty('end_date')
  })

  it('end 段只有右手柄；middle 段无手柄（裁剪延续边界不冒充端点）', () => {
    // end 段：10-30 09:00 - 11-03 10:00 → 周内覆盖周一(11-02)..周二(11-03)，右缘为真实结束
    const endSegTask = makeTask(1, { due_date: localIso(2026, 10, 30, 9), end_date: localIso(2026, 11, 3, 10) })
    // middle 段：11-01 09:00 - 11-09 10:00 → 周内周一..周日均为 middle
    const middleSegTask = makeTask(2, { due_date: localIso(2026, 11, 1, 9), end_date: localIso(2026, 11, 9, 10) })
    renderWeekView([endSegTask, middleSegTask])

    // 任务 1：周内周一 middle + 周二 end；起点在上周 → 无左手柄，仅真实结束段右手柄
    const endSegments = container_all_timed_blocks(1)
    expect(endSegments).toHaveLength(2)
    expect(document.querySelectorAll('[data-task][data-task-id="1"] [data-span-resize-handle="start"]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-task][data-task-id="1"] [data-span-resize-handle="end"]')).toHaveLength(1)

    // 任务 2：整周均为 middle → 无任何日期手柄
    expect(container_all_timed_blocks(2).length).toBe(7)
    expect(document.querySelectorAll('[data-task][data-task-id="2"] [data-span-resize-handle]')).toHaveLength(0)
  })

  it('定时单日任务渲染左右手柄；手柄点击不触发详情与整体拖拽', () => {
    const task = makeTask(1)
    const { onTaskClick } = renderWeekView([task])

    const block = container_first_timed_block(1)
    expect(block.querySelector('[data-span-resize-handle="start"]')).not.toBeNull()
    expect(block.querySelector('[data-span-resize-handle="end"]')).not.toBeNull()

    const endHandle = block.querySelector('[data-span-resize-handle="end"]')!
    // 按下 + 抬起（未拉伸）不应打开详情
    firePointer(endHandle, 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointerup', dayCenterX(2))
    fireEvent.click(endHandle)
    expect(onTaskClick).not.toHaveBeenCalled()
  })

  it('Escape / pointercancel / 失焦取消预览且不写入', () => {
    const task = makeTask(1)
    const { onUpdateTask } = renderWeekView([task])

    const block = container_first_timed_block(1)
    const endHandle = block.querySelector('[data-span-resize-handle="end"]')!

    // Escape
    firePointer(endHandle, 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointermove', dayCenterX(3))
    expect(screen.queryByTestId('week-span-preview')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('week-span-preview')).not.toBeInTheDocument()
    firePointer(window, 'pointerup', dayCenterX(3))
    expect(onUpdateTask).not.toHaveBeenCalled()

    // pointercancel
    firePointer(endHandle, 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointermove', dayCenterX(3))
    firePointer(window, 'pointercancel', dayCenterX(3))
    expect(screen.queryByTestId('week-span-preview')).not.toBeInTheDocument()
    firePointer(window, 'pointerup', dayCenterX(3))
    expect(onUpdateTask).not.toHaveBeenCalled()

    // 失焦
    firePointer(endHandle, 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointermove', dayCenterX(3))
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(screen.queryByTestId('week-span-preview')).not.toBeInTheDocument()
    firePointer(window, 'pointerup', dayCenterX(3))
    expect(onUpdateTask).not.toHaveBeenCalled()

    expect(onUpdateTask).not.toHaveBeenCalled()
  })

  it('跨度调整期间任务条不可再进入 HTML5 整体拖拽（draggable=false）', () => {
    const task = makeTask(1)
    renderWeekView([task])

    const block = container_first_timed_block(1)
    expect(block.getAttribute('draggable')).toBe('true')
    const endHandle = block.querySelector('[data-span-resize-handle="end"]')!
    firePointer(endHandle, 'pointerdown', dayCenterX(2))
    expect(block.getAttribute('draggable')).toBe('false')
    firePointer(window, 'pointerup', dayCenterX(2))
    expect(block.getAttribute('draggable')).toBe('true')
  })

  it('禁止无效区间：右缘拉到开始之前不产生预览也不写入', () => {
    const task = makeTask(1)
    const { onUpdateTask } = renderWeekView([task])

    const block = container_first_timed_block(1)
    const endHandle = block.querySelector('[data-span-resize-handle="end"]')!
    firePointer(endHandle, 'pointerdown', dayCenterX(2))
    firePointer(window, 'pointermove', dayCenterX(1)) // 周二，早于开始日
    expect(screen.queryByTestId('week-span-preview')).not.toBeInTheDocument()
    firePointer(window, 'pointerup', dayCenterX(1))
    expect(onUpdateTask).not.toHaveBeenCalled()
  })
})

/** 定时任务块根元素（timed 变体没有 testid，用 data-task-id 定位） */
function container_first_timed_block(taskId: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"][data-task]`)
  expect(el).not.toBeNull()
  return el!
}

/** 定时任务的全部日段（跨日任务每个覆盖日一个段） */
function container_all_timed_blocks(taskId: number): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-task-id="${taskId}"][data-task]`))
}
