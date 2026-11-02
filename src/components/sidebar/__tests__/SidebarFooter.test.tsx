import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SidebarFooter } from '../SidebarFooter'

describe('SidebarFooter', () => {
  it('不再显示常驻引导教程入口', () => {
    render(<SidebarFooter currentView="tasks" onViewChange={vi.fn()} />)
    expect(screen.queryByText('引导教程')).not.toBeInTheDocument()
    expect(screen.queryByTitle('重新查看新手引导教程')).not.toBeInTheDocument()
  })

  it('设置入口保留原位置与功能', () => {
    const onViewChange = vi.fn()
    render(<SidebarFooter currentView="tasks" onViewChange={onViewChange} />)
    const settings = screen.getByTestId('nav-settings')
    expect(settings).toHaveTextContent('设置')
    expect(settings).not.toHaveAttribute('aria-current')

    fireEvent.click(settings)
    expect(onViewChange).toHaveBeenCalledWith('settings')
  })

  it('设置视图下仍标记当前页', () => {
    render(<SidebarFooter currentView="settings" onViewChange={vi.fn()} />)
    expect(screen.getByTestId('nav-settings')).toHaveAttribute('aria-current', 'page')
  })
})
