import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../types'
import type { Attachment } from '../../../types/attachment'
import { TaskAttachments } from '../TaskAttachments'
import { TaskDetail } from '../TaskDetail'
import { ToastProvider } from '../../Toast'
import { ConfirmDialogProvider } from '../../common/ConfirmDialog'
import { attachmentApi } from '../../../api/attachmentApi'
import { MAX_IMAGE_ATTACHMENT_BYTES } from '../../../utils/taskAttachmentImage'

vi.mock('../../../api/attachmentApi', () => ({
  attachmentApi: {
    getAttachments: vi.fn(),
    addAttachment: vi.fn(),
    addImageAttachment: vi.fn(),
    deleteAttachment: vi.fn(),
    openAttachment: vi.fn(),
  },
}))

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(async () => '/appdata'),
}))

vi.mock('../../../api/invokeClient', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))

// 只保留 TaskDetail 容器与真实 TaskAttachments，隔离无关子面板的数据请求
vi.mock('../TaskNotes', () => ({ TaskNotes: () => <div data-testid="mock-notes" /> }))
vi.mock('../SubtaskList', () => ({
  SubtaskList: () => <div data-testid="mock-subtasks" />,
  TaskAIPanel: () => null,
}))
vi.mock('../TaskMetaPanel', () => ({
  SchedulePanel: () => <div data-testid="mock-schedule" />,
  TaskMetaPanel: () => <div data-testid="mock-meta" />,
}))
vi.mock('../TimeTrackingSection', () => ({ TimeTrackingSection: () => null }))
vi.mock('../RelatedTasksPanel', () => ({ RelatedTasksPanel: () => null }))
vi.mock('../TaskGoalsPanel', () => ({ TaskGoalsPanel: () => null }))

function makeTask(id = 1): Task {
  return {
    id,
    title: `任务 ${id}`,
    notes: null,
    priority: 0,
    due_date: '2026-07-03T09:00:00',
    end_date: null,
    all_day: false,
    completed: false,
    list_id: 1,
    parent_id: null,
    sort_order: 0,
    created_at: '2026-07-03T09:00:00',
    updated_at: '2026-07-03T09:00:00',
    subtasks: [],
  }
}

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 1,
    task_id: 1,
    file_name: 'a.png',
    file_path: '/data/attachments/1/a.png',
    file_size: 2048,
    mime_type: 'image/png',
    created_at: '2026-07-03T09:00:00',
    ...overrides,
  }
}

function makeImageFile(name = 'pasted.png', type = 'image/png', size?: number): File {
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type })
  if (size !== undefined) {
    Object.defineProperty(file, 'size', { configurable: true, value: size })
  }
  return file
}

function makeFileItem(file: File) {
  return { kind: 'file', type: file.type, getAsFile: () => file }
}

function pasteInto(element: HTMLElement, files: File[]) {
  fireEvent.paste(element, {
    clipboardData: {
      items: files.map(makeFileItem),
    },
  })
}

function renderDetail(task: Task = makeTask()) {
  const props = {
    task,
    tags: [],
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    onAddTag: vi.fn(),
    onRemoveTag: vi.fn(),
    onCreateSubtask: vi.fn(async () => true),
  }
  return {
    ...render(
      <ToastProvider>
        <ConfirmDialogProvider>
          <TaskDetail {...props} />
        </ConfirmDialogProvider>
      </ToastProvider>,
    ),
    props,
  }
}

function renderAttachmentList(task: Task = makeTask()) {
  return render(
    <ToastProvider>
      <TaskAttachments task={task} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.mocked(attachmentApi.getAttachments).mockReset().mockResolvedValue([])
  vi.mocked(attachmentApi.addAttachment).mockReset()
  vi.mocked(attachmentApi.addImageAttachment).mockReset()
  vi.mocked(attachmentApi.deleteAttachment).mockReset()
  vi.mocked(attachmentApi.openAttachment).mockReset()
})

describe('任务详情粘贴图片', () => {
  it('粘贴图片调用新增的字节上传 API，成功后显示缩略图', async () => {
    const uploaded = makeAttachment({ id: 5, file_name: 'pasted.png' })
    vi.mocked(attachmentApi.addImageAttachment).mockResolvedValue(uploaded)
    renderDetail()

    pasteInto(screen.getByTestId('task-detail'), [makeImageFile()])

    await waitFor(() => {
      expect(attachmentApi.addImageAttachment).toHaveBeenCalledWith(
        1,
        'pasted.png',
        'image/png',
        'iVBORw==',
        '/appdata',
      )
    })

    fireEvent.click(screen.getByRole('button', { name: /更多属性/ }))
    const image = await screen.findByTestId('attachment-image-5')
    expect(image).toHaveAttribute('src', 'asset:///data/attachments/1/a.png')
    expect(image).toHaveAttribute('alt', 'pasted.png')
  })

  it('非图片文件粘贴被拒绝，不调用上传 API', async () => {
    renderDetail()
    pasteInto(screen.getByTestId('task-detail'), [new File(['hello'], 'note.txt', { type: 'text/plain' })])

    await waitFor(() => {
      expect(screen.getAllByText('只能粘贴图片文件').length).toBeGreaterThan(0)
    })
    expect(attachmentApi.addImageAttachment).not.toHaveBeenCalled()
  })

  it('超过 10MB 的图片粘贴被拒绝，不调用上传 API', async () => {
    renderDetail()
    pasteInto(screen.getByTestId('task-detail'), [
      makeImageFile('huge.png', 'image/png', MAX_IMAGE_ATTACHMENT_BYTES + 1),
    ])

    await waitFor(() => {
      expect(screen.getAllByText('图片大小不能超过 10MB').length).toBeGreaterThan(0)
    })
    expect(attachmentApi.addImageAttachment).not.toHaveBeenCalled()
  })

  it('上传失败显示错误且不留下假附件', async () => {
    vi.mocked(attachmentApi.addImageAttachment).mockRejectedValue(new Error('磁盘已满'))
    renderDetail()

    pasteInto(screen.getByTestId('task-detail'), [makeImageFile()])
    fireEvent.click(screen.getByRole('button', { name: /更多属性/ }))

    await waitFor(() => {
      expect(screen.getByTestId('attachment-error')).toHaveTextContent('上传图片失败')
    })
    expect(document.querySelector('[data-testid^="attachment-row-"]')).toBeNull()
    expect(screen.getByText(/暂无附件/)).toBeInTheDocument()
  })

  it('监听只作用于任务详情区域，页面其他位置粘贴不会创建附件', async () => {
    renderDetail()
    await waitFor(() => expect(attachmentApi.getAttachments).toHaveBeenCalled())
    const outside = document.createElement('div')
    document.body.appendChild(outside)

    pasteInto(outside, [makeImageFile()])
    expect(attachmentApi.addImageAttachment).not.toHaveBeenCalled()

    outside.remove()
  })

  it('详情卸载后不残留粘贴监听', async () => {
    const { unmount } = renderDetail()
    await waitFor(() => expect(attachmentApi.getAttachments).toHaveBeenCalled())
    unmount()

    pasteInto(document.body, [makeImageFile()])
    expect(attachmentApi.addImageAttachment).not.toHaveBeenCalled()
  })
})

describe('附件列表交互', () => {
  it('加载已有图片附件后显示缩略图，点击调用打开 API', async () => {
    vi.mocked(attachmentApi.getAttachments).mockResolvedValue([makeAttachment({ id: 8 })])
    renderAttachmentList()

    const image = await screen.findByTestId('attachment-image-8')
    expect(image).toHaveAttribute('src', 'asset:///data/attachments/1/a.png')

    fireEvent.click(screen.getByRole('button', { name: '打开图片 a.png' }))
    await waitFor(() => expect(attachmentApi.openAttachment).toHaveBeenCalledWith(8))
  })

  it('删除图片调用现有删除 API 并从列表移除', async () => {
    vi.mocked(attachmentApi.getAttachments).mockResolvedValue([makeAttachment({ id: 9 })])
    vi.mocked(attachmentApi.deleteAttachment).mockResolvedValue(undefined)
    renderAttachmentList()

    await screen.findByTestId('attachment-row-9')
    fireEvent.click(screen.getByRole('button', { name: '删除附件 a.png' }))

    await waitFor(() => expect(attachmentApi.deleteAttachment).toHaveBeenCalledWith(9))
    await waitFor(() => expect(screen.queryByTestId('attachment-row-9')).not.toBeInTheDocument())
  })

  it('图片加载失败时降级为文件图标，详情布局不丢失', async () => {
    vi.mocked(attachmentApi.getAttachments).mockResolvedValue([makeAttachment({ id: 10 })])
    renderAttachmentList()

    const image = await screen.findByTestId('attachment-image-10')
    fireEvent.error(image)

    expect(screen.queryByTestId('attachment-image-10')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开附件 a.png' })).toBeInTheDocument()
    expect(screen.getByTestId('attachment-row-10')).toHaveTextContent('预览加载失败')
  })

  it('切换任务后按新 task_id 重新加载附件列表', async () => {
    vi.mocked(attachmentApi.getAttachments).mockResolvedValue([makeAttachment({ id: 11, task_id: 1 })])
    const view = renderAttachmentList(makeTask(1))
    await screen.findByTestId('attachment-row-11')

    vi.mocked(attachmentApi.getAttachments).mockResolvedValue([
      makeAttachment({ id: 12, task_id: 2, file_name: 'b.png' }),
    ])
    view.rerender(
      <ToastProvider>
        <TaskAttachments task={makeTask(2)} />
      </ToastProvider>,
    )

    await screen.findByTestId('attachment-row-12')
    expect(screen.queryByTestId('attachment-row-11')).not.toBeInTheDocument()
    expect(attachmentApi.getAttachments).toHaveBeenLastCalledWith(2)
  })

  it('图片选择器上传成功后将新附件加入列表', async () => {
    vi.mocked(attachmentApi.addImageAttachment).mockResolvedValue(makeAttachment({ id: 13, file_name: 'picked.png' }))
    renderAttachmentList()

    const input = screen.getByTestId('attachment-image-input')
    fireEvent.change(input, { target: { files: [makeImageFile('picked.png')] } })

    await waitFor(() => expect(attachmentApi.addImageAttachment).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('attachment-image-13')).toBeInTheDocument()
  })
})
