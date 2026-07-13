import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DensityPanel } from '../appearance/DensityPanel'

function renderPanel(overrides: Partial<ComponentProps<typeof DensityPanel>> = {}) {
  const props: ComponentProps<typeof DensityPanel> = {
    sidebarDensity: 'comfortable',
    theme: 'system',
    resolvedMode: 'light',
    presetId: 'default',
    accentColor: null,
    cornerStyle: 'standard',
    onSidebarDensityChange: vi.fn(),
    onThemeChange: vi.fn(),
    onPresetChange: vi.fn(),
    onAccentColorChange: vi.fn(),
    onCornerStyleChange: vi.fn(),
    onResetTheme: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<DensityPanel {...props} />) }
}

describe('DensityPanel 完整主题设置', () => {
  it('展示 10 套完整主题预览和当前模式说明', () => {
    renderPanel()
    expect(screen.getAllByTestId(/^theme-preset-(?!grid$)/)).toHaveLength(10)
    expect(screen.getByText('经典蓝')).toBeInTheDocument()
    expect(screen.getByText('午夜蓝')).toBeInTheDocument()
    expect(screen.getByText('10 套')).toBeInTheDocument()
    expect(screen.getByText('每套主题均有独立的浅色和深色配色')).toBeInTheDocument()
  })

  it('切换主题、圆角、密度和明暗模式调用对应回调', () => {
    const { props } = renderPanel()
    fireEvent.click(screen.getByTestId('theme-preset-ocean'))
    fireEvent.click(screen.getByRole('button', { name: /^柔和/ }))
    fireEvent.click(screen.getByRole('button', { name: /^紧凑/ }))
    fireEvent.click(screen.getByRole('button', { name: /^深色/ }))
    expect(props.onPresetChange).toHaveBeenCalledWith('ocean')
    expect(props.onCornerStyleChange).toHaveBeenCalledWith('soft')
    expect(props.onSidebarDensityChange).toHaveBeenCalledWith('compact')
    expect(props.onThemeChange).toHaveBeenCalledWith('dark')
  })

  it('自定义强调色和恢复默认入口可操作', () => {
    const { props } = renderPanel({ accentColor: '#facc15' })
    fireEvent.change(screen.getByLabelText('选择自定义强调色'), { target: { value: '#123456' } })
    fireEvent.click(screen.getByRole('button', { name: '使用主题默认色' }))
    fireEvent.click(screen.getByRole('button', { name: '恢复主题默认值' }))
    expect(props.onAccentColorChange).toHaveBeenCalledWith('#123456')
    expect(props.onPresetChange).toHaveBeenCalledWith('default')
    expect(props.onResetTheme).toHaveBeenCalledTimes(1)
  })
})
