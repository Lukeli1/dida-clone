import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './_shared'

/**
 * 重复任务相关 API。
 * 与后端 complete_recurring_task 命令交互。
 */
export const repeatApi = {
  /**
   * 完成重复任务。
   * - 若规则已到期（endDate/count 到达）→ 标记完成，返回 0
   * - 否则：创建下一周期任务并标记当前完成，返回新任务 id
   */
  completeRecurringTask: async (taskId: number): Promise<number> => {
    if (!isTauri) {
      return Promise.resolve(0)
    }
    return await invoke<number>('complete_recurring_task', { taskId })
  },
}
