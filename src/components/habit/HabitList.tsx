import { Habit } from './constants'
import { HabitCard } from './HabitCard'

/* ============ 空状态 ============ */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-3xl mb-4">
        🎯
      </div>
      <p className="text-[var(--color-text-secondary)]">还没有习惯，点击新建开始打卡吧！</p>
    </div>
  )
}

/* ============ 加载状态 ============ */

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full animate-spin border-[3px] border-[var(--color-border)] border-t-[var(--color-accent)]" />
    </div>
  )
}

/* ============ 没有活跃习惯状态 ============ */

function NoActiveState({ archivedCount, onShowArchived }: { archivedCount: number; onShowArchived: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-3xl mb-4">
        📦
      </div>
      <p className="text-[var(--color-text-secondary)]">没有活跃的习惯</p>
      {archivedCount > 0 && (
        <button
          type="button"
          onClick={onShowArchived}
          className="mt-3 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
        >
          查看 {archivedCount} 个已归档习惯
        </button>
      )}
    </div>
  )
}

/* ============ 习惯列表 ============ */

export interface HabitListProps {
  loading: boolean
  /** 全部习惯（含已归档），用于判断空状态与归档计数 */
  habits: Habit[]
  /** 过滤后的可见习惯 */
  visibleHabits: Habit[]
  /** 是否显示新建表单（影响空状态判断） */
  showCreateForm: boolean
  expandedId: number | null
  todayStr: string
  weekDays: Date[]
  today: Date
  showArchived: boolean
  archivedCount: number
  onToggle: (id: number) => void
  onDelete: (id: number) => void
  onEdit: (habit: Habit) => void
  onArchive: (habitId: number) => void
  onRecordChange: (habitId: number, date: string, count: number | null) => void
  onToggleArchived: () => void
  onShowArchived: () => void
}

/** 习惯列表：加载 / 空 / 无活跃 / 卡片列表 + 归档切换 */
export function HabitList(props: HabitListProps) {
  const {
    loading,
    habits,
    visibleHabits,
    showCreateForm,
    expandedId,
    todayStr,
    weekDays,
    today,
    showArchived,
    archivedCount,
    onToggle,
    onDelete,
    onEdit,
    onArchive,
    onRecordChange,
    onToggleArchived,
    onShowArchived,
  } = props

  // 加载中
  if (loading) return <LoadingState />

  // 没有任何习惯且未展开新建表单
  if (habits.length === 0 && !showCreateForm) return <EmptyState />

  // 有习惯但当前无可显示项（全部已归档）
  if (visibleHabits.length === 0) {
    return <NoActiveState archivedCount={archivedCount} onShowArchived={onShowArchived} />
  }

  // 习惯卡片列表 + 归档切换
  return (
    <>
      <div className="space-y-3">
        {visibleHabits.map((habit) => (
          <HabitCard
            key={habit.id}
            habit={habit}
            expanded={expandedId === habit.id}
            todayStr={todayStr}
            weekDays={weekDays}
            today={today}
            onToggle={onToggle}
            onDelete={onDelete}
            onEdit={onEdit}
            onArchive={onArchive}
            onRecordChange={onRecordChange}
          />
        ))}
      </div>
      {/* 归档切换 */}
      {archivedCount > 0 && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onToggleArchived}
            className={`text-sm transition-colors ${showArchived ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]'}`}
          >
            {showArchived ? '隐藏已归档' : `显示已归档 (${archivedCount})`}
          </button>
        </div>
      )}
    </>
  )
}
