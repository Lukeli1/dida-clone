import { useEffect, useRef, useState } from 'react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '../../api/invokeClient'
import { appDataDir } from '@tauri-apps/api/path'
import type { Task } from '../../types'
import { attachmentApi } from '../../api/attachmentApi'
import { useToast } from '../Toast'
import { useTaskAttachments, type TaskAttachmentController } from '../../hooks/useTaskAttachments'
import { IMAGE_ATTACHMENT_ACCEPT, isImageMimeType } from '../../utils/taskAttachmentImage'

interface TaskAttachmentsProps {
  task: Task
  /** 详情页上层持有 controller 时传入，保证粘贴与列表共享同一份状态 */
  controller?: TaskAttachmentController
}

/** 格式化文件大小为人类可读字符串 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/** 安全获取本地文件预览地址；失败时退回原路径，避免整块详情崩溃 */
function getPreviewSrc(filePath: string): string {
  try {
    return convertFileSrc(filePath)
  } catch {
    return filePath
  }
}

// 附件区域：展示附件列表、粘贴 / 选择图片上传、通用文件添加、删除 / 打开
export function TaskAttachments({ task, controller }: TaskAttachmentsProps) {
  const toast = useToast()
  const internalController = useTaskAttachments(task.id, { enabled: !controller })
  const state = controller ?? internalController
  const [addingFile, setAddingFile] = useState(false)
  const [failedPreviews, setFailedPreviews] = useState<Set<number>>(() => new Set())
  const imageInputRef = useRef<HTMLInputElement>(null)

  // 切换任务时清空图片加载失败标记
  useEffect(() => {
    setFailedPreviews(new Set())
  }, [task.id])

  // 通用文件附件：继续复用既有 add_attachment（路径复制）
  async function handleAddFile() {
    try {
      const selected = await openDialog({
        multiple: false,
        title: '选择附件文件',
      })
      if (!selected) return

      setAddingFile(true)
      const dir = await appDataDir()
      const attachment = await attachmentApi.addAttachment(task.id, selected as string, dir)
      state.registerAttachment(attachment)
      toast.info('附件已添加')
    } catch (e: any) {
      toast.error(`添加附件失败: ${e.message || e}`)
    } finally {
      setAddingFile(false)
    }
  }

  function handleImageInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : []
    // 允许再次选择同一文件
    e.target.value = ''
    if (files.length > 0) void state.addImageFiles(files)
  }

  function markPreviewFailed(attachmentId: number) {
    setFailedPreviews((current) => {
      const next = new Set(current)
      next.add(attachmentId)
      return next
    })
  }

  const busy = state.uploading || addingFile

  return (
    <div className="relative" data-testid="task-attachments">
      {/* 标题行 + 添加按钮 */}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs text-[var(--color-text-tertiary)]">附件</span>
          <span className="truncate text-[10px] text-[var(--color-text-tertiary)]">支持粘贴图片（≤10MB）</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={busy}
            className="rounded px-2 py-0.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-accent)] disabled:opacity-50"
            aria-label="上传图片"
            title="上传图片"
          >
            上传图片
          </button>
          <button
            type="button"
            onClick={handleAddFile}
            disabled={busy}
            className="rounded px-2 py-0.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-accent)] disabled:opacity-50"
            aria-label="添加附件"
            title="添加附件"
          >
            {addingFile ? '添加中...' : '+ 添加'}
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept={IMAGE_ATTACHMENT_ACCEPT}
            multiple
            className="hidden"
            data-testid="attachment-image-input"
            aria-label="选择图片文件"
            onChange={handleImageInputChange}
          />
        </div>
      </div>

      {/* 上传 / 加载状态 */}
      {state.uploading && (
        <p
          role="status"
          aria-live="polite"
          data-testid="attachment-uploading"
          className="mb-1 text-xs text-[var(--color-accent)]"
        >
          图片上传中...
        </p>
      )}
      {state.loading && !state.uploading && (
        <p className="mb-1 text-xs text-[var(--color-text-tertiary)]" data-testid="attachment-loading">
          加载中...
        </p>
      )}

      {/* 失败提示：与列表分离，不会伪装成附件 */}
      {state.error && (
        <div
          role="alert"
          data-testid="attachment-error"
          className="mb-2 flex items-start justify-between gap-2 rounded-md border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-2 py-1 text-xs text-[var(--color-danger)]"
        >
          <span className="min-w-0 break-words">{state.error}</span>
          <button
            type="button"
            onClick={state.dismissError}
            className="shrink-0 text-current/70 hover:text-current"
            aria-label="关闭附件错误提示"
          >
            ×
          </button>
        </div>
      )}

      {/* 附件列表 */}
      {!state.loading && state.attachments.length === 0 ? (
        <p className="text-xs italic text-[var(--color-text-tertiary)]">暂无附件，可粘贴或上传图片</p>
      ) : (
        <div className="space-y-2">
          {state.attachments.map((att) => {
            const image = isImageMimeType(att.mime_type)
            const previewFailed = failedPreviews.has(att.id)
            return (
              <div
                key={att.id}
                data-testid={`attachment-row-${att.id}`}
                className="group flex items-center gap-2 rounded-lg bg-[var(--color-bg-secondary)] p-2 transition-colors hover:bg-[var(--color-bg-tertiary)]"
              >
                {/* 缩略图 / 文件图标：固定 40px 容器，图片加载失败不改变布局 */}
                {image && !previewFailed ? (
                  <button
                    type="button"
                    onClick={() => state.openAttachment(att.id)}
                    className="h-10 w-10 shrink-0 overflow-hidden rounded border border-[var(--color-border-light)]"
                    aria-label={`打开图片 ${att.file_name}`}
                    title="点击打开"
                  >
                    <img
                      src={getPreviewSrc(att.file_path)}
                      alt={att.file_name}
                      data-testid={`attachment-image-${att.id}`}
                      className="h-full w-full object-cover"
                      onError={() => markPreviewFailed(att.id)}
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => state.openAttachment(att.id)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-accent)]"
                    title="打开文件"
                    aria-label={`打开附件 ${att.file_name}`}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => state.openAttachment(att.id)}
                    className="block w-full truncate text-left text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]"
                    title={att.file_name}
                  >
                    {att.file_name}
                  </button>
                  <span className="text-xs text-[var(--color-text-tertiary)]">
                    {formatFileSize(att.file_size)}
                    {previewFailed ? ' · 预览加载失败' : ''}
                  </span>
                </div>

                {/* 删除按钮 */}
                <button
                  type="button"
                  onClick={() => void state.removeAttachment(att.id)}
                  className="shrink-0 text-[var(--color-text-tertiary)] opacity-0 transition-opacity hover:text-[var(--color-danger)] focus:opacity-100 group-hover:opacity-100"
                  title="删除附件"
                  aria-label={`删除附件 ${att.file_name}`}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
