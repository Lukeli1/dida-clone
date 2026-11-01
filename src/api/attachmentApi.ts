import { invokeCommand as invoke } from './invokeClient'
import type { Attachment } from '../types/attachment'

/**
 * 附件相关 API：封装后端 attachment_commands 中的 4 个命令。
 * 参数命名采用驼峰（Tauri 自动转为 Rust 端的 snake_case）。
 */
export const attachmentApi = {
  /** 获取指定任务的所有附件 */
  getAttachments: (taskId: number): Promise<Attachment[]> => invoke<Attachment[]>('get_attachments', { taskId }),

  /** 添加附件（将源文件复制到应用数据目录，返回后端生成的完整 Attachment） */
  addAttachment: (taskId: number, filePath: string, appDataDir: string): Promise<Attachment> =>
    invoke<Attachment>('add_attachment', { taskId, filePath, appDataDir }),

  /**
   * 从字节数据添加图片附件（剪贴板 / HTML file input）。
   * bytes 为 base64 字符串；后端会再次校验图片格式、大小并写入既有 attachments 目录与表。
   */
  addImageAttachment: (
    taskId: number,
    fileName: string,
    mimeType: string,
    bytes: string,
    appDataDir: string,
  ): Promise<Attachment> =>
    invoke<Attachment>('add_image_attachment', { taskId, fileName, mimeType, bytes, appDataDir }),

  /** 删除附件（删除数据库记录并清理文件） */
  deleteAttachment: (attachmentId: number): Promise<void> => invoke<void>('delete_attachment', { attachmentId }),

  /** 使用系统默认程序打开附件 */
  openAttachment: (attachmentId: number): Promise<void> => invoke<void>('open_attachment', { attachmentId }),
}
