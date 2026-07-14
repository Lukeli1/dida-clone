import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../Toast'
import { ConfirmDialogProvider } from '../../common/ConfirmDialog'
import { HabitView } from '../HabitView'

const { getHabits, getRecords, currentTime } = vi.hoisted(() => ({
  getHabits: vi.fn(),
  getRecords: vi.fn(),
  currentTime: { value: new Date(2026, 6, 14, 10, 0, 0) as Date },
}))

vi.mock('../../../api', () => ({
  habitApi: {
    getHabits,
    getRecords,
    createHabit: vi.fn(),
    updateHabit: vi.fn(),
    deleteHabit: vi.fn(),
    archiveHabit: vi.fn(),
  },
}))

vi.mock('../../../stores/uiStore', () => ({
  useUIStore: (selector: (state: { secondaryDataLoaded: boolean }) => unknown) =>
    selector({ secondaryDataLoaded: true }),
}))

vi.mock('../../../hooks/useCurrentTime', () => ({
  useCurrentTime: () => currentTime.value,
}))

// 保留真实 HabitList，验证 View → List → Card 的 weekDays / weekNavigation 透传
vi.mock('../HabitCard', () => ({
  HabitCard: (props: {
    habit: { id: number; name: string; records: Record<string, number> }
    weekDays: Date[]
    weekNavigation: {
      weekRangeLabel: string
      canReturnToCurrentWeek: boolean
      onPreviousWeek: () => void
      onReturnToCurrentWeek: () => void
    }
    onRecordChange: (habitId: number, date: string, count: number | null) => void
  }) => (
    <section data-testid={`habit-card-${props.habit.id}`}>
      <span data-testid={`week-days-${props.habit.id}`}>
        {props.weekDays.map((date) => date.getDate()).join(',')}
      </span>
      <span data-testid={`week-label-${props.habit.id}`}>{props.weekNavigation.weekRangeLabel}</span>
      <span data-testid={`return-available-${props.habit.id}`}>
        {String(props.weekNavigation.canReturnToCurrentWeek)}
      </span>
      <button type="button" onClick={props.weekNavigation.onPreviousWeek}>
        previous-{props.habit.id}
      </button>
      <button type="button" onClick={props.weekNavigation.onReturnToCurrentWeek}>
        current-{props.habit.id}
      </button>
      <button type="button" onClick={() => props.onRecordChange(props.habit.id, '2026-07-06', 1)}>
        record-change-{props.habit.id}
      </button>
      <span data-testid={`record-${props.habit.id}`}>{props.habit.records['2026-07-06'] ?? 0}</span>
    </section>
  ),
}))

function renderHabitView() {
  return render(
    <ToastProvider>
      <ConfirmDialogProvider>
        <HabitView />
      </ConfirmDialogProvider>
    </ToastProvider>,
  )
}

const twoHabits = [
  {
    id: 1,
    name: '阅读',
    target_count: 1,
    sort_order: 0,
    archived: false,
    created_at: '2026-07-01T00:00:00',
    updated_at: '2026-07-01T00:00:00',
  },
  {
    id: 2,
    name: '运动',
    target_count: 1,
    sort_order: 1,
    archived: false,
    created_at: '2026-07-01T00:00:00',
    updated_at: '2026-07-01T00:00:00',
  },
]

describe('HabitView 共享历史周', () => {
  beforeEach(() => {
    // 只伪造 Date，保留真实 setTimeout，避免 waitFor 与异步 loadHabits 卡住
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 6, 14, 10, 0, 0))
    currentTime.value = new Date(2026, 6, 14, 10, 0, 0)
    getHabits.mockResolvedValue(twoHabits)
    getRecords.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('初始显示当前周，回溯后所有卡片共享上一周并可回到本周', async () => {
    renderHabitView()

    await waitFor(() => expect(screen.getByTestId('habit-card-1')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('habit-card-2')).toBeInTheDocument())

    expect(screen.getByTestId('week-days-1')).toHaveTextContent('13,14,15,16,17,18,19')
    expect(screen.getByTestId('week-days-2')).toHaveTextContent('13,14,15,16,17,18,19')
    expect(screen.getByTestId('week-label-1')).toHaveTextContent('7月13日 - 7月19日')
    expect(screen.getByTestId('week-label-2')).toHaveTextContent('7月13日 - 7月19日')
    expect(screen.getByTestId('return-available-1')).toHaveTextContent('false')
    expect(screen.getByTestId('return-available-2')).toHaveTextContent('false')

    fireEvent.click(screen.getByRole('button', { name: 'previous-1' }))

    expect(screen.getByTestId('week-days-1')).toHaveTextContent('6,7,8,9,10,11,12')
    expect(screen.getByTestId('week-days-2')).toHaveTextContent('6,7,8,9,10,11,12')
    expect(screen.getByTestId('week-label-1')).toHaveTextContent('7月6日 - 7月12日')
    expect(screen.getByTestId('week-label-2')).toHaveTextContent('7月6日 - 7月12日')
    expect(screen.getByTestId('return-available-1')).toHaveTextContent('true')
    expect(screen.getByTestId('return-available-2')).toHaveTextContent('true')

    fireEvent.click(screen.getByRole('button', { name: 'current-2' }))

    expect(screen.getByTestId('week-days-1')).toHaveTextContent('13,14,15,16,17,18,19')
    expect(screen.getByTestId('week-days-2')).toHaveTextContent('13,14,15,16,17,18,19')
    expect(screen.getByTestId('return-available-1')).toHaveTextContent('false')
    expect(screen.getByTestId('return-available-2')).toHaveTextContent('false')
  })

  it('成功记录变更会更新唯一的页面 records 映射', async () => {
    renderHabitView()

    await waitFor(() => expect(screen.getByTestId('habit-card-1')).toBeInTheDocument())
    expect(screen.getByTestId('record-1')).toHaveTextContent('0')
    expect(screen.getByTestId('record-2')).toHaveTextContent('0')

    fireEvent.click(screen.getByRole('button', { name: 'record-change-1' }))

    expect(screen.getByTestId('record-1')).toHaveTextContent('1')
    expect(screen.getByTestId('record-2')).toHaveTextContent('0')
  })

  it('跨月初始周与上一周标签无歧义', async () => {
    currentTime.value = new Date(2026, 6, 1, 10, 0, 0)
    vi.setSystemTime(new Date(2026, 6, 1, 10, 0, 0))
    renderHabitView()

    await waitFor(() => expect(screen.getByTestId('week-label-1')).toHaveTextContent('6月29日 - 7月5日'))
    expect(screen.getByTestId('week-label-2')).toHaveTextContent('6月29日 - 7月5日')

    fireEvent.click(screen.getByRole('button', { name: 'previous-1' }))
    expect(screen.getByTestId('week-label-1')).toHaveTextContent('6月22日 - 6月28日')
    expect(screen.getByTestId('week-label-2')).toHaveTextContent('6月22日 - 6月28日')

    fireEvent.click(screen.getByRole('button', { name: 'current-1' }))
    expect(screen.getByTestId('week-label-1')).toHaveTextContent('6月29日 - 7月5日')
    expect(screen.getByTestId('week-label-2')).toHaveTextContent('6月29日 - 7月5日')
  })

  it('初始浏览周从 useCurrentTime 的 today 派生，而非独立 new Date()', async () => {
    // 故意让系统 Date 与 useCurrentTime 分属不同自然周：
    // 若仍用 new Date() 初始化，会得到 6-12；正确实现应得到 13-19。
    currentTime.value = new Date(2026, 6, 13, 0, 0, 0)
    vi.setSystemTime(new Date(2026, 6, 6, 10, 0, 0))
    renderHabitView()

    await waitFor(() => expect(screen.getByTestId('habit-card-1')).toBeInTheDocument())
    expect(screen.getByTestId('week-days-1')).toHaveTextContent('13,14,15,16,17,18,19')
    expect(screen.getByTestId('week-days-2')).toHaveTextContent('13,14,15,16,17,18,19')
    expect(screen.getByTestId('return-available-1')).toHaveTextContent('false')
    expect(screen.getByTestId('return-available-2')).toHaveTextContent('false')
  })
})
