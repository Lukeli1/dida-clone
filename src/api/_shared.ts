import { invoke } from '@tauri-apps/api/core'
import type { Task, List, Tag } from '../types'

export { invoke }

// 桌面应用默认在 Tauri 环境中，不再依赖 window.__TAURI__ 检测
export const isTauri = true

// ===== Mock 数据（仅在非 Tauri 环境下使用，当前 isTauri 恒为 true）=====
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

// 可变计数器（使用对象以支持跨模块共享修改）
const mockCounters = {
  nextTaskId: 2,
  nextListId: 2,
  nextTagId: 4,
}

export { mockTasks, mockLists, mockTags, mockTaskTags, mockCounters }
