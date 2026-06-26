// 统一的 localStorage 访问 key 定义
// 习惯打卡和番茄钟保持 localStorage 方案，不迁移到 Zustand
export const localStorageKeys = {
  habits: 'habits_data',
  pomodoroSettings: 'pomodoro_settings',
  pomodoroStats: 'pomodoro_stats',
  theme: 'theme',
  llmBaseUrl: 'llm_base_url',
  llmApiKey: 'llm_api_key',
  llmModel: 'llm_model',
  llmReasoning: 'llm_reasoning',
  llmReasoningEffort: 'llm_reasoning_effort',
  llmProviders: 'llm_providers',
} as const
