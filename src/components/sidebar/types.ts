import type { List, Tag } from '../../types'

export type ViewType = 'tasks' | 'today' | 'calendar' | 'stats' | 'settings' | 'ai' | 'archived' | 'quadrant' | 'pomodoro' | 'habit' | 'template' | 'goals'

export const PRESET_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444',
  '#F59E0B', '#10B981', '#06B6D4', '#6B7280',
]

export interface SidebarProps {
  lists: List[]
  tags: Tag[]
  selectedListId: number | null
  selectedTagId: number | null
  currentView: ViewType
  onSelectList: (id: number | null) => void
  onSelectTag: (id: number | null) => void
  onViewChange: (view: ViewType) => void
  onCreateList: (name: string, color?: string) => void
  onUpdateList: (id: number, updates: { name?: string; color?: string }) => void
  onDeleteList: (id: number) => void
  onCreateTag: (name: string, color?: string, parentId?: number | null) => void
  onDeleteTag: (id: number) => void
  taskCounts: Record<number, number>
  todayCount: number
  archivedCount: number
}

export interface ViewSwitcherProps {
  currentView: ViewType
  selectedListId: number | null
  onViewChange: (view: ViewType) => void
  onSelectList: (id: number | null) => void
  onSelectTag: (id: number | null) => void
  totalTasks: number
  todayCount: number
  archivedCount: number
}

export interface ListSectionProps {
  lists: List[]
  selectedListId: number | null
  currentView: ViewType
  onSelectList: (id: number | null) => void
  onViewChange: (view: ViewType) => void
  onCreateList: (name: string, color?: string) => void
  onUpdateList: (id: number, updates: { name?: string; color?: string }) => void
  onDeleteList: (id: number) => void
  taskCounts: Record<number, number>
}

export interface TagSectionProps {
  tags: Tag[]
  selectedTagId: number | null
  onSelectTag: (id: number | null) => void
  onSelectList: (id: number | null) => void
  onViewChange: (view: ViewType) => void
  onCreateTag: (name: string, color?: string, parentId?: number | null) => void
  onDeleteTag: (id: number) => void
}

export interface SidebarFooterProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
}
