import { render, screen, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Goal, GoalProgress, GoalKeyResult } from '../../../api/goalApi'

const mockGetProgress = vi.fn()

vi.mock('../../../api', () => ({
  goalApi: {
    getProgress: (...args: unknown[]) => mockGetProgress(...args),
  },
  formatKeyResultProgress: (kr: Pick<GoalKeyResult, 'current_value' | 'target_value' | 'unit'>) => {
    const percent = Math.min(100, Math.max(0, Math.round((kr.current_value / kr.target_value) * 100)))
    const unit = kr.unit?.trim()
    return `${kr.current_value} / ${kr.target_value}${unit ? ` ${unit}` : ''}（${percent}%）`
  },
}))

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 3,
    title: 'Q2 营收',
    description: '关键业务目标',
    type: 'quarterly',
    period_start: '2026-04-01T00:00:00.000Z',
    period_end: '2026-06-30T00:00:00.000Z',
    status: 'active',
    color: '#10B981',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

async function renderCard(progress: GoalProgress, refreshToken?: number) {
  const { GoalCard } = await import('../GoalCard')
  mockGetProgress.mockResolvedValue(progress)
  const onEdit = vi.fn()
  const onArchive = vi.fn()
  const onDelete = vi.fn()
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <GoalCard
        goal={makeGoal()}
        onEdit={onEdit}
        onArchive={onArchive}
        onDelete={onDelete}
        progressRefreshToken={refreshToken}
      />,
    )
  })
  return result
}

describe('GoalCard progress paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows task progress when no KR exists', async () => {
    await renderCard({
      total_tasks: 4,
      completed_tasks: 1,
      progress_percent: 25,
      key_results: [],
    })

    await waitFor(() => {
      expect(screen.getByTestId('goal-progress-summary')).toHaveTextContent('1/4')
      expect(screen.getByTestId('goal-progress-percent')).toHaveTextContent('25%')
    })
    expect(screen.queryByTestId('goal-kr-list')).not.toBeInTheDocument()
  })

  it('shows KR list and average progress when KRs exist', async () => {
    await renderCard({
      total_tasks: 2,
      completed_tasks: 0,
      progress_percent: 75,
      key_results: [
        {
          id: 1,
          goal_id: 3,
          title: '阅读',
          target_value: 100,
          current_value: 50,
          unit: '页',
          sort_order: 0,
        },
        {
          id: 2,
          goal_id: 3,
          title: '写作',
          target_value: 10,
          current_value: 10,
          unit: '篇',
          sort_order: 1,
        },
      ],
    })

    await waitFor(() => {
      expect(screen.getByTestId('goal-progress-summary')).toHaveTextContent('2 项 KR')
      expect(screen.getByTestId('goal-progress-percent')).toHaveTextContent('75%')
      expect(screen.getByTestId('goal-kr-list')).toHaveTextContent('50 / 100 页（50%）')
      expect(screen.getByTestId('goal-kr-list')).toHaveTextContent('10 / 10 篇（100%）')
    })
  })

  it('caps display at 100% while preserving over-complete current_value text', async () => {
    await renderCard({
      total_tasks: 0,
      completed_tasks: 0,
      progress_percent: 100,
      key_results: [
        {
          id: 9,
          goal_id: 3,
          title: '超额完成',
          target_value: 10,
          current_value: 15,
          unit: '次',
          sort_order: 0,
        },
      ],
    })

    await waitFor(() => {
      expect(screen.getByTestId('goal-progress-percent')).toHaveTextContent('100%')
      expect(screen.getByTestId('goal-kr-list')).toHaveTextContent('15 / 10 次（100%）')
    })
  })

  it('reloads progress when refresh token changes', async () => {
    const { GoalCard } = await import('../GoalCard')
    mockGetProgress
      .mockResolvedValueOnce({
        total_tasks: 0,
        completed_tasks: 0,
        progress_percent: 0,
        key_results: [],
      })
      .mockResolvedValueOnce({
        total_tasks: 0,
        completed_tasks: 0,
        progress_percent: 75,
        key_results: [
          {
            id: 1,
            goal_id: 3,
            title: 'A',
            target_value: 2,
            current_value: 1,
            unit: null,
            sort_order: 0,
          },
          {
            id: 2,
            goal_id: 3,
            title: 'B',
            target_value: 1,
            current_value: 1,
            unit: null,
            sort_order: 1,
          },
        ],
      })

    let view!: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <GoalCard
          goal={makeGoal()}
          onEdit={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          progressRefreshToken={0}
        />,
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('goal-progress-percent')).toHaveTextContent('0%')
    })

    await act(async () => {
      view.rerender(
        <GoalCard
          goal={makeGoal()}
          onEdit={vi.fn()}
          onArchive={vi.fn()}
          onDelete={vi.fn()}
          progressRefreshToken={1}
        />,
      )
    })

    await waitFor(() => {
      expect(mockGetProgress).toHaveBeenCalledTimes(2)
      expect(screen.getByTestId('goal-progress-percent')).toHaveTextContent('75%')
      expect(screen.getByTestId('goal-progress-summary')).toHaveTextContent('2 项 KR')
    })
  })
})
