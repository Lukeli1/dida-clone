import { invokeCommand as invoke } from './invokeClient'
import type {
  TaskTemplate,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  ApplyTemplateRequest,
  ApplyTemplateOptions,
} from '../types/template'
import type { Task } from '../types'

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

  /**
   * 从模板创建任务（含子任务），返回创建的主任务。
   *
   * 兼容：
   * - 旧签名 applyTemplate(templateId, listId)
   * - 新签名 applyTemplate({ templateId, listId, dueDate?, tagIds?, variables? })
   */
  applyTemplate: (
    templateIdOrReq: number | ApplyTemplateRequest,
    listId?: number,
    options?: ApplyTemplateOptions,
  ): Promise<Task> => {
    // 顶层参数用驼峰（Tauri 自动转 snake_case）；
    // 嵌套 options 结构体字段直接使用 snake_case，与 Rust serde 默认命名一致。
    const toBackendOptions = (opts?: ApplyTemplateOptions | null) => {
      if (!opts) return null
      return {
        due_date: opts.dueDate ?? null,
        tag_ids: opts.tagIds,
        variables: opts.variables,
      }
    }

    if (typeof templateIdOrReq === 'object' && templateIdOrReq !== null) {
      const req = templateIdOrReq
      return invoke<Task>('apply_template', {
        templateId: req.templateId,
        listId: req.listId,
        options: toBackendOptions({
          dueDate: req.dueDate,
          tagIds: req.tagIds,
          variables: req.variables,
        }),
      })
    }

    if (listId === undefined) {
      return Promise.reject(new Error('applyTemplate 需要 listId'))
    }

    return invoke<Task>('apply_template', {
      templateId: templateIdOrReq,
      listId,
      options: toBackendOptions(options),
    })
  },
}
