import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../types'
import { SubtaskList } from '../SubtaskList'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: '父任务',
    priority: 0,
    completed: false,
    list_id: 1,
    parent_id: null,
    sort_order: 0,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    subtasks: [],
    ...overrides,
  }
}

function renderSubtaskList(onCreateSubtask: (parentId: number, title: string) => Promise<boolean>) {
  return render(
    <SubtaskList task={makeTask()} onUpdate={vi.fn()} onDelete={vi.fn()} onCreateSubtask={onCreateSubtask} />,
  )
}

describe('SubtaskList', () => {
  it('创建成功后清空输入框', async () => {
    const onCreateSubtask = vi.fn().mockResolvedValue(true)
    renderSubtaskList(onCreateSubtask)
    const input = screen.getByPlaceholderText('添加子任务')

    fireEvent.change(input, { target: { value: '准备材料' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCreateSubtask).toHaveBeenCalledWith(1, '准备材料')
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('创建失败时保留输入内容', async () => {
    const onCreateSubtask = vi.fn().mockResolvedValue(false)
    renderSubtaskList(onCreateSubtask)
    const input = screen.getByPlaceholderText('添加子任务')

    fireEvent.change(input, { target: { value: '稍后重试' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(input).not.toBeDisabled())
    expect(input).toHaveValue('稍后重试')
  })

  it('提交未完成时忽略重复回车', async () => {
    let resolveCreate: ((success: boolean) => void) | undefined
    const onCreateSubtask = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCreate = resolve
        }),
    )
    renderSubtaskList(onCreateSubtask)
    const input = screen.getByPlaceholderText('添加子任务')

    fireEvent.change(input, { target: { value: '只创建一次' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onCreateSubtask).toHaveBeenCalledTimes(1)
    resolveCreate?.(true)
    await waitFor(() => expect(input).toHaveValue(''))
  })
})
