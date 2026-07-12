import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../types'
import { CommandPalette } from '../CommandPalette'
import { useUIStore } from '../../stores/uiStore'
import { useTaskStore } from '../../stores/taskStore'
import {
  buildCommandPaletteItems,
  searchTasksForCommandPalette,
  COMMAND_DEFINITIONS,
} from '../../hooks/useCommandPalette'
import { DEFAULT_SHORTCUT_BINDINGS } from '../../utils/shortcuts'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useRef } from 'react'

function makeTask(id: number, overrides: Partial<Task> = {}): Task {
  const now = '2026-07-01T00:00:00.000Z'
  return {
    id,
    title: `任务 ${id}`,
    notes: null,
    priority: 0,
    due_date: null,
    end_date: null,
    all_day: false,
    reminder: null,
    completed: false,
    archived: false,
    pinned: false,
    list_id: 1,
    parent_id: null,
    repeat_rule: null,
    sort_order: id,
    created_at: now,
    updated_at: now,
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

function ShortcutHost() {
  const newTaskInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  useKeyboardShortcuts(newTaskInputRef, searchInputRef)
  return (
    <div>
      <button type="button" data-testid="prev-focus">
        打开前焦点
      </button>
      <input data-testid="host-input" ref={newTaskInputRef} />
      <input data-testid="host-search" ref={searchInputRef} />
      <CommandPalette newTaskInputRef={newTaskInputRef} searchInputRef={searchInputRef} />
    </div>
  )
}

function openPalette() {
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
}

/** 刷新双 rAF 焦点策略（与 CommandPalette.applyFocusPolicy 对齐） */
async function flushFocusPolicy() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })
  })
}

/** 刷新打开时 setTimeout(0) 自动聚焦输入框 */
async function flushOpenFocus() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), 0)
    })
  })
}

describe('CommandPalette', () => {
  beforeEach(() => {
    useUIStore.setState({
      currentView: 'tasks',
      selectedListId: null,
      selectedTagId: null,
      selectedTaskId: null,
      commandPaletteOpen: false,
      shortcutsHelpOpen: false,
      searchQuery: '',
      customShortcuts: {},
    })
    useTaskStore.setState({
      tasks: [],
      loading: false,
    })
  })

  it('DEFAULT_SHORTCUT_BINDINGS 包含 commandPalette / Ctrl+K', () => {
    const binding = DEFAULT_SHORTCUT_BINDINGS.find((b) => b.id === 'commandPalette')
    expect(binding).toBeDefined()
    expect(binding?.defaultKeys).toBe('Ctrl+K')
  })

  it('固定命令覆盖文档要求的 14 项', () => {
    expect(COMMAND_DEFINITIONS.map((c) => c.title)).toEqual([
      '全部任务',
      '今日任务',
      '日历',
      '统计',
      'AI 助手',
      '四象限',
      '番茄钟',
      '习惯',
      '模板',
      '目标 / OKR',
      '设置',
      '新建任务',
      '聚焦搜索',
      '打开快捷键帮助',
    ])
  })

  it('Ctrl+K 打开命令面板', () => {
    render(<ShortcutHost />)
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
    openPalette()
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    expect(useUIStore.getState().commandPaletteOpen).toBe(true)
  })

  it('在输入框中按 Ctrl+K 仍能打开', () => {
    render(<ShortcutHost />)
    const input = screen.getByTestId('host-input')
    input.focus()
    fireEvent.keyDown(input, { key: 'k', ctrlKey: true })
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
  })

  it('输入“日历”可找到“日历”命令', () => {
    useUIStore.setState({ commandPaletteOpen: true })
    const newTaskInputRef = { current: null }
    const searchInputRef = { current: null }
    render(<CommandPalette newTaskInputRef={newTaskInputRef} searchInputRef={searchInputRef} />)

    fireEvent.change(screen.getByTestId('command-palette-input'), { target: { value: '日历' } })
    expect(screen.getByTestId('command-item-view-calendar')).toBeInTheDocument()
    expect(screen.getByText('日历')).toBeInTheDocument()
  })

  it('Enter 执行“日历”后 currentView 变为 calendar', () => {
    useUIStore.setState({ commandPaletteOpen: true, currentView: 'tasks' })
    const newTaskInputRef = { current: null }
    const searchInputRef = { current: null }
    render(<CommandPalette newTaskInputRef={newTaskInputRef} searchInputRef={searchInputRef} />)

    const input = screen.getByTestId('command-palette-input')
    fireEvent.change(input, { target: { value: '日历' } })

    // 高亮第一项应为日历
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(useUIStore.getState().currentView).toBe('calendar')
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })

  it('Esc 关闭命令面板', () => {
    useUIStore.setState({ commandPaletteOpen: true })
    const newTaskInputRef = { current: null }
    const searchInputRef = { current: null }
    render(<CommandPalette newTaskInputRef={newTaskInputRef} searchInputRef={searchInputRef} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
  })

  it('上下键改变高亮项', () => {
    useUIStore.setState({ commandPaletteOpen: true })
    const newTaskInputRef = { current: null }
    const searchInputRef = { current: null }
    render(<CommandPalette newTaskInputRef={newTaskInputRef} searchInputRef={searchInputRef} />)

    const first = screen.getByTestId('command-item-view-tasks')
    expect(first).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    const second = screen.getByTestId('command-item-view-today')
    expect(second).toHaveAttribute('aria-selected', 'true')
    expect(first).toHaveAttribute('aria-selected', 'false')

    fireEvent.keyDown(document, { key: 'ArrowUp' })
    expect(first).toHaveAttribute('aria-selected', 'true')
  })

  it('搜索任务最多显示 10 条', () => {
    const tasks = Array.from({ length: 15 }, (_, i) => makeTask(i + 1, { title: `会议事项 ${i + 1}` }))
    expect(searchTasksForCommandPalette(tasks, '会议')).toHaveLength(10)

    const items = buildCommandPaletteItems('会议', tasks)
    const taskItems = items.filter((i) => i.kind === 'task')
    expect(taskItems).toHaveLength(10)
  })

  it('选择任务后 selectedTaskId 被正确设置且面板关闭', () => {
    useTaskStore.setState({
      tasks: [makeTask(42, { title: '准备周报' })],
      loading: false,
    })
    useUIStore.setState({ commandPaletteOpen: true, selectedTaskId: null, currentView: 'settings' })

    const newTaskInputRef = { current: null }
    const searchInputRef = { current: null }
    render(<CommandPalette newTaskInputRef={newTaskInputRef} searchInputRef={searchInputRef} />)

    fireEvent.change(screen.getByTestId('command-palette-input'), { target: { value: '周报' } })
    fireEvent.click(screen.getByTestId('command-task-42'))

    expect(useUIStore.getState().selectedTaskId).toBe(42)
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    // 从设置切回 tasks 以保证详情可见
    expect(useUIStore.getState().currentView).toBe('tasks')
  })

  it('无任务搜索结果不影响固定命令', () => {
    useTaskStore.setState({ tasks: [], loading: false })
    const items = buildCommandPaletteItems('日历', [])
    expect(items.some((i) => i.kind === 'command' && i.title === '日历')).toBe(true)
    expect(items.filter((i) => i.kind === 'task')).toHaveLength(0)

    useUIStore.setState({ commandPaletteOpen: true })
    const newTaskInputRef = { current: null }
    const searchInputRef = { current: null }
    render(<CommandPalette newTaskInputRef={newTaskInputRef} searchInputRef={searchInputRef} />)
    fireEvent.change(screen.getByTestId('command-palette-input'), { target: { value: '日历' } })
    expect(screen.getByTestId('command-item-view-calendar')).toBeInTheDocument()
    expect(screen.queryByTestId('command-palette-empty')).not.toBeInTheDocument()
  })

  it('长结果列表结构上有可滚动容器', () => {
    useUIStore.setState({ commandPaletteOpen: true })
    const newTaskInputRef = { current: null }
    const searchInputRef = { current: null }
    render(<CommandPalette newTaskInputRef={newTaskInputRef} searchInputRef={searchInputRef} />)

    const results = screen.getByTestId('command-palette-results')
    expect(results.className).toMatch(/overflow-y-auto/)
    const dialogPanel = results.closest('.max-h-\\[70vh\\]')
    expect(dialogPanel).toBeTruthy()
  })

  it('空输入不展示任务列表', () => {
    useTaskStore.setState({
      tasks: [makeTask(1, { title: '任意任务' })],
      loading: false,
    })
    expect(searchTasksForCommandPalette(useTaskStore.getState().tasks, '')).toHaveLength(0)
    expect(buildCommandPaletteItems('', useTaskStore.getState().tasks).every((i) => i.kind === 'command')).toBe(true)
  })

  it('忽略大小写匹配任务标题', () => {
    const tasks = [makeTask(1, { title: 'Weekly Meeting' })]
    expect(searchTasksForCommandPalette(tasks, 'meeting')).toHaveLength(1)
    expect(searchTasksForCommandPalette(tasks, 'MEETING')).toHaveLength(1)
  })

  it('归档任务不出现在命令面板任务搜索中', () => {
    const tasks = [makeTask(1, { title: '已归档会议', archived: true }), makeTask(2, { title: '进行中会议' })]
    const matched = searchTasksForCommandPalette(tasks, '会议')
    expect(matched).toHaveLength(1)
    expect(matched[0].id).toBe(2)
  })

  it('点击固定命令可切换视图', () => {
    useUIStore.setState({ commandPaletteOpen: true, currentView: 'tasks' })
    const newTaskInputRef = { current: null }
    const searchInputRef = { current: null }
    render(<CommandPalette newTaskInputRef={newTaskInputRef} searchInputRef={searchInputRef} />)

    fireEvent.click(screen.getByTestId('command-item-view-stats'))
    expect(useUIStore.getState().currentView).toBe('stats')
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })

  it('打开快捷键帮助命令会设置 shortcutsHelpOpen', () => {
    useUIStore.setState({ commandPaletteOpen: true, shortcutsHelpOpen: false })
    const newTaskInputRef = { current: null }
    const searchInputRef = { current: null }
    render(<CommandPalette newTaskInputRef={newTaskInputRef} searchInputRef={searchInputRef} />)

    fireEvent.change(screen.getByTestId('command-palette-input'), { target: { value: '快捷键' } })
    fireEvent.click(screen.getByTestId('command-item-action-shortcuts-help'))
    expect(useUIStore.getState().shortcutsHelpOpen).toBe(true)
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
  })

  it('Ctrl+K 打开时 preventDefault / stopPropagation', () => {
    render(<ShortcutHost />)
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    const preventSpy = vi.spyOn(event, 'preventDefault')
    const stopSpy = vi.spyOn(event, 'stopPropagation')
    act(() => {
      document.dispatchEvent(event)
    })
    expect(preventSpy).toHaveBeenCalled()
    expect(stopSpy).toHaveBeenCalled()
    expect(useUIStore.getState().commandPaletteOpen).toBe(true)
  })

  it('执行“新建任务”后最终焦点落在 newTaskInputRef', async () => {
    render(<ShortcutHost />)
    const prev = screen.getByTestId('prev-focus')
    const newTask = screen.getByTestId('host-input')
    prev.focus()
    expect(document.activeElement).toBe(prev)

    openPalette()
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    await flushOpenFocus()

    fireEvent.change(screen.getByTestId('command-palette-input'), { target: { value: '新建任务' } })
    fireEvent.click(screen.getByTestId('command-item-action-new-task'))

    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()

    await flushFocusPolicy()
    expect(document.activeElement).toBe(newTask)
  })

  it('执行“聚焦搜索”后最终焦点落在 searchInputRef', async () => {
    render(<ShortcutHost />)
    const prev = screen.getByTestId('prev-focus')
    const search = screen.getByTestId('host-search')
    prev.focus()
    expect(document.activeElement).toBe(prev)

    openPalette()
    await flushOpenFocus()
    fireEvent.change(screen.getByTestId('command-palette-input'), { target: { value: '聚焦搜索' } })
    fireEvent.click(screen.getByTestId('command-item-action-focus-search'))

    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    await flushFocusPolicy()
    expect(document.activeElement).toBe(search)
  })

  it('Esc 关闭后焦点恢复到打开前元素', async () => {
    render(<ShortcutHost />)
    const prev = screen.getByTestId('prev-focus')
    prev.focus()
    expect(document.activeElement).toBe(prev)

    openPalette()
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    await flushOpenFocus()
    // 面板输入框会抢焦点
    expect(document.activeElement).toBe(screen.getByTestId('command-palette-input'))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()

    await flushFocusPolicy()
    expect(document.activeElement).toBe(prev)
  })

  it('打开快捷键帮助后不把焦点恢复到被遮挡的旧元素', async () => {
    render(<ShortcutHost />)
    const prev = screen.getByTestId('prev-focus')
    prev.focus()

    openPalette()
    await flushOpenFocus()
    fireEvent.change(screen.getByTestId('command-palette-input'), { target: { value: '快捷键' } })
    fireEvent.click(screen.getByTestId('command-item-action-shortcuts-help'))

    expect(useUIStore.getState().shortcutsHelpOpen).toBe(true)
    expect(useUIStore.getState().commandPaletteOpen).toBe(false)

    await flushFocusPolicy()
    // mode: none —— 不得抢回 prev-focus（帮助层可自行接管；此处至少不错误恢复）
    expect(document.activeElement).not.toBe(prev)
  })
})

describe('CommandPalette 结果区结构', () => {
  it('结果列表 role=listbox 且选项有 aria-selected', () => {
    useUIStore.setState({ commandPaletteOpen: true })
    useTaskStore.setState({ tasks: [], loading: false })
    render(
      <CommandPalette
        newTaskInputRef={{ current: null }}
        searchInputRef={{ current: null }}
      />,
    )
    const listbox = screen.getByRole('listbox')
    expect(listbox).toBeInTheDocument()
    const options = within(listbox).getAllByRole('option')
    expect(options.length).toBeGreaterThan(0)
    expect(options[0]).toHaveAttribute('aria-selected')
  })
})
