/**
 * 统一导出入口：所有 API 子模块从此文件聚合导出，保持对外接口完全兼容。
 * 详见 src/api/ 目录下各子模块。
 */

// 公共导出
export { isTauri, invoke } from './api/_shared'

// 各领域 API 对象
export { taskApi } from './api/taskApi'
export { listApi } from './api/listApi'
export { tagApi } from './api/tagApi'
export { habitApi } from './api/habitApi'
export { syncApi } from './api/syncApi'

// AI 流式对话 & 数据导出/导入
export { llmChatStream } from './api/llmApi'
export { dataApi } from './api/dataApi'
export type { ImportResult } from './api/dataApi'

// 向后兼容：组合 taskApi / listApi / tagApi 为统一的 api 对象
import { taskApi } from './api/taskApi'
import { listApi } from './api/listApi'
import { tagApi } from './api/tagApi'

export const api = {
  ...taskApi,
  ...listApi,
  ...tagApi,
}
