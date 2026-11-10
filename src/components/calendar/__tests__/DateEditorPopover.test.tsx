import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../types'
import { DateEditorPopover } from '../DateEditorPopover'

const localIso = (y: number, m: number, d: number, hour = 0, minute = 0) =>
  new Date(y, m - 1, d, hour, minute, 0, 0).toISOString()

function renderEditor(
  taskOverrides: Partial<Pick<Task, 'due_date' | 'end_date' | 'all_day'>> = {},
  handlers: Partial<React.ComponentProps<typeof DateEditorPopover>> = {},
) {
  const anchorEl = document.createElement('button')
  anchorEl.type = 'button'
  anchorEl.setAttribute('data-date-editor-anchor', 'true')
  document.body.appendChild(anchorEl)
  const onConfirm = vi.fn()
  const onClear = vi.fn()
  const onCancel = vi.fn()
  const props = {
    task: {
      due_date: localIso(2026, 11, 5, 9),
      end_date: localIso(2026, 11, 5, 10),
      all_day: false,
      ...taskOverrides,
    },
    anchorRef: { current: anchorEl },
    onConfirm,
    onClear,
    onCancel,
    ...handlers,
  }
  const view = render(<DateEditorPopover {...props} />)
  return { ...view, anchorEl, onConfirm, onClear, onCancel }
}

beforeEach(() => {
  // 每个用例由 RTL 自动清理渲染容器；这里只清理手工挂载的锚点按钮。
  document.querySelectorAll('[data-date-editor-anchor]').forEach((el) => el.remove())
})

afterEach(() => {
  document.querySelectorAll('[data-date-editor-anchor]').forEach((el) => el.remove())
})

describe('DateEditorPopover 基础结构', () => {
  it('通过 Portal 渲染在 body 下，默认显示日期页与当前选中日期', () => {
    renderEditor()
    const editor = screen.getByTestId('date-editor-popover')
    expect(editor.parentElement?.parentElement).toBe(document.body)
    expect(editor).toHaveAttribute('role', 'dialog')
    expect(screen.getByTestId('date-editor-panel-date')).toBeInTheDocument()
    expect(screen.getByTestId('date-editor-day-2026-11-05')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('date-editor-month-title')).toHaveTextContent('2026年11月')
  })

  it('日期页与时间段页可以切换', () => {
    renderEditor()
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))
    expect(screen.getByTestId('date-editor-panel-time')).toBeInTheDocument()
    expect(screen.getByTestId('date-editor-tab-time')).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByTestId('date-editor-panel-date')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('date-editor-tab-date'))
    expect(screen.getByTestId('date-editor-panel-date')).toBeInTheDocument()
  })

  it('今天 / 明天 / 7天后快捷选项更新选中日期但不提交', () => {
    const { onConfirm } = renderEditor()
    const today = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    const key = (offset: number) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    fireEvent.click(screen.getByTestId('date-editor-quick-tomorrow'))
    expect(screen.getByTestId(`date-editor-day-${key(1)}`)).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('date-editor-quick-7days'))
    expect(screen.getByTestId(`date-editor-day-${key(7)}`)).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('date-editor-quick-today'))
    expect(screen.getByTestId(`date-editor-day-${key(0)}`)).toHaveAttribute('aria-pressed', 'true')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('上个月 / 回到今天 / 下个月切换月份', () => {
    renderEditor()
    fireEvent.click(screen.getByTestId('date-editor-next-month'))
    expect(screen.getByTestId('date-editor-month-title')).toHaveTextContent('2026年12月')
    fireEvent.click(screen.getByTestId('date-editor-prev-month'))
    expect(screen.getByTestId('date-editor-month-title')).toHaveTextContent('2026年11月')
    fireEvent.click(screen.getByTestId('date-editor-prev-month'))
    expect(screen.getByTestId('date-editor-month-title')).toHaveTextContent('2026年10月')
    fireEvent.click(screen.getByTestId('date-editor-today'))
    const today = new Date()
    expect(screen.getByTestId('date-editor-month-title')).toHaveTextContent(
      `${today.getFullYear()}年${today.getMonth() + 1}月`,
    )
  })
})

describe('DateEditorPopover 日期草稿', () => {
  it('点击某一天只更新草稿，不立即调用 onConfirm', () => {
    const { onConfirm } = renderEditor()
    fireEvent.click(screen.getByTestId('date-editor-day-2026-11-06'))
    expect(screen.getByTestId('date-editor-day-2026-11-06')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('date-editor-day-2026-11-05')).toHaveAttribute('aria-pressed', 'false')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('定时任务改日期后保留原开始时间与持续时长，点击确定只提交一次', () => {
    const { onConfirm } = renderEditor()
    fireEvent.click(screen.getByTestId('date-editor-day-2026-11-06'))
    fireEvent.click(screen.getByTestId('date-editor-confirm'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({
      due_date: localIso(2026, 11, 6, 9),
      all_day: false,
      end_date: localIso(2026, 11, 6, 10),
    })
  })

  it('时间段页修改开始时间时保持原持续时长', () => {
    const { onConfirm } = renderEditor()
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))
    fireEvent.change(screen.getByTestId('date-editor-start-time'), { target: { value: '14:00' } })
    fireEvent.click(screen.getByTestId('date-editor-confirm'))

    expect(onConfirm).toHaveBeenCalledWith({
      due_date: localIso(2026, 11, 5, 14),
      all_day: false,
      end_date: localIso(2026, 11, 5, 15),
    })
  })

  it('结束时间早于开始时间时显示错误且不可确认', () => {
    const { onConfirm } = renderEditor()
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))
    fireEvent.change(screen.getByTestId('date-editor-end-time'), { target: { value: '08:00' } })

    expect(screen.getByTestId('date-editor-error')).toHaveTextContent('结束时间必须晚于开始时间')
    expect(screen.getByTestId('date-editor-end-time')).toHaveAttribute('aria-invalid', 'true')
    const confirm = screen.getByTestId('date-editor-confirm')
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('清除结束时间后保存 end_date: null', () => {
    const { onConfirm } = renderEditor()
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))
    fireEvent.click(screen.getByTestId('date-editor-clear-end-time'))
    expect(screen.getByTestId('date-editor-end-time')).toHaveValue('')
    fireEvent.click(screen.getByTestId('date-editor-confirm'))

    expect(onConfirm).toHaveBeenCalledWith({
      due_date: localIso(2026, 11, 5, 9),
      all_day: false,
      end_date: null,
    })
  })

  it('无结束时间的任务不会自动补 end_date', () => {
    const { onConfirm } = renderEditor({ end_date: null })
    fireEvent.click(screen.getByTestId('date-editor-day-2026-11-06'))
    fireEvent.click(screen.getByTestId('date-editor-confirm'))

    const patch = onConfirm.mock.calls[0][0] as Partial<Task>
    expect(patch).toEqual({ due_date: localIso(2026, 11, 6, 9), all_day: false })
    expect(patch).not.toHaveProperty('end_date')
  })
})

describe('DateEditorPopover 全天语义', () => {
  it('全天单日保存为本地 00:00，结束为次日 00:00 排他', () => {
    const { onConfirm } = renderEditor({ due_date: localIso(2026, 11, 5), end_date: null, all_day: true })
    fireEvent.click(screen.getByTestId('date-editor-day-2026-11-06'))
    fireEvent.click(screen.getByTestId('date-editor-confirm'))

    expect(onConfirm).toHaveBeenCalledWith({
      all_day: true,
      due_date: localIso(2026, 11, 6),
      end_date: localIso(2026, 11, 7),
    })
  })

  it('全天跨日改开始日后保留原跨度', () => {
    const { onConfirm } = renderEditor({
      due_date: localIso(2026, 11, 5),
      end_date: localIso(2026, 11, 8),
      all_day: true,
    })
    fireEvent.click(screen.getByTestId('date-editor-day-2026-11-10'))
    fireEvent.click(screen.getByTestId('date-editor-confirm'))

    expect(onConfirm).toHaveBeenCalledWith({
      all_day: true,
      due_date: localIso(2026, 11, 10),
      end_date: localIso(2026, 11, 13),
    })
  })

  it('全天任务在时间段页显示全天状态且不渲染时间输入', () => {
    renderEditor({ due_date: localIso(2026, 11, 5), end_date: null, all_day: true })
    fireEvent.click(screen.getByTestId('date-editor-tab-time'))

    expect(screen.getByTestId('date-editor-all-day-state')).toHaveTextContent('全天任务不设置具体时间')
    expect(screen.queryByTestId('date-editor-start-time')).not.toBeInTheDocument()
    expect(screen.queryByTestId('date-editor-end-time')).not.toBeInTheDocument()
  })
})

describe('DateEditorPopover 清除与取消', () => {
  it('点击清除调用 onClear', () => {
    const { onClear } = renderEditor()
    fireEvent.click(screen.getByTestId('date-editor-clear'))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('Escape 取消未确认修改', () => {
    const { onCancel, onConfirm } = renderEditor()
    fireEvent.click(screen.getByTestId('date-editor-day-2026-11-06'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('点击编辑器外部取消，点击内部不取消', () => {
    const { onCancel } = renderEditor()
    fireEvent.mouseDown(screen.getByTestId('date-editor-popover'))
    expect(onCancel).not.toHaveBeenCalled()

    fireEvent.mouseDown(document.body)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('点击触发按钮本身不视为外部取消', () => {
    const { anchorEl, onCancel } = renderEditor()
    fireEvent.mouseDown(anchorEl)
    expect(onCancel).not.toHaveBeenCalled()
  })
})
