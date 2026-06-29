import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Task, List, Tag, CreateTaskRequest, CreateListRequest, UpdateListRequest, CreateTagRequest, ReorderItem, CompleteResult, Habit, HabitRecord, CreateHabitRequest, UpdateHabitRequest, ChatMessage } from './types'
import type { LLMConfig } from './utils/llm'

// 桌面应用默认在 Tauri 环境中，不再依赖 window.__TAURI__ 检测
export const isTauri = true

const mockTasks: Task[] = []
const mockLists: List[] = [
  {
    id: 1,
    name: '收件箱',
    color: '#3B82F6',
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]
const mockTags: Tag[] = [
  { id: 1, name: '工作', color: '#3B82F6', parent_id: undefined, created_at: new Date().toISOString() },
  { id: 2, name: '生活', color: '#10B981', parent_id: undefined, created_at: new Date().toISOString() },
  { id: 3, name: '重要', color: '#EF4444', parent_id: undefined, created_at: new Date().toISOString() },
]
const mockTaskTags: Record<number, number[]> = {}

let nextTaskId = 2
let nextListId = 2
let nextTagId = 4

export const api = {
  getTasks: async (filter?: { list_id?: number; include_completed?: boolean; include_archived?: boolean }): Promise<Task[]> => {
    if (!isTauri) {
      return Promise.resolve(mockTasks.map(t => ({ ...t, tag_ids: mockTaskTags[t.id] || [] })))
    }
    return await invoke<Task[]>('get_tasks', {
      listId: filter?.list_id ?? null,
      includeCompleted: filter?.include_completed ?? null,
      includeArchived: filter?.include_archived ?? null,
    })
  },

  createTask: async (req: CreateTaskRequest): Promise<Task> => {
    if (!isTauri) {
      const now = new Date().toISOString()
      const task: Task = {
        id: nextTaskId++,
        title: req.title,
        notes: req.notes,
        priority: req.priority ?? 2,
        due_date: req.due_date,
        end_date: req.end_date,
        reminder: req.reminder,
        completed: false,
        archived: false,
        list_id: req.list_id,
        parent_id: req.parent_id,
        repeat_rule: req.repeat_rule,
        sort_order: Date.now(),
        created_at: now,
        updated_at: now,
        tag_ids: [],
      }
      mockTasks.unshift(task)
      return Promise.resolve(task)
    }
    return await invoke<Task>('create_task', { req })
  },

  updateTask: async (id: number, updates: Partial<Task>): Promise<void> => {
    if (!isTauri) {
      const index = mockTasks.findIndex((t) => t.id === id)
      if (index !== -1) {
        mockTasks[index] = { ...mockTasks[index], ...updates }
      }
      return Promise.resolve()
    }
    await invoke('update_task', { id, updates })
  },

  deleteTask: async (id: number): Promise<void> => {
    if (!isTauri) {
      const index = mockTasks.findIndex((t) => t.id === id)
      if (index !== -1) {
        mockTasks.splice(index, 1)
      }
      return Promise.resolve()
    }
    await invoke('delete_task', { id })
  },

  getLists: async (): Promise<List[]> => {
    if (!isTauri) {
      return Promise.resolve([...mockLists])
    }
    return await invoke<List[]>('get_lists')
  },

  createList: async (req: CreateListRequest): Promise<List> => {
    if (!isTauri) {
      const now = new Date().toISOString()
      const list: List = {
        id: nextListId++,
        name: req.name,
        color: req.color ?? '#6B7280',
        is_default: req.is_default ?? false,
        created_at: now,
        updated_at: now,
      }
      mockLists.push(list)
      return Promise.resolve(list)
    }
    return await invoke<List>('create_list', { req })
  },

  updateList: async (id: number, updates: UpdateListRequest): Promise<void> => {
    if (!isTauri) {
      const index = mockLists.findIndex((l) => l.id === id)
      if (index !== -1) {
        mockLists[index] = { ...mockLists[index], ...updates, updated_at: new Date().toISOString() }
      }
      return Promise.resolve()
    }
    await invoke('update_list', { id, updates })
  },

  deleteList: async (id: number): Promise<void> => {
    if (!isTauri) {
      const index = mockLists.findIndex((l) => l.id === id)
      if (index !== -1 && !mockLists[index].is_default) {
        // 将该清单下的任务移到默认清单
        mockTasks.forEach((t) => {
          if (t.list_id === id) t.list_id = 1
        })
        mockLists.splice(index, 1)
      }
      return Promise.resolve()
    }
    await invoke('delete_list', { id })
  },

  // ===== 标签方法 =====

  getTags: async (): Promise<Tag[]> => {
    if (!isTauri) {
      return Promise.resolve([...mockTags])
    }
    return await invoke<Tag[]>('get_tags')
  },

  createTag: async (req: CreateTagRequest): Promise<Tag> => {
    if (!isTauri) {
      const tag: Tag = {
        id: nextTagId++,
        name: req.name,
        color: req.color,
        parent_id: req.parent_id,
        created_at: new Date().toISOString(),
      }
      mockTags.push(tag)
      return Promise.resolve(tag)
    }
    return await invoke<Tag>('create_tag', { req })
  },

  deleteTag: async (id: number): Promise<void> => {
    if (!isTauri) {
      const index = mockTags.findIndex((t) => t.id === id)
      if (index !== -1) {
        mockTags.splice(index, 1)
      }
      // 清除所有任务中该标签的关联
      Object.keys(mockTaskTags).forEach(taskId => {
        mockTaskTags[Number(taskId)] = mockTaskTags[Number(taskId)].filter(tid => tid !== id)
      })
      return Promise.resolve()
    }
    await invoke('delete_tag', { id })
  },

  addTagToTask: async (taskId: number, tagId: number): Promise<void> => {
    if (!isTauri) {
      if (!mockTaskTags[taskId]) mockTaskTags[taskId] = []
      if (!mockTaskTags[taskId].includes(tagId)) {
        mockTaskTags[taskId].push(tagId)
      }
      return Promise.resolve()
    }
    await invoke('add_tag_to_task', { taskId, tagId })
  },

  removeTagFromTask: async (taskId: number, tagId: number): Promise<void> => {
    if (!isTauri) {
      if (mockTaskTags[taskId]) {
        mockTaskTags[taskId] = mockTaskTags[taskId].filter(tid => tid !== tagId)
      }
      return Promise.resolve()
    }
    await invoke('remove_tag_from_task', { taskId, tagId })
  },

  // ===== 复制任务 =====

  duplicateTask: async (id: number): Promise<Task> => {
    if (!isTauri) {
      const source = mockTasks.find(t => t.id === id)
      if (!source) throw new Error('Task not found')
      const now = new Date().toISOString()
      const task: Task = {
        ...source,
        id: nextTaskId++,
        completed: false,
        archived: false,
        pinned: false,
        sort_order: Date.now(),
        created_at: now,
        updated_at: now,
      }
      mockTasks.unshift(task)
      // 复制标签关联
      if (mockTaskTags[id]) {
        mockTaskTags[task.id] = [...mockTaskTags[id]]
      }
      return Promise.resolve(task)
    }
    return await invoke<Task>('duplicate_task', { id })
  },

  // ===== 排序与完成 =====

  reorderTasks: async (items: ReorderItem[]): Promise<void> => {
    if (!isTauri) {
      items.forEach(item => {
        const idx = mockTasks.findIndex(t => t.id === item.id)
        if (idx !== -1) mockTasks[idx].sort_order = item.sort_order
      })
      return Promise.resolve()
    }
    await invoke('reorder_tasks', { items })
  },

  completeTask: async (id: number): Promise<CompleteResult> => {
    if (!isTauri) {
      const idx = mockTasks.findIndex(t => t.id === id)
      if (idx !== -1) {
        mockTasks[idx].completed = true
        const task = mockTasks[idx]
        if (task.repeat_rule && task.due_date) {
          const now = new Date().toISOString()
          const nextDue = new Date(task.due_date)
          if (task.repeat_rule === 'daily') nextDue.setDate(nextDue.getDate() + 1)
          else if (task.repeat_rule === 'weekly') nextDue.setDate(nextDue.getDate() + 7)
          else if (task.repeat_rule === 'monthly') nextDue.setDate(nextDue.getDate() + 30)
          const newTask: Task = {
            ...task,
            id: nextTaskId++,
            completed: false,
            due_date: nextDue.toISOString(),
            sort_order: Date.now(),
            created_at: now,
            updated_at: now,
          }
          mockTasks.unshift(newTask)
          return Promise.resolve({ new_task_id: newTask.id })
        }
      }
      return Promise.resolve({ new_task_id: null })
    }
    return await invoke<CompleteResult>('complete_task', { id })
  },

  // 枚举系统已安装字体（仅 Tauri 环境可用）
  listSystemFonts: async (): Promise<string[]> => {
    if (!isTauri) {
      return Promise.resolve([])
    }
    return await invoke<string[]>('list_system_fonts')
  },
}

/* ============ 习惯打卡（Habit）API ============ */

/**
 * 习惯相关 API：直接调用 Tauri command，配合本地 React state 使用。
 * 参数命名采用蛇形（与 Rust 端一致），由 Tauri 自动反序列化。
 */
export const habitApi = {
  /** 获取习惯列表（includeArchived=true 时返回包含已归档的全部习惯） */
  getHabits: (includeArchived?: boolean): Promise<Habit[]> =>
    invoke<Habit[]>('get_habits', { includeArchived: includeArchived ?? null }),

  /** 创建习惯，返回后端生成的完整 Habit（含 id） */
  createHabit: (req: CreateHabitRequest): Promise<Habit> =>
    invoke<Habit>('create_habit', { req }),

  /** 更新习惯字段（仅传入需要更新的字段） */
  updateHabit: (id: number, req: UpdateHabitRequest): Promise<Habit> =>
    invoke<Habit>('update_habit', { id, req }),

  /** 删除习惯（关联打卡记录因 ON DELETE CASCADE 自动清除） */
  deleteHabit: (id: number): Promise<void> =>
    invoke<void>('delete_habit', { id }),

  /** 归档/取消归档习惯 */
  archiveHabit: (id: number, archived: boolean): Promise<void> =>
    invoke<void>('archive_habit', { id, archived }),

  /** 获取某习惯的打卡记录（可按日期范围筛选） */
  getRecords: (habitId: number, startDate?: string, endDate?: string): Promise<HabitRecord[]> =>
    invoke<HabitRecord[]>('get_habit_records', {
      habitId,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    }),

  /** 插入或更新某天打卡记录（UPSERT），返回最新记录 */
  upsertRecord: (habitId: number, date: string, count: number, note?: string): Promise<HabitRecord> =>
    invoke<HabitRecord>('upsert_habit_record', { habitId, date, count, note: note ?? null }),

  /** 删除某天打卡记录（取消打卡） */
  deleteRecord: (habitId: number, date: string): Promise<void> =>
    invoke<void>('delete_habit_record', { habitId, date }),
}

/* ============ AI 流式对话 API ============ */

/**
 * 流式 AI 对话：监听后端 `llm-chat-chunk` / `llm-chat-done` 事件实现打字机效果。
 *
 * 后端 command: `llm_chat_stream(config, messages, skill)`
 *   - 逐 token 发送 `llm-chat-chunk` 事件（payload 为本次 delta 字符串）
 *   - 全部输出完成后发送 `llm-chat-done` 事件（payload 为完整内容字符串）
 *
 * @returns 一个取消函数（unlisten），调用后停止接收后续事件，用于"停止生成"。
 *
 * 注意：这里不 `await invoke(...)`，而是 fire-and-forget + `.catch`，
 *       这样取消函数能在生成完成前就返回，使"停止生成"按钮可用。
 */
export async function llmChatStream(
  config: LLMConfig,
  messages: ChatMessage[],
  skill: string | null,
  onChunk: (delta: string) => void,
  onDone: (full: string) => void,
  onError: (err: string) => void,
): Promise<() => void> {
  const unlistenChunk = await listen<string>('llm-chat-chunk', (e) => onChunk(e.payload))
  const unlistenDone = await listen<string>('llm-chat-done', (e) => {
    onDone(e.payload)
    unlistenChunk()
    unlistenDone()
  })

  // 触发流式命令；失败时清理监听并回调 onError（回退到非流式）
  invoke('llm_chat_stream', { config, messages, skill }).catch((err) => {
    unlistenChunk()
    unlistenDone()
    onError(String(err))
  })

  // 返回取消函数：随时可停止接收事件
  return () => {
    unlistenChunk()
    unlistenDone()
  }
}

/* ============ 数据导出/导入 API ============ */

/** 导入结果：后端 import_json command 的返回值 */
export interface ImportResult {
  lists_imported: number
  tasks_imported: number
  tags_imported: number
  habits_imported: number
  habit_records_imported: number
}

/**
 * 数据导出/导入 API：封装后端的 export_json / export_csv / export_markdown / import_json 命令。
 *
 * - 导出命令返回对应格式的字符串，由前端负责写入用户选择的文件。
 * - 导入命令接收 JSON 字符串和模式（merge 合并 / replace 替换），返回 ImportResult。
 */
export const dataApi = {
  /** 导出为 JSON 字符串 */
  exportJson: (): Promise<string> => invoke<string>('export_json'),

  /** 导出为 CSV 字符串 */
  exportCsv: (): Promise<string> => invoke<string>('export_csv'),

  /** 导出为 Markdown 字符串 */
  exportMarkdown: (): Promise<string> => invoke<string>('export_markdown'),

  /** 导入 JSON 数据（mode: merge 合并 / replace 替换） */
  importJson: (json: string, mode: 'merge' | 'replace'): Promise<ImportResult> =>
    invoke<ImportResult>('import_json', { json, mode }),
}
