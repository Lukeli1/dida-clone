/** 附件（与后端 attachment_commands.rs 中的 Attachment 结构体对齐，蛇形命名） */
export interface Attachment {
  id: number
  task_id: number
  file_name: string
  file_path: string
  file_size: number
  mime_type?: string
  created_at: string
}
