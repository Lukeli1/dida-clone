import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Task } from '../../../types'

// Mock timeTrackingApi
const mockStartTimeTracking = vi.fn()
const mockStopTimeTracking = vi.fn()
const mockGetTimeEntries = vi.fn()
const mockDeleteTimeEntry = vi.fn()

vi.mock('../../../api/timeTrackingApi', () => ({
  timeTrackingApi: {
    startTimeTracking: mockStartTimeTracking,
    stopTimeTracking: mockStopTimeTracking,
    getTimeEntries: mockGetTimeEntries,
    deleteTimeEntry: mockDeleteTimeEntry,
    addTimeEntry: vi.fn(),
  },
}))

// Mock Toast
const mockToastError = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastInfo = vi.fn()

vi.mock('../../Toast', () => ({
  useToast: () => ({
    error: mockToastError,
    success: mockToastSuccess,
    info: mockToastInfo,
    warning: vi.fn(),
  }),
}))

// Mock storage utils
const mockStorage: Record<string, string> = {}
vi.mock('../../../utils/storage', () => ({
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = value
  },
  removeItem: (key: string) => {
    delete mockStorage[key]
  },
}))

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

async function renderSection(task?: Task) {
  const { TimeTrackingSection } = await import('../TimeTrackingSection')
  const t = task ?? makeTask()
  return render(<TimeTrackingSection task={t} />)
}

describe('TimeTrackingSection 时间追踪 UI 错误处理', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 清空 mock storage
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k])
    // 默认返回空列表
    mockGetTimeEntries.mockResolvedValue([])
  })

  it('后端返回"已有任务正在计时"时展示错误且不创建本地 active 状态', async () => {
    mockStartTimeTracking.mockRejectedValue(new Error('已有任务正在计时，请先停止当前计时'))

    await renderSection()

    const startBtn = screen.getByText('开始计时')
    await act(async () => {
      await fireEvent.click(startBtn)
    })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('已有任务正在计时，请先停止当前计时')
    })

    // 验证没有创建本地 active 状态——按钮应仍为"开始计时"
    expect(screen.getByText('开始计时')).toBeInTheDocument()
    // 验证 localStorage 没有被写入
    expect(mockStorage['time_tracking_1']).toBeUndefined()
  })

  it('开始计时成功时创建本地 active 状态', async () => {
    mockStartTimeTracking.mockResolvedValue(123)

    await renderSection()

    const startBtn = screen.getByText('开始计时')
    await act(async () => {
      await fireEvent.click(startBtn)
    })

    await waitFor(() => {
      expect(screen.getByText('停止计时')).toBeInTheDocument()
    })

    // 验证 localStorage 被写入
    expect(mockStorage['time_tracking_1']).toBeDefined()
    const saved = JSON.parse(mockStorage['time_tracking_1'])
    expect(saved.entryId).toBe(123)
  })

  it('其他错误也正确展示', async () => {
    mockStartTimeTracking.mockRejectedValue(new Error('网络错误'))

    await renderSection()

    const startBtn = screen.getByText('开始计时')
    await act(async () => {
      await fireEvent.click(startBtn)
    })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('开始计时失败: 网络错误')
    })

    // 仍为开始计时状态
    expect(screen.getByText('开始计时')).toBeInTheDocument()
  })
})
