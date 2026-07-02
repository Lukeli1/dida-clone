/**
 * 统一的 localStorage key 定义（带 `dida:` 命名空间前缀）。
 *
 * 历史代码中各模块直接使用裸字符串作为 localStorage 的 key（如 'theme'、'llm_base_url'），
 * 不同模块之间容易出现 key 冲突，也不利于排查与清理。本文件引入统一的 `dida:` 前缀命名空间，
 * 并提供 {@link migrateStorageKeys} 在应用启动时把旧的裸 key 迁移到新的命名空间 key。
 *
 * 迁移策略（两阶段软迁移，保证平滑过渡、不破坏现有读取逻辑）：
 *   - 第一阶段（当前）：migrateStorageKeys 仅把「旧 key」的值复制到「新 key」（新 key 已存在则跳过），
 *     不删除旧 key。现有读取旧 key 的代码继续正常工作，新命名空间的 key 已就绪供后续逐步切换。
 *   - 第二阶段（后续）：各模块的读写逐步切换到 STORAGE_KEYS 新 key；全部切换完成后，
 *     可将 migrateStorageKeys 改为「复制后删除旧 key」并最终下线。
 *
 * 注意：动态 key（如 `weekly_report_<date>`）不纳入静态常量与迁移映射，
 * 由各自模块按需拼接前缀。
 */

const PREFIX = 'dida:'

/**
 * 所有静态 localStorage key（已加 `dida:` 前缀）。
 * 新代码请优先使用本常量中的 key，避免使用裸字符串。
 */
export const STORAGE_KEYS = {
  /** 主题：light / dark / system */
  theme: `${PREFIX}theme`,
  /** 主题预设 ID */
  themePreset: `${PREFIX}theme_preset`,
  /** 自定义强调色 */
  themeAccent: `${PREFIX}theme_accent`,
  /** 大模型 Base URL */
  llmBaseUrl: `${PREFIX}llm_base_url`,
  /** 大模型 API Key */
  llmApiKey: `${PREFIX}llm_api_key`,
  /** 大模型名称 */
  llmModel: `${PREFIX}llm_model`,
  /** 是否开启推理模式 */
  llmReasoning: `${PREFIX}llm_reasoning`,
  /** 推理强度 */
  llmReasoningEffort: `${PREFIX}llm_reasoning_effort`,
  /** 已保存的厂商列表 */
  llmProviders: `${PREFIX}llm_providers`,
  /** 习惯打卡数据 */
  habits: `${PREFIX}habits_data`,
  /** 番茄钟设置 */
  pomodoroSettings: `${PREFIX}pomodoro_settings`,
  /** 番茄钟统计 */
  pomodoroStats: `${PREFIX}pomodoro_stats`,
  /** 新手引导是否已展示 */
  onboardingSeen: `${PREFIX}onboarding_seen`,
  /** 默认提醒提前分钟数 */
  defaultReminderOffset: `${PREFIX}default_reminder_offset`,
  /** 自定义快捷键 */
  customShortcuts: `${PREFIX}customShortcuts`,
  /** 是否开启系统通知 */
  notifications: `${PREFIX}notifications`,
  /** 是否开启提醒声音 */
  reminderSound: `${PREFIX}reminderSound`,
  /** 任务备注编辑模式 */
  taskNoteMode: `${PREFIX}taskNoteMode`,
  /** 一周起始日 */
  weekStart: `${PREFIX}weekStart`,
  /** 删除前是否确认 */
  confirmDelete: `${PREFIX}confirmDelete`,
  /** 搜索历史 */
  searchHistory: `${PREFIX}search_history`,
  /** 用户头像 dataURL */
  userAvatar: `${PREFIX}userAvatar`,
  /** 外观设置（字号等） */
  appAppearance: `${PREFIX}appAppearance`,
  /** 字体设置 */
  appFont: `${PREFIX}appFont`,
  /** 是否已请求过通知权限 */
  notificationPermissionRequested: `${PREFIX}notification_permission_requested`,
  /** 性能监控记录 */
  perfRecords: `${PREFIX}perf_records`,
  /** 错误日志 */
  errorLogs: `${PREFIX}error_logs`,
} as const

/** 旧 key → 新 key 的迁移映射（裸 key → `dida:` 前缀 key） */
const MIGRATION_MAP: ReadonlyArray<readonly [string, string]> = [
  ['theme', STORAGE_KEYS.theme],
  ['theme_preset', STORAGE_KEYS.themePreset],
  ['theme_accent', STORAGE_KEYS.themeAccent],
  ['llm_base_url', STORAGE_KEYS.llmBaseUrl],
  ['llm_api_key', STORAGE_KEYS.llmApiKey],
  ['llm_model', STORAGE_KEYS.llmModel],
  ['llm_reasoning', STORAGE_KEYS.llmReasoning],
  ['llm_reasoning_effort', STORAGE_KEYS.llmReasoningEffort],
  ['llm_providers', STORAGE_KEYS.llmProviders],
  ['habits_data', STORAGE_KEYS.habits],
  ['pomodoro_settings', STORAGE_KEYS.pomodoroSettings],
  ['pomodoro_stats', STORAGE_KEYS.pomodoroStats],
  ['onboarding_seen', STORAGE_KEYS.onboardingSeen],
  ['default_reminder_offset', STORAGE_KEYS.defaultReminderOffset],
  ['customShortcuts', STORAGE_KEYS.customShortcuts],
  ['notifications', STORAGE_KEYS.notifications],
  ['reminderSound', STORAGE_KEYS.reminderSound],
  ['taskNoteMode', STORAGE_KEYS.taskNoteMode],
  ['weekStart', STORAGE_KEYS.weekStart],
  ['confirmDelete', STORAGE_KEYS.confirmDelete],
  ['search_history', STORAGE_KEYS.searchHistory],
  ['userAvatar', STORAGE_KEYS.userAvatar],
  ['appAppearance', STORAGE_KEYS.appAppearance],
  ['appFont', STORAGE_KEYS.appFont],
  ['notification_permission_requested', STORAGE_KEYS.notificationPermissionRequested],
  ['perf_records', STORAGE_KEYS.perfRecords],
  ['error_logs', STORAGE_KEYS.errorLogs],
]

/** 标记本次启动是否已执行过迁移，避免同一会话内重复遍历 localStorage */
let migrated = false

/**
 * 把旧的裸 key 迁移到新的 `dida:` 前缀 key。
 *
 * 行为（第一阶段软迁移）：
 *   - 仅当「旧 key 存在」且「新 key 不存在」时，把旧值复制到新 key；
 *   - 不删除旧 key，确保仍读取旧 key 的现有代码继续可用；
 *   - 整个过程幂等且失败安全：任何异常都被吞掉并打 warn，绝不阻塞应用启动。
 *
 * 该函数在应用启动时由 useAppInit 调用一次即可。
 */
export function migrateStorageKeys(): void {
  if (migrated) return
  migrated = true
  try {
    for (const [oldKey, newKey] of MIGRATION_MAP) {
      // 新 key 已存在则跳过，避免覆盖用户在新命名空间下已保存的值
      if (localStorage.getItem(newKey) !== null) continue
      const value = localStorage.getItem(oldKey)
      if (value === null) continue
      localStorage.setItem(newKey, value)
    }
  } catch (err) {
    // 迁移失败不应影响应用启动，仅打印警告
    console.warn('migrateStorageKeys 失败:', err)
  }
}
