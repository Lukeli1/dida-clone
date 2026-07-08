import { invokeCommand as invoke } from './invokeClient'
import type { TaskTemplate, CreateTemplateRequest, UpdateTemplateRequest } from '../types/template'

/**
 * 任务模板相关 API：直接调用 Tauri command，配合本地 React state 使用。
 * 参数命名采用驼峰（Tauri 自动转为 Rust 端的 snake_case）。
 */
export const templateApi = {
  /** 获取所有模板（含子任务模板） */
  getTemplates: (): Promise<TaskTemplate[]> => invoke<TaskTemplate[]>('get_templates'),

  /** 创建模板，返回后端生成的完整 TaskTemplate（含 id） */
  createTemplate: (req: CreateTemplateRequest): Promise<TaskTemplate> =>
    invoke<TaskTemplate>('create_template', { req }),

  /** 更新模板字段（仅传入需要更新的字段） */
  updateTemplate: (req: UpdateTemplateRequest): Promise<TaskTemplate> =>
    invoke<TaskTemplate>('update_template', { req }),

  /** 删除模板（子任务模板因 ON DELETE CASCADE 自动清除） */
  deleteTemplate: (id: number): Promise<void> => invoke<void>('delete_template', { id }),

  /** 从模板创建任务（含子任务），返回创建的主任务 */
  applyTemplate: (templateId: number, listId: number): Promise<void> =>
    invoke<void>('apply_template', { templateId, listId }),
}
