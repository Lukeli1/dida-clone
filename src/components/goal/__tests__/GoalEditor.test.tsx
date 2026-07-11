import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Goal, GoalKeyResult } from '../../../api/goalApi'

const mockGetKeyResults = vi.fn()
const mockCreateKeyResult = vi.fn()
const mockUpdateKeyResult = vi.fn()
const mockDeleteKeyResult = vi.fn()

vi.mock('../../../api/goalApi', async () => {
  const actual = await vi.importActual<typeof import('../../../api/goalApi')>('../../../api/goalApi')
  return {
    ...actual,
    goalApi: {
      getKeyResults: (...args: unknown[]) => mockGetKeyResults(...args),
      createKeyResult: (...args: unknown[]) => mockCreateKeyResult(...args),
      updateKeyResult: (...args: unknown[]) => mockUpdateKeyResult(...args),
      deleteKeyResult: (...args: unknown[]) => mockDeleteKeyResult(...args),
    },
  }
})

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 7,
    title: '阅读目标',
    description: null,
    type: 'quarterly',
    period_start: '2026-01-01T00:00:00.000Z',
    period_end: '2026-03-31T00:00:00.000Z',
    status: 'active',
    color: '#3B82F6',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeKr(overrides: Partial<GoalKeyResult> = {}): GoalKeyResult {
  return {
    id: 1,
    goal_id: 7,
    title: '读完 12 本书',
    target_value: 12,
    current_value: 3,
    unit: '本',
    sort_order: 0,
    ...overrides,
  }
}

async function renderEditor(props?: {
  goal?: Goal | null
  onSave?: ReturnType<typeof vi.fn>
  onCancel?: ReturnType<typeof vi.fn>
  onKeyResultsChange?: ReturnType<typeof vi.fn>
}) {
  const { GoalEditor } = await import('../GoalEditor')
  const onSave = props?.onSave ?? vi.fn()
  const onCancel = props?.onCancel ?? vi.fn()
  const onKeyResultsChange = props?.onKeyResultsChange ?? vi.fn()
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <GoalEditor
        goal={props?.goal === undefined ? makeGoal() : props.goal}
        onSave={onSave}
        onCancel={onCancel}
        onKeyResultsChange={onKeyResultsChange}
      />,
    )
  })
  return { ...result, onSave, onCancel, onKeyResultsChange }
}

describe('GoalEditor KR', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetKeyResults.mockResolvedValue([])
    mockCreateKeyResult.mockResolvedValue(11)
    mockUpdateKeyResult.mockResolvedValue(undefined)
    mockDeleteKeyResult.mockResolvedValue(undefined)
  })

  it('does not show KR editor for new goals', async () => {
    await renderEditor({ goal: null })
    expect(screen.queryByText('关键结果（KR）')).not.toBeInTheDocument()
    expect(screen.getByText(/先保存目标后/)).toBeInTheDocument()
  })

  it('loads and creates KR for existing goal', async () => {
    const onKeyResultsChange = vi.fn()
    mockGetKeyResults
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeKr({ id: 11, title: '阅读 12 本书', current_value: 0, target_value: 12 })])

    await renderEditor({ onKeyResultsChange })

    await waitFor(() => {
      expect(mockGetKeyResults).toHaveBeenCalledWith(7)
    })
    // 初始加载完成：空列表提示已出现
    await screen.findByText(/暂无关键结果/)

    await act(async () => {
      fireEvent.change(screen.getByLabelText('关键结果标题'), { target: { value: '阅读 12 本书' } })
      fireEvent.change(screen.getByLabelText('当前值'), { target: { value: '0' } })
      fireEvent.change(screen.getByLabelText('目标值'), { target: { value: '12' } })
      fireEvent.change(screen.getByLabelText('单位'), { target: { value: '本' } })
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '添加 KR' }))
    })

    await waitFor(() => {
      expect(mockCreateKeyResult).toHaveBeenCalledWith({
        goalId: 7,
        title: '阅读 12 本书',
        targetValue: 12,
        currentValue: 0,
        unit: '本',
      })
    })
    await waitFor(() => {
      expect(onKeyResultsChange).toHaveBeenCalledWith(7)
    })
    expect(await screen.findByText('阅读 12 本书')).toBeInTheDocument()
  })

  it('blocks invalid KR values before calling API', async () => {
    await renderEditor()
    await waitFor(() => expect(mockGetKeyResults).toHaveBeenCalled())
    await screen.findByText(/暂无关键结果/)

    await act(async () => {
      fireEvent.change(screen.getByLabelText('关键结果标题'), { target: { value: '营收' } })
      fireEvent.change(screen.getByLabelText('目标值'), { target: { value: '0' } })
      fireEvent.change(screen.getByLabelText('当前值'), { target: { value: '1' } })
      fireEvent.click(screen.getByRole('button', { name: '添加 KR' }))
    })

    expect(await screen.findByTestId('kr-error')).toHaveTextContent('目标值必须大于 0')
    expect(mockCreateKeyResult).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.change(screen.getByLabelText('目标值'), { target: { value: '100' } })
      fireEvent.change(screen.getByLabelText('当前值'), { target: { value: '-1' } })
      fireEvent.click(screen.getByRole('button', { name: '添加 KR' }))
    })

    expect(await screen.findByTestId('kr-error')).toHaveTextContent('当前值不能为负数')
    expect(mockCreateKeyResult).not.toHaveBeenCalled()
  })

  it('edits and deletes existing KR', async () => {
    const onKeyResultsChange = vi.fn()
    const kr = makeKr()
    mockGetKeyResults
      .mockResolvedValueOnce([kr])
      .mockResolvedValueOnce([{ ...kr, title: '读完 15 本书', target_value: 15, current_value: 5 }])
      .mockResolvedValueOnce([])

    await renderEditor({ onKeyResultsChange })

    expect(await screen.findByText('读完 12 本书')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('关键结果标题'), { target: { value: '读完 15 本书' } })
      fireEvent.change(screen.getByLabelText('目标值'), { target: { value: '15' } })
      fireEvent.change(screen.getByLabelText('当前值'), { target: { value: '5' } })
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存 KR' }))
    })

    await waitFor(() => {
      expect(mockUpdateKeyResult).toHaveBeenCalledWith(1, {
        title: '读完 15 本书',
        targetValue: 15,
        currentValue: 5,
        unit: '本',
      })
    })
    expect(await screen.findByText('读完 15 本书')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '删除' }))
    })

    await waitFor(() => {
      expect(mockDeleteKeyResult).toHaveBeenCalledWith(1)
      expect(onKeyResultsChange).toHaveBeenCalled()
    })
  })
})
