import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AIScheduleMenu } from '../AIScheduleMenu'

// Mock useUIStore
const mockSetAiPresetMessage = vi.fn()
const mockSetCurrentView = vi.fn()

vi.mock('../../../stores/uiStore', () => ({
  useUIStore: (selector: (s: any) => any) =>
    selector({
      setAiPresetMessage: mockSetAiPresetMessage,
      setCurrentView: mockSetCurrentView,
    }),
}))

function renderMenu(onClose = vi.fn()) {
  return render(<AIScheduleMenu onClose={onClose} />)
}

describe('AIScheduleMenu AI 排程配置面板', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染默认配置（明天日期、09:00-18:00）', () => {
    renderMenu()

    const dateInput = screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}$/) as HTMLInputElement
    expect(dateInput).toBeInTheDocument()
    expect(dateInput.type).toBe('date')

    const startInput = screen.getByDisplayValue('09:00') as HTMLInputElement
    expect(startInput.type).toBe('time')

    const endInput = screen.getByDisplayValue('18:00') as HTMLInputElement
    expect(endInput.type).toBe('time')
  })

  it('点击开始排程生成 aiPresetMessage 并跳转 AI 助手', () => {
    renderMenu()

    const confirmButton = screen.getByText('开始排程')
    fireEvent.click(confirmButton)

    expect(mockSetAiPresetMessage).toHaveBeenCalledOnce()
    expect(mockSetCurrentView).toHaveBeenCalledWith('ai')

    const presetMsg = mockSetAiPresetMessage.mock.calls[0][0] as string
    expect(presetMsg).toContain('帮我安排')
    expect(presetMsg).toContain('工作时间 09:00 到 18:00')
    expect(presetMsg).toContain('包含没有设置日期的任务')
  })

  it('清空日期后确认按钮被禁用，不崩溃', () => {
    renderMenu()

    const dateInput = screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}$/) as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '' } })

    const confirmButton = screen.getByText('开始排程') as HTMLButtonElement
    expect(confirmButton.disabled).toBe(true)

    // 点击禁用按钮不应触发 handleConfirm
    fireEvent.click(confirmButton)
    expect(mockSetAiPresetMessage).not.toHaveBeenCalled()
    expect(mockSetCurrentView).not.toHaveBeenCalled()
  })

  it('关闭包含无日期任务后 prompt 不包含该约束', () => {
    renderMenu()

    // 点击"包含无日期任务" toggle 关闭
    fireEvent.click(screen.getByText('包含无日期任务'))

    fireEvent.click(screen.getByText('开始排程'))

    const presetMsg = mockSetAiPresetMessage.mock.calls[0][0] as string
    expect(presetMsg).not.toContain('包含没有设置日期的任务')
  })

  it('开启仅当前过滤结果后 prompt 包含该约束', () => {
    renderMenu()

    fireEvent.click(screen.getByText('仅当前过滤结果'))

    fireEvent.click(screen.getByText('开始排程'))

    const presetMsg = mockSetAiPresetMessage.mock.calls[0][0] as string
    expect(presetMsg).toContain('只考虑当前过滤结果')
  })
})
