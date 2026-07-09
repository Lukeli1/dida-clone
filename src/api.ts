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
export { templateApi } from './api/templateApi'
export { attachmentApi } from './api/attachmentApi'
export { repeatApi } from './api/repeatApi'
export { timeTrackingApi } from './api/timeTrackingApi'
export { reportApi } from './api/reportApi'
export { goalApi } from './api/goalApi'
export type { Attachment } from './types/attachment'
export type { TimeEntry, TimeStat } from './api/timeTrackingApi'
export type { ReportRecord, ReportType } from './api/reportApi'
export type { Goal, GoalProgress, GoalType, GoalStatus, CreateGoalRequest, UpdateGoalRequest } from './api/goalApi'

// AI 流式对话 & 数据导出/导入
export { llmChatStream } from './api/llmApi'
export { dataApi } from './api/dataApi'
export type { ImportResult, ImportPreviewResult, TablePreview, ExistingCounts } from './api/dataApi'
export { snapshotApi } from './api/snapshotApi'
export type { SnapshotInfo, SnapshotResult, RestoreResult } from './types/snapshot'
export { syncLogApi } from './api/syncLogApi'
export type { SyncLogEntry } from './api/syncLogApi'

// 向后兼容：组合 taskApi / listApi / tagApi 为统一的 api 对象
import { taskApi } from './api/taskApi'
import { listApi } from './api/listApi'
import { tagApi } from './api/tagApi'

export const api = {
  ...taskApi,
  ...listApi,
  ...tagApi,
}
