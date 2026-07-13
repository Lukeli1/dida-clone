import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskTemplate } from '../../../types/template'
import type { List, Tag } from '../../../types'

const mockApplyTemplate = vi.fn()
const mockGetLists = vi.fn()
const mockGetTags = vi.fn()
const mockSetLists = vi.fn()
const mockSetTags = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()

let mockLists: List[] = []
let mockTags: Tag[] = []

vi.mock('../../../api', () => ({
  templateApi: {
    applyTemplate: (...args: unknown[]) => mockApplyTemplate(...args),
  },
  listApi: {
    getLists: (...args: unknown[]) => mockGetLists(...args),
  },
  tagApi: {
    getTags: (...args: unknown[]) => mockGetTags(...args),
  },
}))

vi.mock('../../../stores/listStore', () => ({
  useListStore: (selector: (s: { lists: List[]; setLists: (lists: List[]) => void }) => unknown) =>
    selector({
      lists: mockLists,
      setLists: mockSetLists,
    }),
}))

vi.mock('../../../stores/tagStore', () => ({
  useTagStore: (selector: (s: { tags: Tag[]; setTags: (tags: Tag[]) => void }) => unknown) =>
    selector({
      tags: mockTags,
      setTags: mockSetTags,
    }),
}))

vi.mock('../../Toast', () => ({
  useToast: () => ({
    success: mockToastSuccess,
    error: mockToastError,
    info: vi.fn(),
    warning: vi.fn(),
  }),
}))

function makeTemplate(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id: 11,
    name: '项目启动模板',
    icon: '🚀',
    title_template: '{project} 启动会',
    notes_template: '项目：{project}',
    priority: 1,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    subtask_templates: [{ id: 1, template_id: 11, title: '准备 {project} 材料', sort_order: 0 }],
    ...overrides,
  }
}

async function renderDialog(props?: {
  defaultListId?: number | null
  template?: TaskTemplate
  onApplied?: (title: string) => void
  onCancel?: () => void
}) {
  const { ApplyTemplateDialog } = await import('../ApplyTemplateDialog')
  const onApplied = props?.onApplied ?? vi.fn()
  const onCancel = props?.onCancel ?? vi.fn()
  const result = render(
    <ApplyTemplateDialog
      template={props?.template ?? makeTemplate()}
      defaultListId={props?.defaultListId ?? null}
      onApplied={onApplied}
      onCancel={onCancel}
    />,
  )
  return { ...result, onApplied, onCancel }
}

describe('ApplyTemplateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLists = [
      {
        id: 1,
        name: '收件箱',
        is_default: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 7,
        name: '工作',
        is_default: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]
    mockTags = [
      { id: 21, name: '重要', created_at: '2026-01-01T00:00:00Z' },
      { id: 22, name: '会议', created_at: '2026-01-01T00:00:00Z' },
    ]
    mockGetLists.mockImplementation(async () => mockLists)
    mockGetTags.mockImplementation(async () => mockTags)
    mockApplyTemplate.mockResolvedValue({
      id: 100,
      title: '滴答复刻 启动会',
      list_id: 7,
    })
  })

  it('正常应用模板：把选择的清单、日期、标签、变量传给 API', async () => {
    const { onApplied } = await renderDialog({ defaultListId: 7 })

    await waitFor(() => {
      const listSelect = screen.getByLabelText(/目标清单/) as HTMLSelectElement
      expect(listSelect.value).toBe('7')
    })

    // defaultListId=7 时应预填，不静默落到收件箱

    // 设置日期
    const dateField = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateField, { target: { value: '2026-07-15' } })

    // 选择两个标签
    fireEvent.click(screen.getByRole('button', { name: '重要' }))
    fireEvent.click(screen.getByRole('button', { name: '会议' }))

    // 填写变量
    fireEvent.change(screen.getByPlaceholderText('输入 project 的值'), {
      target: { value: '滴答复刻' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认应用' }))
    })

    await waitFor(() => {
      expect(mockApplyTemplate).toHaveBeenCalledTimes(1)
    })

    const req = mockApplyTemplate.mock.calls[0][0]
    expect(req.templateId).toBe(11)
    expect(req.listId).toBe(7)
    expect(req.listId).not.toBe(1)
    expect(req.tagIds).toEqual([21, 22])
    expect(req.variables).toEqual({ project: '滴答复刻' })
    expect(typeof req.dueDate).toBe('string')
    // 本地日历日 2026-07-15 23:59，而不是 UTC 解析造成的前一天
    const due = new Date(req.dueDate)
    expect(due.getFullYear()).toBe(2026)
    expect(due.getMonth()).toBe(6)
    expect(due.getDate()).toBe(15)

    expect(mockToastSuccess).toHaveBeenCalled()
    expect(onApplied).toHaveBeenCalled()
  })

  it('无有效 defaultListId 时不静默回退到收件箱，必须显式选择清单', async () => {
    await renderDialog({ defaultListId: null })

    await waitFor(() => {
      expect(screen.getByLabelText(/目标清单/)).toBeInTheDocument()
    })

    const listSelect = screen.getByLabelText(/目标清单/) as HTMLSelectElement
    expect(listSelect.value).toBe('')
    expect(screen.getByRole('button', { name: '确认应用' })).toBeDisabled()

    // 显式选择后可提交
    fireEvent.change(listSelect, { target: { value: '7' } })
    expect(listSelect.value).toBe('7')
    expect(screen.getByRole('button', { name: '确认应用' })).toBeEnabled()
  })

  it('无效 defaultListId 时也不回退到默认清单', async () => {
    await renderDialog({ defaultListId: 999 })

    await waitFor(() => {
      expect(screen.getByLabelText(/目标清单/)).toBeInTheDocument()
    })

    const listSelect = screen.getByLabelText(/目标清单/) as HTMLSelectElement
    expect(listSelect.value).toBe('')
    expect(listSelect.value).not.toBe('1')
    expect(screen.getByRole('button', { name: '确认应用' })).toBeDisabled()
  })

  it('后端失败时展示可恢复错误，且不触发成功回调', async () => {
    mockApplyTemplate.mockRejectedValue(new Error('目标清单不存在（id=7），请重新选择后重试'))
    const { onApplied } = await renderDialog({ defaultListId: 7 })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '确认应用' })).toBeEnabled()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认应用' }))
    })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('目标清单不存在（id=7），请重新选择后重试')
    })
    expect(screen.getByText('目标清单不存在（id=7），请重新选择后重试')).toBeInTheDocument()
    expect(onApplied).not.toHaveBeenCalled()
  })

  it('清单加载失败时展示可恢复状态', async () => {
    mockGetLists.mockRejectedValueOnce(new Error('网络错误'))
    await renderDialog()

    await waitFor(() => {
      expect(screen.getByText(/网络错误|加载清单或标签失败/)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认应用' })).toBeDisabled()
  })

  it('无可用清单时禁用提交并给出说明', async () => {
    mockLists = []
    await renderDialog()

    await waitFor(() => {
      expect(screen.getByText('暂无可用清单，无法应用模板')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: '确认应用' })).toBeDisabled()
  })

  it('变量预览会同步更新标题和子任务', async () => {
    await renderDialog({ defaultListId: 7 })

    // 表单初始值为空字符串：已知变量被替换为空，与后端语义一致
    await waitFor(() => {
      expect(screen.getByText('启动会')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('输入 project 的值'), {
      target: { value: 'Alpha' },
    })

    expect(screen.getByText('Alpha 启动会')).toBeInTheDocument()
    expect(screen.getByText('· 准备 Alpha 材料')).toBeInTheDocument()
  })

  it('提交 pending 时点击遮罩不会关闭，且不会重复提交', async () => {
    let resolveApply: ((value: unknown) => void) | null = null
    mockApplyTemplate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve
        }),
    )

    const onCancel = vi.fn()
    const { onApplied } = await renderDialog({ defaultListId: 7, onCancel })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '确认应用' })).toBeEnabled()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认应用' }))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '应用中...' })).toBeInTheDocument()
    })
    expect(mockApplyTemplate).toHaveBeenCalledTimes(1)

    // 点击遮罩（presentation 容器）
    const backdrop = screen.getByRole('presentation')
    fireEvent.click(backdrop)

    // 不应关闭：取消回调未触发，弹窗仍在
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '应用中...' })).toBeDisabled()

    // 再次点击确认应被禁用，不会二次提交
    fireEvent.click(screen.getByRole('button', { name: '应用中...' }))
    expect(mockApplyTemplate).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveApply?.({ id: 100, title: '滴答复刻 启动会', list_id: 7 })
    })

    await waitFor(() => {
      expect(onApplied).toHaveBeenCalled()
    })
  })
})
