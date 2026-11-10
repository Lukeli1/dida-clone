import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { List, Task } from '../../../types'
import { CalendarTaskQuickDetail, type CalendarQuickDetailAnchor } from '../CalendarTaskQuickDetail'

const lists: List[] = [
  {
    id: 1,
    name: '收件箱',
    color: '#3b82f6',
    is_default: true,
    created_at: '2099-11-01T00:00:00.000Z',
    updated_at: '2099-11-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: '工作',
    color: '#10b981',
    is_default: false,
    created_at: '2099-11-01T00:00:00.000Z',
    updated_at: '2099-11-01T00:00:00.000Z',
  },
]

const localIso = (y: number, m: number, d: number, hour = 0, minute = 0) =>
  new Date(y, m - 1, d, hour, minute, 0, 0).toISOString()

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: '轻量详情任务',
    notes: null,
    priority: 2,
    due_date: localIso(2099, 11, 5, 9),
    end_date: localIso(2099, 11, 5, 10),
    all_day: false,
    reminder: null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: 1,
    created_at: '2099-11-01T00:00:00.000Z',
    updated_at: '2099-11-01T00:00:00.000Z',
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

interface RectLike {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

const defaultRect: RectLike = { left: 100, top: 100, right: 300, bottom: 124, width: 200, height: 24 }

function renderQuickDetail(
  task: Task,
  handlers: Partial<React.ComponentProps<typeof CalendarTaskQuickDetail>> = {},
  rect: RectLike = defaultRect,
) {
  const anchorEl = document.createElement('div')
  anchorEl.setAttribute('data-test-anchor', 'true')
  document.body.appendChild(anchorEl)
  Object.defineProperty(anchorEl, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => ({}) }),
  })
  const anchor: CalendarQuickDetailAnchor = { element: anchorEl, point: { x: rect.left, y: rect.top } }
  const onUpdate = vi.fn()
  const onToggle = vi.fn()
  const onClose = vi.fn()
  const onOpenFullDetail = vi.fn()
  const onDuplicate = vi.fn()
  const onArchive = vi.fn()
  const props = { onUpdate, onToggle, onClose, onOpenFullDetail, onDuplicate, onArchive, ...handlers }
  const view = render(<CalendarTaskQuickDetail task={task} lists={lists} anchor={anchor} {...props} />)
  return { ...view, anchorEl, anchor, onUpdate, onToggle, onClose, onOpenFullDetail, onDuplicate, onArchive }
}

function popup() {
  return screen.getByTestId('calendar-quick-detail')
}

async function changeAndBlur(input: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.change(input, { target: { value } })
    fireEvent.blur(input)
    // 让 blur 触发的异步保存及其状态更新落在 act 范围内。
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function openDateEditor() {
  fireEvent.click(within(popup()).getByTestId('calendar-quick-date-summary'))
  return screen.getByTestId('date-editor-popover')
}

function selectEditorDay(dateKey: string) {
  fireEvent.click(screen.getByTestId(`date-editor-day-${dateKey}`))
}

async function confirmDateEditor() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('date-editor-confirm'))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  localStorage.removeItem('taskNoteMode')
})

afterEach(() => {
  document.querySelectorAll('[data-test-anchor]').forEach((el) => el.remove())
})

describe('CalendarTaskQuickDetail 基础交互与定位', () => {
  it('通过 Portal 渲染在 body 下，具备 dialog 语义且不设置 modal 焦点陷阱', () => {
    renderQuickDetail(makeTask())
    const dialog = popup()
    expect(dialog.parentElement).toBe(document.body)
    expect(dialog).toHaveAttribute('role', 'dialog')
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(dialog).toHaveAttribute('tabindex', '-1')
    expect(dialog).toHaveFocus()
  })

  it('靠近视口右缘时翻到锚点左侧，并夹在视口内', () => {
    renderQuickDetail(makeTask(), {}, { left: 1000, top: 100, right: 1014, bottom: 124, width: 14, height: 24 })
    const dialog = popup()
    const left = Number.parseFloat(dialog.style.left)
    const top = Number.parseFloat(dialog.style.top)
    expect(left).toBeLessThan(1000)
    expect(left).toBeGreaterThanOrEqual(12)
    expect(top).toBeGreaterThanOrEqual(12)
    expect(top + 420).toBeLessThanOrEqual(window.innerHeight - 12 + 1)
  })

  it('锚点元素在挂载前已卸载时使用点击坐标兜底，不立即关闭', () => {
    const detached = document.createElement('div')
    const onClose = vi.fn()
    render(
      <CalendarTaskQuickDetail
        task={makeTask()}
        lists={lists}
        anchor={{ element: detached, point: { x: 200, y: 180 } }}
        onUpdate={vi.fn()}
        onToggle={vi.fn()}
        onClose={onClose}
        onOpenFullDetail={vi.fn()}
      />,
    )
    expect(popup()).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('锚点元素在打开后被移除时关闭弹窗', async () => {
    const { anchorEl, onClose } = renderQuickDetail(makeTask())
    expect(popup()).toBeInTheDocument()
    anchorEl.remove()
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('窗口 resize 后重新定位', async () => {
    const { anchorEl } = renderQuickDetail(makeTask())
    const before = popup().style.left
    Object.defineProperty(anchorEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 10,
        top: 40,
        right: 20,
        bottom: 64,
        width: 10,
        height: 24,
        x: 10,
        y: 40,
        toJSON: () => ({}),
      }),
    })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    await waitFor(() => expect(popup().style.left).not.toBe(before))
    expect(Number.parseFloat(popup().style.left)).toBeGreaterThanOrEqual(12)
  })

  it('点击外部、Escape 与关闭按钮均触发关闭', async () => {
    const first = renderQuickDetail(makeTask())
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(first.onClose).toHaveBeenCalledTimes(1))
    first.unmount()
    document.querySelectorAll('[data-test-anchor]').forEach((el) => el.remove())

    const second = renderQuickDetail(makeTask())
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(second.onClose).toHaveBeenCalledTimes(1))
    second.unmount()
    document.querySelectorAll('[data-test-anchor]').forEach((el) => el.remove())

    const third = renderQuickDetail(makeTask())
    fireEvent.click(within(popup()).getByRole('button', { name: '关闭任务详情' }))
    await waitFor(() => expect(third.onClose).toHaveBeenCalledTimes(1))
  })

  it('切换任务时内容更新并保持弹窗焦点', () => {
    const { rerender, anchor, onUpdate } = renderQuickDetail(makeTask())
    const nextTask = makeTask({
      id: 2,
      title: '第二个任务',
      due_date: localIso(2099, 11, 6, 14),
      end_date: localIso(2099, 11, 6, 15),
    })
    rerender(
      <CalendarTaskQuickDetail
        task={nextTask}
        lists={lists}
        anchor={anchor}
        onUpdate={onUpdate}
        onToggle={vi.fn()}
        onClose={vi.fn()}
        onOpenFullDetail={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('任务标题')).toHaveValue('第二个任务')
    expect(popup()).toHaveFocus()
  })
})

describe('CalendarTaskQuickDetail 字段更新', () => {
  it('标题编辑失焦后通过 onUpdate 保存', async () => {
    const { onUpdate } = renderQuickDetail(makeTask())
    await changeAndBlur(screen.getByLabelText('任务标题'), '新标题')
    expect(onUpdate).toHaveBeenCalledWith(1, { title: '新标题' })
  })

  it('完成状态切换调用 onToggle', () => {
    const task = makeTask()
    const { onToggle } = renderQuickDetail(task)
    fireEvent.click(within(popup()).getByRole('button', { name: '标记为已完成' }))
    expect(onToggle).toHaveBeenCalledWith(task)
  })

  it('优先级与所属清单切换通过 onUpdate 保存', () => {
    const { onUpdate } = renderQuickDetail(makeTask())
    fireEvent.click(screen.getByTestId('calendar-quick-priority-trigger'))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '高' }))
    expect(onUpdate).toHaveBeenCalledWith(1, { priority: 1 })
    fireEvent.click(screen.getByTestId('calendar-quick-list-trigger'))
    fireEvent.click(screen.getByRole('option', { name: '工作' }))
    expect(onUpdate).toHaveBeenCalledWith(1, { list_id: 2 })
  })

  it('非空备注显示预览，编辑后失焦保存 Markdown 原文', async () => {
    const { onUpdate } = renderQuickDetail(makeTask({ notes: '现有备注 **内容**' }))
    expect(screen.getByText('现有备注')).toBeInTheDocument()
    fireEvent.click(within(popup()).getByRole('button', { name: '编辑' }))
    const textarea = screen.getByPlaceholderText('添加备注... 支持 Markdown 语法')
    await changeAndBlur(textarea, '新的 Markdown 备注')
    expect(onUpdate).toHaveBeenCalledWith(1, { notes: '新的 Markdown 备注' })
  })

  it('空备注显示空状态', () => {
    renderQuickDetail(makeTask({ notes: null }))
    expect(screen.getByText('暂无备注内容')).toBeInTheDocument()
  })
})

describe('CalendarTaskQuickDetail 日期摘要与日期编辑器', () => {
  it('日期摘要具有可点击语义，点击后打开日期编辑器并可切换页签', () => {
    renderQuickDetail(makeTask())
    const summary = within(popup()).getByTestId('calendar-quick-date-summary')
    expect(summary.tagName).toBe('BUTTON')
    expect(summary).toHaveAttribute('aria-haspopup', 'dialog')
    expect(summary).toHaveAttribute('aria-expanded', 'false')
    expect(summary).toHaveAccessibleName('截止日期 11月5日，09:00 - 10:00')

    fireEvent.click(summary)
    expect(summary).toHaveAttribute('aria-expanded', 'true')
    const editor = screen.getByTestId('date-editor-popover')
    expect(editor.parentElement?.parentElement).toBe(document.body)
    expect(screen.getByTestId('date-editor-panel-date')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('date-editor-tab-time'))
    expect(screen.getByTestId('date-editor-panel-time')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('date-editor-tab-date'))
    expect(screen.getByTestId('date-editor-panel-date')).toBeInTheDocument()
  })

  it('点击某一天只更新编辑器草稿，不立即调用 onUpdate', () => {
    const { onUpdate } = renderQuickDetail(makeTask())
    openDateEditor()
    selectEditorDay('2099-11-06')

    expect(screen.getByTestId('date-editor-day-2099-11-06')).toHaveAttribute('aria-pressed', 'true')
    expect(onUpdate).not.toHaveBeenCalled()
    expect(popup()).toBeInTheDocument()
  })

  it('点击确定只提交一次并关闭日期编辑器', async () => {
    const { onUpdate } = renderQuickDetail(makeTask())
    openDateEditor()
    selectEditorDay('2099-11-06')
    await confirmDateEditor()

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith(1, {
      due_date: localIso(2099, 11, 6, 9),
      all_day: false,
      end_date: localIso(2099, 11, 6, 10),
    })
    expect(screen.queryByTestId('date-editor-popover')).not.toBeInTheDocument()
    expect(screen.getByTestId('calendar-quick-date-summary')).toHaveAccessibleName('截止日期 11月6日，09:00 - 10:00')
  })

  it('点击清除发送 due_date: null 与 end_date: null 并关闭编辑器', async () => {
    const { onUpdate } = renderQuickDetail(makeTask())
    openDateEditor()
    await act(async () => {
      fireEvent.click(screen.getByTestId('date-editor-clear'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith(1, { due_date: null, end_date: null })
    expect(screen.queryByTestId('date-editor-popover')).not.toBeInTheDocument()
    expect(screen.getByTestId('calendar-quick-date-summary')).toHaveTextContent('设置日期')
  })

  it('Escape 只取消未确认的日期编辑，不关闭任务详情', () => {
    const { onClose, onUpdate } = renderQuickDetail(makeTask())
    openDateEditor()
    selectEditorDay('2099-11-06')
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByTestId('date-editor-popover')).not.toBeInTheDocument()
    expect(popup()).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByTestId('calendar-quick-date-summary')).toHaveAccessibleName('截止日期 11月5日，09:00 - 10:00')
  })

  it('点击编辑器内部不会关闭任务详情；再次点击摘要可收起', () => {
    const { onClose } = renderQuickDetail(makeTask())
    const summary = within(popup()).getByTestId('calendar-quick-date-summary')
    fireEvent.click(summary)

    fireEvent.pointerDown(screen.getByTestId('date-editor-popover'))
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))
    expect(popup()).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(summary)
    expect(screen.queryByTestId('date-editor-popover')).not.toBeInTheDocument()
    expect(popup()).toBeInTheDocument()
  })
})

describe('CalendarTaskQuickDetail 日期保存语义', () => {
  it('全天单日：开始日保存为本地 00:00，结束为次日 00:00 排他', async () => {
    const { onUpdate } = renderQuickDetail(makeTask({ all_day: true, due_date: localIso(2099, 11, 5), end_date: null }))
    expect(within(popup()).getByTestId('calendar-quick-date-summary')).toHaveAccessibleName('截止日期 11月5日')

    openDateEditor()
    selectEditorDay('2099-11-06')
    await confirmDateEditor()

    expect(onUpdate).toHaveBeenCalledWith(1, {
      all_day: true,
      due_date: localIso(2099, 11, 6),
      end_date: localIso(2099, 11, 7),
    })
  })

  it('全天跨日：改开始日保留原跨度，结束仍为排他 00:00', async () => {
    const { onUpdate } = renderQuickDetail(
      makeTask({ all_day: true, due_date: localIso(2099, 11, 5), end_date: localIso(2099, 11, 8) }),
    )
    openDateEditor()
    expect(screen.getByTestId('date-editor-day-2099-11-05')).toHaveAttribute('aria-pressed', 'true')
    selectEditorDay('2099-11-10')
    await confirmDateEditor()

    expect(onUpdate).toHaveBeenCalledWith(1, {
      all_day: true,
      due_date: localIso(2099, 11, 10),
      end_date: localIso(2099, 11, 13), // 原跨度 3 天：11-10..11-12，排他 11-13
    })
  })

  it('定时任务改日期：保留原开始时间与持续时长', async () => {
    const { onUpdate } = renderQuickDetail(makeTask())
    openDateEditor()
    selectEditorDay('2099-11-06')
    await confirmDateEditor()

    expect(onUpdate).toHaveBeenCalledWith(1, {
      due_date: localIso(2099, 11, 6, 9),
      all_day: false,
      end_date: localIso(2099, 11, 6, 10),
    })
  })

  it('定时任务无结束时间：保存不自动补 end_date', async () => {
    const { onUpdate } = renderQuickDetail(makeTask({ end_date: null }))
    openDateEditor()
    selectEditorDay('2099-11-06')
    await confirmDateEditor()

    const payload = onUpdate.mock.calls[0][1] as Partial<Task>
    expect(payload).toEqual({ due_date: localIso(2099, 11, 6, 9), all_day: false })
    expect(payload).not.toHaveProperty('end_date')
  })

  it('时间段页可清除结束时间，发送 end_date: null', async () => {
    const { onUpdate } = renderQuickDetail(makeTask())
    openDateEditor()
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))
    fireEvent.click(screen.getByTestId('date-editor-clear-end-time'))
    await confirmDateEditor()

    expect(onUpdate).toHaveBeenCalledWith(1, {
      due_date: localIso(2099, 11, 5, 9),
      all_day: false,
      end_date: null,
    })
  })

  it('非法结束时间显示错误且确定不可用', () => {
    const { onUpdate } = renderQuickDetail(makeTask())
    openDateEditor()
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))
    fireEvent.change(screen.getByTestId('date-editor-end-time'), { target: { value: '08:00' } })

    expect(screen.getByTestId('date-editor-error')).toHaveTextContent('结束时间必须晚于开始时间')
    const confirm = screen.getByTestId('date-editor-confirm')
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('全天任务在时间段页显示全天状态且不渲染时间输入', () => {
    renderQuickDetail(makeTask({ all_day: true, due_date: localIso(2099, 11, 5), end_date: null }))
    openDateEditor()
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))

    expect(screen.getByTestId('date-editor-all-day-state')).toHaveTextContent('全天任务不设置具体时间')
    expect(screen.queryByTestId('date-editor-start-time')).not.toBeInTheDocument()
    expect(screen.queryByTestId('date-editor-end-time')).not.toBeInTheDocument()
  })
})

describe('CalendarTaskQuickDetail 底部入口', () => {
  it('复制、归档与打开完整详情调用对应回调', async () => {
    const { onDuplicate, onArchive, onOpenFullDetail } = renderQuickDetail(makeTask())
    fireEvent.click(screen.getByTestId('calendar-quick-more-trigger'))
    fireEvent.click(within(popup()).getByRole('menuitem', { name: '复制任务' }))
    expect(onDuplicate).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByTestId('calendar-quick-more-trigger'))
    fireEvent.click(within(popup()).getByRole('menuitem', { name: '归档任务' }))
    expect(onArchive).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByTestId('calendar-quick-more-trigger'))
    fireEvent.click(within(popup()).getByRole('menuitem', { name: '打开完整详情' }))
    await waitFor(() => expect(onOpenFullDetail).toHaveBeenCalledWith(1))
  })
})

describe('CalendarTaskQuickDetail 关闭前提交草稿', () => {
  it('点击外部关闭前提交未 blur 的标题草稿，且只写入一次', async () => {
    const { onUpdate, onClose } = renderQuickDetail(makeTask())
    const title = screen.getByLabelText('任务标题')
    title.focus()
    fireEvent.change(title, { target: { value: '未失焦标题' } })

    fireEvent.pointerDown(document.body)

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(1, { title: '未失焦标题' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('Escape 关闭前提交未 blur 的备注草稿', async () => {
    const { onUpdate, onClose } = renderQuickDetail(makeTask())
    fireEvent.click(within(popup()).getByRole('button', { name: '编辑' }))
    const notes = screen.getByPlaceholderText('添加备注... 支持 Markdown 语法')
    notes.focus()
    fireEvent.change(notes, { target: { value: '未失焦 Markdown 备注' } })

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(1, { notes: '未失焦 Markdown 备注' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('日期编辑器确认后立即保存；随后点击外部关闭不重复提交', async () => {
    const { onUpdate, onClose } = renderQuickDetail(makeTask())
    openDateEditor()
    selectEditorDay('2099-11-06')
    await confirmDateEditor()

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(1, {
        due_date: localIso(2099, 11, 6, 9),
        all_day: false,
        end_date: localIso(2099, 11, 6, 10),
      }),
    )
    fireEvent.pointerDown(document.body)

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('全天跨日确认后 Escape 关闭只提交一次', async () => {
    const { onUpdate, onClose } = renderQuickDetail(
      makeTask({ all_day: true, due_date: localIso(2099, 11, 5), end_date: localIso(2099, 11, 8) }),
    )
    openDateEditor()
    selectEditorDay('2099-11-10')
    await confirmDateEditor()

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(1, {
        all_day: true,
        due_date: localIso(2099, 11, 10),
        end_date: localIso(2099, 11, 13),
      }),
    )
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('非法结束时间不可确认，Escape 只取消编辑且不关闭任务详情', () => {
    const { onUpdate, onClose } = renderQuickDetail(makeTask())
    openDateEditor()
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))
    fireEvent.change(screen.getByTestId('date-editor-end-time'), { target: { value: '08:00' } })

    expect(screen.getByTestId('date-editor-error')).toHaveTextContent('结束时间必须晚于开始时间')
    fireEvent.click(screen.getByTestId('date-editor-confirm'))
    expect(onUpdate).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('date-editor-popover')).not.toBeInTheDocument()
    expect(popup()).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('关闭按钮与打开完整详情也提交有效草稿，标题不重复写入', async () => {
    const first = renderQuickDetail(makeTask())
    const title = screen.getByLabelText('任务标题')
    title.focus()
    fireEvent.change(title, { target: { value: '关闭按钮标题' } })
    fireEvent.click(within(popup()).getByRole('button', { name: '关闭任务详情' }))

    await waitFor(() => expect(first.onUpdate).toHaveBeenCalledWith(1, { title: '关闭按钮标题' }))
    await waitFor(() => expect(first.onClose).toHaveBeenCalledTimes(1))
    expect(first.onUpdate).toHaveBeenCalledTimes(1)
    first.unmount()
    document.querySelectorAll('[data-test-anchor]').forEach((el) => el.remove())

    const second = renderQuickDetail(makeTask())
    const title2 = screen.getByLabelText('任务标题')
    title2.focus()
    fireEvent.change(title2, { target: { value: '完整详情标题' } })
    fireEvent.click(within(popup()).getByRole('button', { name: '编辑' }))
    const notes = screen.getByPlaceholderText('添加备注... 支持 Markdown 语法')
    notes.focus()
    fireEvent.change(notes, { target: { value: '打开完整详情备注' } })
    fireEvent.click(screen.getByTestId('calendar-quick-more-trigger'))
    fireEvent.click(within(popup()).getByRole('menuitem', { name: '打开完整详情' }))

    await waitFor(() => expect(second.onOpenFullDetail).toHaveBeenCalledWith(1))
    expect(second.onUpdate.mock.calls.filter(([, updates]) => updates.title === '完整详情标题')).toHaveLength(1)
    await waitFor(() => expect(second.onUpdate).toHaveBeenCalledWith(1, { notes: '打开完整详情备注' }))
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('CalendarTaskQuickDetail 异步保存与失败重试', () => {
  it('标题延迟保存失败：Escape 后弹窗与草稿保留，重试成功后才关闭', async () => {
    const pending = deferred<boolean>()
    const onUpdate = vi.fn(() => pending.promise)
    const { onClose } = renderQuickDetail(makeTask(), { onUpdate })
    const title = screen.getByLabelText('任务标题')
    title.focus()
    fireEvent.change(title, { target: { value: '会失败的标题' } })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(popup()).toBeInTheDocument()

    pending.resolve(false)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('标题保存失败'))
    expect(onClose).not.toHaveBeenCalled()
    expect(popup()).toBeInTheDocument()
    expect(screen.getByLabelText('任务标题')).toHaveValue('会失败的标题')

    onUpdate.mockImplementation(() => Promise.resolve(true))
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onUpdate).toHaveBeenCalledTimes(2)
  })

  it('开始保存后立刻重复关闭：只提交一次，等待成功后才关闭', async () => {
    const pending = deferred<boolean>()
    const onUpdate = vi.fn(() => pending.promise)
    const { onClose } = renderQuickDetail(makeTask(), { onUpdate })
    const title = screen.getByLabelText('任务标题')
    title.focus()
    fireEvent.change(title, { target: { value: '延迟标题' } })

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(within(popup()).getByRole('button', { name: '关闭任务详情' }))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()

    pending.resolve(true)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('备注延迟保存失败：弹窗、备注草稿与错误保留，重试成功后才关闭', async () => {
    const pending = deferred<boolean>()
    const onUpdate = vi.fn(() => pending.promise)
    const { onClose } = renderQuickDetail(makeTask(), { onUpdate })
    fireEvent.click(within(popup()).getByRole('button', { name: '编辑' }))
    const notes = screen.getByPlaceholderText('添加备注... 支持 Markdown 语法')
    notes.focus()
    fireEvent.change(notes, { target: { value: '会失败的备注' } })

    fireEvent.keyDown(document, { key: 'Escape' })
    pending.resolve(false)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('备注保存失败'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('添加备注... 支持 Markdown 语法')).toHaveValue('会失败的备注')

    onUpdate.mockImplementation(() => Promise.resolve(true))
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('日期延迟保存失败：弹窗、日期草稿与错误保留，重试成功后才关闭', async () => {
    const pending = deferred<boolean>()
    const onUpdate = vi.fn(() => pending.promise)
    const { onClose } = renderQuickDetail(makeTask(), { onUpdate })
    openDateEditor()
    selectEditorDay('2099-11-06')
    fireEvent.click(screen.getByTestId('date-editor-confirm'))

    fireEvent.keyDown(document, { key: 'Escape' })
    pending.resolve(false)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('日期保存失败'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('calendar-quick-date-summary')).toHaveTextContent('11月6日')
    expect(screen.getByTestId('calendar-quick-date-summary')).toHaveAccessibleName('截止日期 11月6日，09:00 - 10:00')

    onUpdate.mockImplementation(() => Promise.resolve(true))
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})

describe('CalendarTaskQuickDetail 清除日期边界', () => {
  it('清除日期同步清空 due_date 与 end_date，只提交一次且不递归', async () => {
    const { onUpdate } = renderQuickDetail(makeTask())
    openDateEditor()
    await act(async () => {
      fireEvent.click(screen.getByTestId('date-editor-clear'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onUpdate).toHaveBeenCalledWith(1, { due_date: null, end_date: null })
    expect(screen.getByTestId('calendar-quick-date-summary')).toHaveTextContent('设置日期')
    expect(onUpdate).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
  })
})

describe('CalendarTaskQuickDetail 全天归一化与跨字段稳定性', () => {
  it('全天开始日移到原结束日之后：沿用原跨度，有限请求内结束且不重复提交同一 Patch', async () => {
    const patches: Partial<Task>[] = []
    const onUpdate = vi.fn(async (_id: number, updates: Partial<Task>) => {
      patches.push(updates)
      // 测试侧安全上限：失败实现若递归提交，最多 3 次即中止，避免 OOM。
      if (patches.length > 3) throw new Error('test update cap exceeded')
      return true
    })
    const { onClose } = renderQuickDetail(
      makeTask({ all_day: true, due_date: localIso(2099, 11, 5), end_date: localIso(2099, 11, 8) }),
      { onUpdate },
    )

    openDateEditor()
    selectEditorDay('2099-11-10')
    await confirmDateEditor()

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
    expect(patches[0]).toEqual({
      all_day: true,
      due_date: localIso(2099, 11, 10),
      end_date: localIso(2099, 11, 13), // 原跨度 3 天：11-10..11-12，排他 11-13
    })
    expect(screen.getByTestId('calendar-quick-date-summary')).toHaveAccessibleName('截止日期 11月10日 - 11月12日')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('全天清除日期：同步清空 due_date 与 end_date，只提交一次', async () => {
    const { onUpdate } = renderQuickDetail(
      makeTask({ all_day: true, due_date: localIso(2099, 11, 5), end_date: localIso(2099, 11, 6) }),
    )
    openDateEditor()
    await act(async () => {
      fireEvent.click(screen.getByTestId('date-editor-clear'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onUpdate).toHaveBeenCalledWith(1, { due_date: null, end_date: null })
    expect(screen.getByTestId('calendar-quick-date-summary')).toHaveTextContent('设置日期')
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('归一化保存期间用户继续改日期：不覆盖新输入，按新输入再次保存', async () => {
    const firstSave = deferred<boolean>()
    const patches: Partial<Task>[] = []
    const onUpdate = vi.fn((_id: number, updates: Partial<Task>) => {
      patches.push(updates)
      if (patches.length > 4) throw new Error('test update cap exceeded')
      return patches.length === 1 ? firstSave.promise : Promise.resolve(true)
    })
    const { onClose } = renderQuickDetail(
      makeTask({ all_day: true, due_date: localIso(2099, 11, 5), end_date: localIso(2099, 11, 8) }),
      { onUpdate },
    )

    openDateEditor()
    selectEditorDay('2099-11-10')
    fireEvent.click(screen.getByTestId('date-editor-confirm'))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))

    // 第一次保存挂起期间继续把开始日改到 11-15；原跨度 3 天应得到 11-15..11-17。
    openDateEditor()
    selectEditorDay('2099-11-15')
    fireEvent.click(screen.getByTestId('date-editor-confirm'))

    await act(async () => {
      firstSave.resolve(true)
    })

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2))
    expect(patches[0]).toEqual({
      all_day: true,
      due_date: localIso(2099, 11, 10),
      end_date: localIso(2099, 11, 13),
    })
    expect(patches[1]).toEqual({
      all_day: true,
      due_date: localIso(2099, 11, 15),
      end_date: localIso(2099, 11, 18), // 11-15..11-17，排他 11-18
    })
    expect(screen.getByTestId('calendar-quick-date-summary')).toHaveAccessibleName('截止日期 11月15日 - 11月17日')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onUpdate).toHaveBeenCalledTimes(2)
  })

  it('锚点卸载且保存失败：自动关闭只尝试一次，不无限重试；显式重试成功后才关闭', async () => {
    const pending = deferred<boolean>()
    const onUpdate = vi.fn(() => pending.promise)
    const { anchorEl, onClose } = renderQuickDetail(makeTask(), { onUpdate })
    const title = screen.getByLabelText('任务标题')
    title.focus()
    fireEvent.change(title, { target: { value: '失败草稿' } })

    anchorEl.remove()
    for (let i = 0; i < 5; i += 1) {
      act(() => {
        window.dispatchEvent(new Event('scroll'))
      })
    }
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))

    await act(async () => {
      pending.resolve(false)
    })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('标题保存失败'))
    expect(popup()).toBeInTheDocument()
    expect(screen.getByLabelText('任务标题')).toHaveValue('失败草稿')

    for (let i = 0; i < 5; i += 1) {
      act(() => {
        window.dispatchEvent(new Event('scroll'))
      })
    }
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()

    onUpdate.mockImplementation(() => Promise.resolve(true))
    fireEvent.click(within(popup()).getByRole('button', { name: '关闭任务详情' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onUpdate).toHaveBeenCalledTimes(2)
  })

  it('备注慢、标题快：等待期间再次编辑标题，全部保存成功后才关闭', async () => {
    const notesPending = deferred<boolean>()
    const calls: Partial<Task>[] = []
    const onUpdate = vi.fn((_id: number, updates: Partial<Task>) => {
      calls.push(updates)
      if (calls.length > 6) throw new Error('test update cap exceeded')
      if ('notes' in updates) return notesPending.promise
      return Promise.resolve(true)
    })
    const { onClose } = renderQuickDetail(makeTask({ notes: null }), { onUpdate })

    fireEvent.click(within(popup()).getByRole('button', { name: '编辑' }))
    const notes = screen.getByPlaceholderText('添加备注... 支持 Markdown 语法')
    notes.focus()
    fireEvent.change(notes, { target: { value: '慢备注' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(calls.some((call) => 'notes' in call)).toBe(true))

    const title = screen.getByLabelText('任务标题')
    title.focus()
    fireEvent.change(title, { target: { value: '等待期间新标题' } })

    await act(async () => {
      notesPending.resolve(true)
    })

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(calls.some((call) => 'notes' in call)).toBe(true)
    expect(calls.some((call) => call.title === '等待期间新标题')).toBe(true)
  })

  it('标题慢、日期再次编辑：等待期间的新日期也保存后才关闭', async () => {
    const titlePending = deferred<boolean>()
    const calls: Partial<Task>[] = []
    const onUpdate = vi.fn((_id: number, updates: Partial<Task>) => {
      calls.push(updates)
      if (calls.length > 6) throw new Error('test update cap exceeded')
      if ('title' in updates) return titlePending.promise
      return Promise.resolve(true)
    })
    const { onClose } = renderQuickDetail(makeTask(), { onUpdate })

    const title = screen.getByLabelText('任务标题')
    title.focus()
    fireEvent.change(title, { target: { value: '慢标题' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(calls.some((call) => 'title' in call)).toBe(true))

    openDateEditor()
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))
    fireEvent.change(screen.getByTestId('date-editor-start-time'), { target: { value: '14:00' } })
    fireEvent.click(screen.getByTestId('date-editor-confirm'))

    await waitFor(() => expect(calls.some((call) => call.due_date === localIso(2099, 11, 5, 14))).toBe(true))

    await act(async () => {
      titlePending.resolve(true)
    })

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(calls.some((call) => call.title === '慢标题')).toBe(true)
    expect(calls.some((call) => call.due_date === localIso(2099, 11, 5, 14))).toBe(true)
  })
})

describe('CalendarTaskQuickDetail 标题/日期单飞', () => {
  it('标题 blur 保存挂起 + 关闭等待：新标题只写一次', async () => {
    const first = deferred<boolean>()
    const calls: Partial<Task>[] = []
    const onUpdate = vi.fn((_id: number, updates: Partial<Task>) => {
      calls.push(updates)
      return calls.length === 1 ? first.promise : Promise.resolve(true)
    })
    const { onClose } = renderQuickDetail(makeTask(), { onUpdate })
    const title = screen.getByLabelText('任务标题')
    title.focus()
    fireEvent.change(title, { target: { value: 'T1' } })
    fireEvent.blur(title)
    await waitFor(() => expect(calls).toHaveLength(1))

    title.focus()
    fireEvent.change(title, { target: { value: 'T2' } })
    fireEvent.keyDown(document, { key: 'Escape' })

    await act(async () => {
      first.resolve(true)
    })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(calls.filter((call) => call.title === 'T2')).toHaveLength(1)
  })

  it('日期保存挂起 + 关闭等待：新日期 Patch 只写一次', async () => {
    const first = deferred<boolean>()
    const calls: Partial<Task>[] = []
    const onUpdate = vi.fn((_id: number, updates: Partial<Task>) => {
      calls.push(updates)
      return calls.length === 1 ? first.promise : Promise.resolve(true)
    })
    const { onClose } = renderQuickDetail(makeTask(), { onUpdate })

    openDateEditor()
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))
    fireEvent.change(screen.getByTestId('date-editor-start-time'), { target: { value: '14:00' } })
    fireEvent.click(screen.getByTestId('date-editor-confirm'))
    await waitFor(() => expect(calls).toHaveLength(1))

    openDateEditor()
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))
    fireEvent.change(screen.getByTestId('date-editor-start-time'), { target: { value: '16:00' } })
    fireEvent.click(screen.getByTestId('date-editor-confirm'))
    fireEvent.keyDown(document, { key: 'Escape' })

    await act(async () => {
      first.resolve(true)
    })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(calls.filter((call) => call.due_date === localIso(2099, 11, 5, 16))).toHaveLength(1)
  })
})
