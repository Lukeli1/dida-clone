import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from 'react'
import { appDataDir } from '@tauri-apps/api/path'
import { attachmentApi } from '../api/attachmentApi'
import type { Attachment } from '../types/attachment'
import { useOptionalToast } from '../components/Toast'
import { extractClipboardImageFiles, readImageFileForUpload } from '../utils/taskAttachmentImage'

export interface TaskAttachmentController {
  attachments: Attachment[]
  loading: boolean
  uploading: boolean
  error: string | null
  /** 校验并上传图片文件；返回成功添加数量。失败不会追加假附件。 */
  addImageFiles: (files: File[] | FileList) => Promise<number>
  /** 仅绑定在任务详情容器上的粘贴处理（不注册全局监听） */
  handlePaste: (event: ClipboardEvent<HTMLElement>) => void
  /** 现有附件 API：删除（数据库记录 + 文件） */
  removeAttachment: (attachmentId: number) => Promise<boolean>
  /** 现有附件 API：系统默认程序打开 */
  openAttachment: (attachmentId: number) => Promise<void>
  /** 重新加载当前任务附件 */
  reload: () => Promise<void>
  /** 将外部新增附件（如通用文件选择器）合并进列表 */
  registerAttachment: (attachment: Attachment) => void
  dismissError: () => void
}

interface UseTaskAttachmentsOptions {
  /** 详情页可传入已由上层管理的 controller，此时内部实例停止请求 */
  enabled?: boolean
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * 任务附件状态与图片上传流程。
 *
 * 关键边界：
 * - 只通过 attachmentApi 访问后端，不直接 invoke；
 * - 图片以字节上传（新增 add_image_attachment），不写入任务 notes；
 * - 粘贴监听由调用方绑定在详情容器上，本 hook 不注册 document/window 监听；
 * - 切换任务时清空旧列表并按 task_id 重新加载；
 * - 上传失败 / 校验失败只记录错误与 toast，不向列表追加假附件。
 */
export function useTaskAttachments(
  taskId: number,
  { enabled = true }: UseTaskAttachmentsOptions = {},
): TaskAttachmentController {
  const toast = useOptionalToast()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(enabled)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestSeqRef = useRef(0)
  const taskIdRef = useRef(taskId)

  useEffect(() => {
    taskIdRef.current = taskId
  }, [taskId])

  const reload = useCallback(async () => {
    if (!enabled) return
    const seq = ++requestSeqRef.current
    setLoading(true)
    setError(null)
    try {
      const list = await attachmentApi.getAttachments(taskId)
      if (seq === requestSeqRef.current) setAttachments(list)
    } catch (loadError) {
      if (seq === requestSeqRef.current) {
        setAttachments([])
        setError('加载附件失败')
        console.error('加载附件失败', loadError)
      }
    } finally {
      if (seq === requestSeqRef.current) setLoading(false)
    }
  }, [enabled, taskId])

  useEffect(() => {
    if (!enabled) return
    setAttachments([])
    setError(null)
    void reload()
    return () => {
      // 任务切换 / 卸载后使旧请求失效
      requestSeqRef.current += 1
    }
  }, [enabled, reload])

  const registerAttachment = useCallback((attachment: Attachment) => {
    setAttachments((current) =>
      current.some((item) => item.id === attachment.id) ? current : [...current, attachment],
    )
  }, [])

  const addImageFiles = useCallback(
    async (files: File[] | FileList) => {
      const list = Array.from(files)
      if (list.length === 0) return 0

      const targetTaskId = taskId
      setUploading(true)
      setError(null)
      let added = 0
      let firstError: string | null = null

      try {
        const dir = await appDataDir()
        for (const file of list) {
          const read = await readImageFileForUpload(file)
          if (!read.ok) {
            firstError ??= read.error
            toast?.error(read.error)
            continue
          }

          try {
            const attachment = await attachmentApi.addImageAttachment(
              targetTaskId,
              read.payload.fileName,
              read.payload.mimeType,
              read.payload.bytesBase64,
              dir,
            )
            added += 1
            // 上传期间切换了任务：附件仍归属原任务，但不写入当前任务的列表
            if (taskIdRef.current === targetTaskId) {
              setAttachments((current) =>
                current.some((item) => item.id === attachment.id) ? current : [...current, attachment],
              )
            }
          } catch (uploadError) {
            const message = `上传图片失败: ${toErrorMessage(uploadError)}`
            firstError ??= message
            toast?.error(message)
          }
        }
      } catch (dirError) {
        const message = `上传图片失败: ${toErrorMessage(dirError)}`
        firstError = message
        toast?.error(message)
      } finally {
        setUploading(false)
      }

      if (firstError) setError(firstError)
      if (added > 0) {
        toast?.success(added === 1 ? '图片已添加' : `已添加 ${added} 张图片`)
      }
      return added
    },
    [taskId, toast],
  )

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLElement>) => {
      const clipboard = event.clipboardData
      if (!clipboard?.items) return

      const { imageFiles, rejectedFiles } = extractClipboardImageFiles(clipboard.items)
      // 纯文本 / 普通内容粘贴不拦截，避免影响备注输入
      if (imageFiles.length === 0 && rejectedFiles.length === 0) return

      event.preventDefault()

      if (rejectedFiles.length > 0) {
        const message = imageFiles.length > 0 ? '已忽略非图片文件' : '只能粘贴图片文件'
        setError(message)
        toast?.error(message)
      }

      if (imageFiles.length > 0) {
        void addImageFiles(imageFiles)
      }
    },
    [addImageFiles, toast],
  )

  const removeAttachment = useCallback(
    async (attachmentId: number) => {
      try {
        await attachmentApi.deleteAttachment(attachmentId)
        setAttachments((current) => current.filter((item) => item.id !== attachmentId))
        toast?.info('附件已删除')
        return true
      } catch (deleteError) {
        toast?.error(`删除附件失败: ${toErrorMessage(deleteError)}`)
        return false
      }
    },
    [toast],
  )

  const openAttachment = useCallback(
    async (attachmentId: number) => {
      try {
        await attachmentApi.openAttachment(attachmentId)
      } catch (openError) {
        toast?.error(`打开附件失败: ${toErrorMessage(openError)}`)
      }
    },
    [toast],
  )

  const dismissError = useCallback(() => setError(null), [])

  return {
    attachments,
    loading,
    uploading,
    error,
    addImageFiles,
    handlePaste,
    removeAttachment,
    openAttachment,
    reload,
    registerAttachment,
    dismissError,
  }
}
