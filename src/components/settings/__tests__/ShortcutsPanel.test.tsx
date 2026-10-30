import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '../../../stores/uiStore'
import { ShortcutsPanel } from '../ShortcutsPanel'

describe('ShortcutsPanel 快捷键设置', () => {
  beforeEach(() => {
    localStorage.clear()
    useUIStore.setState({ customShortcuts: {} })
    vi.useRealTimers()
  })

  it('按类别分组展示默认绑定，提供可访问名称且重置初始禁用', () => {
    render(<ShortcutsPanel />)

    expect(screen.getByTestId('shortcut-group-全局')).toBeInTheDocument()
    expect(screen.getByTestId('shortcut-group-导航')).toBeInTheDocument()
    expect(screen.getAllByText('5 项')).toHaveLength(2)

    const newTaskKey = screen.getByTestId('shortcut-key-newTask')
    expect(newTaskKey).toHaveAttribute('aria-label', '新建任务 快捷键：Ctrl+N，点击录制新快捷键')
    expect(newTaskKey).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '重置为默认' })).toBeDisabled()
    expect(screen.queryByText('已自定义')).not.toBeInTheDocument()
  })

  it('自定义绑定展示徽标、当前按键和具名恢复按钮', () => {
    useUIStore.setState({ customShortcuts: { newTask: 'Ctrl+Shift+N' } })
    render(<ShortcutsPanel />)

    expect(screen.getByText('已自定义')).toBeInTheDocument()
    expect(screen.getByTestId('shortcut-key-newTask')).toHaveTextContent('Ctrl+Shift+N')
    expect(screen.getByRole('button', { name: '恢复「新建任务」默认快捷键' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重置为默认' })).toBeEnabled()
  })

  it('录制冲突不写入绑定，Esc 取消录制', () => {
    vi.useFakeTimers()
    render(<ShortcutsPanel />)

    const newTaskKey = screen.getByTestId('shortcut-key-newTask')
    fireEvent.click(newTaskKey)
    expect(newTaskKey).toHaveAttribute('aria-pressed', 'true')
    expect(newTaskKey).toHaveTextContent('按下快捷键...')

    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    expect(screen.getByRole('alert')).toHaveTextContent('冲突：该快捷键已被「搜索任务」使用')
    expect(localStorage.getItem('customShortcuts')).toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(newTaskKey).toHaveAttribute('aria-pressed', 'false')
    expect(newTaskKey).toHaveTextContent('Ctrl+N')
    expect(localStorage.getItem('customShortcuts')).toBeNull()

    vi.clearAllTimers()
    vi.useRealTimers()
  })
})
