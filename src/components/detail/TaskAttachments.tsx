import { useState, useEffect } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { appDataDir } from '@tauri-apps/api/path'
import type { Task } from '../../types'
import type { Attachment } from '../../types/attachment'
import { attachmentApi } from '../../api/attachmentApi'
import { useToast } from '../Toast'

interface TaskAttachmentsProps {
  task: Task
}

/** 格式化文件大小为人类可读字符串 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/** 判断是否为图片类型（用于缩略图预览） */
function isImage(mimeType?: string): boolean {
  return mimeType?.startsWith('image/') ?? false
}

// 附件区域：展示附件列表、添加/删除/打开附件，图片附件 inline 预览
export function TaskAttachments({ task }: TaskAttachmentsProps) {
  const toast = useToast()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [adding, setAdding] = useState(false)

  // 任务切换时重新加载附件
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const list = await attachmentApi.getAttachments(task.id)
        if (!cancelled) setAttachments(list)
      } catch (e: any) {
        console.error('加载附件失败', e)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [task.id])

  // 选择文件并添加为附件
  async function handleAddAttachment() {
    try {
      const selected = await openDialog({
        multiple: false,
        title: '选择附件文件',
      })
      if (!selected) return

      const filePath = selected as string
      const dir = await appDataDir()
      setAdding(true)
      const attachment = await attachmentApi.addAttachment(task.id, filePath, dir)
      setAttachments((prev) => [...prev, attachment])
      toast.info('附件已添加')
    } catch (e: any) {
      toast.error(`添加附件失败: ${e.message || e}`)
    } finally {
      setAdding(false)
    }
  }

  // 删除附件
  async function handleDelete(attachmentId: number) {
    try {
      await attachmentApi.deleteAttachment(attachmentId)
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
      toast.info('附件已删除')
    } catch (e: any) {
      toast.error(`删除附件失败: ${e.message || e}`)
    }
  }

  // 使用系统默认程序打开附件
  async function handleOpen(attachmentId: number) {
    try {
      await attachmentApi.openAttachment(attachmentId)
    } catch (e: any) {
      toast.error(`打开附件失败: ${e.message || e}`)
    }
  }

  return (
    <div className="relative">
      {/* 标题行 + 添加按钮 */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--color-text-tertiary)]">附件</span>
        <button
          onClick={handleAddAttachment}
          disabled={adding}
          className="text-xs px-2 py-0.5 rounded transition-colors text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-50"
          title="添加附件"
        >
          {adding ? '添加中...' : '+ 添加'}
        </button>
      </div>

      {/* 附件列表 */}
      {attachments.length === 0 ? (
        <p className="text-xs text-[var(--color-text-tertiary)] italic">暂无附件</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="group flex items-center gap-2 p-2 rounded-lg bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
            >
              {/* 缩略图 / 文件图标 */}
              {isImage(att.mime_type) ? (
                <img
                  src={convertFileSrc(att.file_path)}
                  alt={att.file_name}
                  className="w-10 h-10 object-cover rounded shrink-0 cursor-pointer border border-[var(--color-border-light)]"
                  onClick={() => handleOpen(att.id)}
                  title="点击打开"
                />
              ) : (
                <button
                  onClick={() => handleOpen(att.id)}
                  className="w-10 h-10 flex items-center justify-center rounded bg-[var(--color-bg-tertiary)] shrink-0 text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors"
                  title="打开文件"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </button>
              )}

              {/* 文件名 + 大小 */}
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => handleOpen(att.id)}
                  className="block text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] truncate text-left w-full transition-colors"
                  title={att.file_name}
                >
                  {att.file_name}
                </button>
                <span className="text-xs text-[var(--color-text-tertiary)]">{formatFileSize(att.file_size)}</span>
              </div>

              {/* 删除按钮 */}
              <button
                onClick={() => handleDelete(att.id)}
                className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-opacity shrink-0"
                title="删除附件"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
