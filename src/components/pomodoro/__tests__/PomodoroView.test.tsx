import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Task } from '../../../types'

// 使用 vi.hoisted 确保 mock 数据和函数在 vi.mock 工厂函数执行时已初始化
const { mockSettings, mockStats, mockAddTimeEntry, mockSaveSettings } = vi.hoisted(() => ({
  mockSettings: {
    focusTime: 1, // 1 分钟 = 60 秒，缩短测试时间
    shortBreak: 5,
    longBreak: 15,
    longBreakInterval: 4,
  },
  mockStats: {
    date: new Date().toISOString().slice(0, 10),
    focusCount: 0,
    focusMinutes: 0,
    totalSessions: 0,
  },
  mockAddTimeEntry: vi.fn(),
  mockSaveSettings: vi.fn(),
}))

// Mock timeTrackingApi
vi.mock('../../../api/timeTrackingApi', () => ({
  timeTrackingApi: {
    addTimeEntry: mockAddTimeEntry,
  },
}))

// Mock storage 模块，控制 settings 和 stats
vi.mock('../storage', () => ({
  DEFAULT_SETTINGS: { ...mockSettings },
  getDurationSeconds: (mode: string, s: { focusTime: number; shortBreak: number; longBreak: number }) => {
    if (mode === 'focus') return s.focusTime * 60
    if (mode === 'shortBreak') return s.shortBreak * 60
    if (mode === 'longBreak') return s.longBreak * 60
    return s.focusTime * 60
  },
  getTodayString: () => new Date().toISOString().slice(0, 10),
  loadSettings: () => ({ ...mockSettings }),
  loadStats: () => ({ ...mockStats }),
  saveSettings: mockSaveSettings,
  saveStats: vi.fn(),
}))

// Mock PomodoroTimer 子组件，简化测试
vi.mock('../PomodoroTimer', () => ({
  MODE_CONFIG: {
    focus: { label: '专注', color: '#EF4444' },
    shortBreak: { label: '短休息', color: '#10B981' },
    longBreak: { label: '长休息', color: '#3B82F6' },
  },
  PomodoroTimer: ({ onStartPause }: { onStartPause: () => void }) => (
    <button onClick={onStartPause} data-testid="start-pause-btn">Start/Pause</button>
  ),
}))

// Mock PomodoroSettingsPanel 和 PomodoroStatsPanel
// 让设置面板暴露真实的 onSettingChange，以便测试运行中修改 settings
vi.mock('../PomodoroSettings', () => ({
  PomodoroSettingsPanel: ({
    settings,
    onSettingChange,
    onResetDefaults,
    disabled,
  }: {
    settings: { focusTime: number; shortBreak: number; longBreak: number; longBreakInterval: number }
    onSettingChange: (key: string, value: number) => void
    onResetDefaults: () => void
    disabled?: boolean
  }) => (
    <div data-testid="settings-panel">
      <input
        data-testid="focus-time-input"
        type="number"
        value={settings.focusTime}
        onChange={(e) => onSettingChange('focusTime', Number(e.target.value))}
        disabled={disabled}
      />
      <button data-testid="reset-defaults-btn" onClick={onResetDefaults} disabled={disabled}>
        恢复默认
      </button>
    </div>
  ),
}))

vi.mock('../PomodoroStats', () => ({
  PomodoroStatsPanel: () => <div data-testid="stats-panel" />,
}))

vi.mock('../../EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../../../utils/priority', () => ({
  PRIORITY_STYLES: [{ hex: '#6B7280', label: '无' }],
}))

// Mock Notification API
globalThis.Notification = {
  permission: 'default',
  requestPermission: vi.fn(),
} as unknown as typeof Notification

// 静态导入，避免 dynamic import + fake timers 冲突
import { PomodoroView } from '../PomodoroView'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: '测试任务',
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
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    tag_ids: [],
    subtasks: [],
    ...overrides,
  }
}

/** 选择下拉框中的任务 */
function selectTask(taskId: number) {
  const select = screen.getByRole('combobox') as HTMLSelectElement
  fireEvent.change(select, { target: { value: String(taskId) } })
}

/** 启动计时器并快进到归零 */
async function runPomodoroToEnd() {
  const btn = screen.getByTestId('start-pause-btn')
  fireEvent.click(btn)

  // 快进到计时归零（focusTime * 60 秒 + 1 秒）
  await act(async () => {
    vi.advanceTimersByTime(mockSettings.focusTime * 60 * 1000 + 1000)
  })
}

describe('PomodoroView 番茄钟专注完成写入 time_entries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('focus 完成且选中任务时调用 addTimeEntry', async () => {
    mockAddTimeEntry.mockResolvedValue(1)
    const task = makeTask({ id: 42, title: '专注任务' })

    render(<PomodoroView tasks={[task]} onTaskClick={vi.fn()} onToggleTask={vi.fn()} />)

    // 选择任务
    selectTask(42)

    // 启动并等待计时完成
    await runPomodoroToEnd()

    // 验证 addTimeEntry 被调用
    expect(mockAddTimeEntry).toHaveBeenCalledTimes(1)
    const callArg = mockAddTimeEntry.mock.calls[0][0]
    expect(callArg.taskId).toBe(42)
    expect(callArg.durationSecs).toBe(mockSettings.focusTime * 60)
    expect(callArg.note).toBe('番茄钟专注')
    // start_time 和 end_time 应为 ISO 字符串
    expect(typeof callArg.startTime).toBe('string')
    expect(typeof callArg.endTime).toBe('string')
    // end_time - start_time 应约等于 durationSecs
    const diff = new Date(callArg.endTime).getTime() - new Date(callArg.startTime).getTime()
    expect(diff).toBeCloseTo(mockSettings.focusTime * 60 * 1000, -2)
  })

  it('focus 完成但未选中任务时不调用 addTimeEntry', async () => {
    mockAddTimeEntry.mockResolvedValue(1)
    const task = makeTask({ id: 42, title: '专注任务' })

    render(<PomodoroView tasks={[task]} onTaskClick={vi.fn()} onToggleTask={vi.fn()} />)

    // 不选择任务，直接启动计时
    await runPomodoroToEnd()

    // 验证 addTimeEntry 未被调用
    expect(mockAddTimeEntry).not.toHaveBeenCalled()
  })

  it('运行中修改 focusTime 后，完成时仍使用启动时的时长写入', async () => {
    mockAddTimeEntry.mockResolvedValue(1)
    const task = makeTask({ id: 42, title: '专注任务' })

    render(<PomodoroView tasks={[task]} onTaskClick={vi.fn()} onToggleTask={vi.fn()} />)

    // 选择任务
    selectTask(42)

    // 启动计时（focusTime = 1 分钟 = 60 秒）
    const btn = screen.getByTestId('start-pause-btn')
    fireEvent.click(btn)

    // 打开设置面板
    const settingsToggle = screen.getByRole('button', { name: '设置' })
    fireEvent.click(settingsToggle)

    // 通过 mock 设置面板修改 focusTime 为 5 分钟（300 秒）
    // 此时计时器正在运行，设置面板应处于 disabled 状态，但为了验证锁定时长逻辑，
    // 我们直接调用 onSettingChange 模拟外部状态变化（或测试 disabled 行为）
    const focusInput = screen.getByTestId('focus-time-input') as HTMLInputElement
    expect(focusInput.disabled).toBe(true) // 验证运行中设置面板被禁用

    // 直接触发 onSettingChange 来模拟 settings state 变化（绕过 disabled）
    await act(async () => {
      fireEvent.change(focusInput, { target: { value: '5' } })
    })

    // 快进到计时归零（原 60 秒 + 1 秒）
    await act(async () => {
      vi.advanceTimersByTime(60 * 1000 + 1000)
    })

    // 验证 addTimeEntry 被调用，且 durationSecs 仍为 60（启动时锁定的值）
    expect(mockAddTimeEntry).toHaveBeenCalledTimes(1)
    const callArg = mockAddTimeEntry.mock.calls[0][0]
    expect(callArg.durationSecs).toBe(60)

    // 恢复 mockSettings
    mockSettings.focusTime = 1
  })

  it('addTimeEntry 失败时不阻断番茄钟流程', async () => {
    mockAddTimeEntry.mockRejectedValue(new Error('写入失败'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const task = makeTask({ id: 42, title: '专注任务' })

    render(<PomodoroView tasks={[task]} onTaskClick={vi.fn()} onToggleTask={vi.fn()} />)

    // 选择任务
    selectTask(42)

    // 启动并等待计时完成
    await runPomodoroToEnd()

    // addTimeEntry 被调用但失败
    expect(mockAddTimeEntry).toHaveBeenCalledTimes(1)
    // 错误被记录
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '番茄钟专注时间写入失败:',
      '写入失败',
    )
    consoleErrorSpy.mockRestore()
  })
})
