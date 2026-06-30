import { invoke } from '@tauri-apps/api/core'
import type { Attachment } from '../types/attachment'

/**
 * 附件相关 API：封装后端 attachment_commands 中的 4 个命令。
 * 参数命名采用驼峰（Tauri 自动转为 Rust 端的 snake_case）。
 */
export const attachmentApi = {
  /** 获取指定任务的所有附件 */
  getAttachments: (taskId: number): Promise<Attachment[]> =>
    invoke<Attachment[]>('get_attachments', { taskId }),

  /** 添加附件（将源文件复制到应用数据目录，返回后端生成的完整 Attachment） */
  addAttachment: (taskId: number, filePath: string, appDataDir: string): Promise<Attachment> =>
    invoke<Attachment>('add_attachment', { taskId, filePath, appDataDir }),

  /** 删除附件（删除数据库记录并清理文件） */
  deleteAttachment: (attachmentId: number): Promise<void> =>
    invoke<void>('delete_attachment', { attachmentId }),

  /** 使用系统默认程序打开附件 */
  openAttachment: (attachmentId: number): Promise<void> =>
    invoke<void>('open_attachment', { attachmentId }),
}
