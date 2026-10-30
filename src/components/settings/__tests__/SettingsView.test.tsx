import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialogProvider } from '../../common/ConfirmDialog'
import { ToastProvider } from '../../Toast'

vi.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({
    mode: 'system',
    resolvedMode: 'light',
    presetId: 'default',
    accentColor: null,
    cornerStyle: 'standard',
    setMode: vi.fn(),
    setPreset: vi.fn(),
    setAccentColor: vi.fn(),
    setCornerStyle: vi.fn(),
    resetTheme: vi.fn(),
  }),
}))

import { SettingsView } from '../SettingsView'

function renderSettings() {
  return render(
    <ToastProvider>
      <ConfirmDialogProvider>
        <SettingsView onClose={vi.fn()} />
      </ConfirmDialogProvider>
    </ToastProvider>,
  )
}

describe('SettingsView 设置框架', () => {
  it('默认展示外观分类，导航使用 aria-current 表达当前分类', () => {
    renderSettings()

    expect(screen.getByTestId('settings-view')).toBeInTheDocument()
    expect(screen.getByTestId('settings-category-appearance')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('settings-content-title')).toHaveTextContent('外观')
    expect(screen.getByTestId('theme-preset-grid')).toBeInTheDocument()
  })

  it('切换通用分类更新内容标题与当前分类，不丢失其他分类入口', () => {
    renderSettings()

    fireEvent.click(screen.getByTestId('settings-category-general'))
    expect(screen.getByTestId('settings-category-general')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('settings-category-appearance')).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('settings-content-title')).toHaveTextContent('通用')
    expect(screen.getByTestId('sidebar-visibility-settings')).toBeInTheDocument()

    for (const key of ['appearance', 'notifications', 'ai', 'sync', 'shortcuts', 'system', 'perf', 'about']) {
      expect(screen.getByTestId(`settings-category-${key}`)).toBeInTheDocument()
    }
  })

  it('内容区拥有独立滚动容器与关闭入口', () => {
    renderSettings()
    expect(screen.getByTestId('settings-content-scroll')).toHaveClass('settings-content-scroll')
    expect(screen.getByLabelText('关闭设置')).toBeInTheDocument()
  })
})
