import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Habit, HabitViewProps, PRESET_EMOJIS, PRESET_COLORS, STORAGE_KEY, BRAND_COLOR, genId, dateKey, getWeekDays } from './constants'
import { HabitCard } from './HabitCard'
import { HabitEditor } from './HabitEditor'
import { CreateHabitForm } from './CreateHabitForm'

/* ============ 空状态 ============ */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-3xl mb-4">
        🎯
      </div>
      <p className="text-gray-500">还没有习惯，点击新建开始打卡吧！</p>
    </div>
  )
}

/* ============ 主组件 ============ */

export function HabitView(_props: HabitViewProps) {
  const [habits, setHabits] = useState<Habit[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw) as Habit[]
    } catch (e) {
      console.error('加载习惯数据失败:', e)
    }
    return []
  })
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // 编辑模式
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editGoal, setEditGoal] = useState(1)
  const [editUnit, setEditUnit] = useState('')

  // 归档过滤
  const [showArchived, setShowArchived] = useState(false)

  // 新建表单状态
  const [formName, setFormName] = useState('')
  const [formIcon, setFormIcon] = useState(PRESET_EMOJIS[0])
  const [formColor, setFormColor] = useState(PRESET_COLORS[0])
  const [formGoal, setFormGoal] = useState(1)
  const [formUnit, setFormUnit] = useState('')

  // 持久化
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(habits))
    } catch (e) {
      console.error('保存习惯数据失败:', e)
    }
  }, [habits])

  const today = new Date()
  const weekDays = getWeekDays()
  const todayStr = dateKey(today)

  // 过滤：默认隐藏已归档
  const visibleHabits = showArchived ? habits : habits.filter(h => !h.archived)
  const archivedCount = habits.filter(h => !!h.archived).length

  function resetForm() {
    setFormName('')
    setFormIcon(PRESET_EMOJIS[0])
    setFormColor(PRESET_COLORS[0])
    setFormGoal(1)
    setFormUnit('')
  }

  function handleCreate() {
    const name = formName.trim()
    if (!name) return
    const goal = Math.max(1, Math.floor(Number(formGoal)) || 1)
    const newHabit: Habit = {
      id: genId(),
      name,
      icon: formIcon,
      color: formColor,
      goal,
      unit: formUnit.trim() || undefined,
      createdAt: new Date().toISOString(),
      records: {},
    }
    setHabits(prev => [...prev, newHabit])
    resetForm()
    setShowCreateForm(false)
  }

  function handleCancel() {
    resetForm()
    setShowCreateForm(false)
  }

  function toggleDay(habitId: string, dateKeyStr: string) {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h
      const cur = h.records[dateKeyStr] ?? 0
      if (cur <= 0) {
        return { ...h, records: { ...h.records, [dateKeyStr]: h.goal } }
      }
      if (cur >= h.goal) {
        return { ...h, records: { ...h.records, [dateKeyStr]: 0 } }
      }
      return { ...h, records: { ...h.records, [dateKeyStr]: h.goal } }
    }))
  }

  function increment(id: string) {
    setHabits(prev => prev.map(h => {
      if (h.id !== id) return h
      const cur = h.records[todayStr] ?? 0
      return { ...h, records: { ...h.records, [todayStr]: cur + 1 } }
    }))
  }

  function decrement(id: string) {
    setHabits(prev => prev.map(h => {
      if (h.id !== id) return h
      const cur = h.records[todayStr] ?? 0
      if (cur <= 0) return h
      return { ...h, records: { ...h.records, [todayStr]: cur - 1 } }
    }))
  }

  function handleDelete(id: string) {
    if (!window.confirm('确定删除这个习惯吗？所有打卡记录将被清除。')) return
    setHabits(prev => prev.filter(h => h.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id))
  }

  // ---- 编辑 ----
  function startEditing(habit: Habit) {
    setEditingId(habit.id)
    setEditName(habit.name)
    setEditIcon(habit.icon)
    setEditColor(habit.color)
    setEditGoal(habit.goal)
    setEditUnit(habit.unit ?? '')
  }

  function saveEdit() {
    if (!editingId) return
    const name = editName.trim()
    if (!name) return
    setHabits(prev => prev.map(h => {
      if (h.id !== editingId) return h
      return {
        ...h,
        name,
        icon: editIcon,
        color: editColor,
        goal: Math.max(1, Math.floor(editGoal) || 1),
        unit: editUnit.trim() || undefined,
      }
    }))
    setEditingId(null)
  }

  // ---- 归档 ----
  function toggleArchive(habitId: string) {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h
      return { ...h, archived: !h.archived }
    }))
    if (expandedId === habitId) setExpandedId(null)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">习惯打卡</h2>
            <p className="text-sm text-gray-500 mt-1">{format(today, 'yyyy年M月d日 EEEE', { locale: zhCN })}</p>
          </div>
          <button
            type="button"
            onClick={() => { resetForm(); setShowCreateForm(true) }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors hover:opacity-90"
            style={{ backgroundColor: BRAND_COLOR }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建习惯
          </button>
        </div>

        {/* 新建表单 */}
        {showCreateForm && (
          <CreateHabitForm
            name={formName}
            setName={setFormName}
            icon={formIcon}
            setIcon={setFormIcon}
            color={formColor}
            setColor={setFormColor}
            goal={formGoal}
            setGoal={setFormGoal}
            unit={formUnit}
            setUnit={setFormUnit}
            onSave={handleCreate}
            onCancel={handleCancel}
          />
        )}

        {/* 习惯列表 / 空状态 */}
        {habits.length === 0 && !showCreateForm ? (
          <EmptyState />
        ) : visibleHabits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-3xl mb-4">
              📦
            </div>
            <p className="text-gray-500">没有活跃的习惯</p>
            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived(true)}
                className="mt-3 text-sm text-blue-500 hover:text-blue-600"
              >
                查看 {archivedCount} 个已归档习惯
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {visibleHabits.map(habit => (
                <HabitCard
                  key={habit.id}
                  habit={habit}
                  expanded={expandedId === habit.id}
                  todayStr={todayStr}
                  weekDays={weekDays}
                  today={today}
                  onToggle={toggleExpand}
                  onIncrement={() => increment(habit.id)}
                  onDecrement={() => decrement(habit.id)}
                  onDelete={handleDelete}
                  onDayClick={toggleDay}
                  onEdit={startEditing}
                  onArchive={toggleArchive}
                />
              ))}
            </div>
            {/* 归档切换 */}
            {archivedCount > 0 && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setShowArchived(!showArchived)}
                  className={`text-sm ${showArchived ? 'text-blue-500 hover:text-blue-600' : 'text-gray-400 hover:text-gray-500'} transition-colors`}
                >
                  {showArchived ? '隐藏已归档' : `显示已归档 (${archivedCount})`}
                </button>
              </div>
            )}
          </>
        )}

        {/* ---- 编辑弹窗 ---- */}
        {editingId && (() => {
          const habit = habits.find(h => h.id === editingId)
          if (!habit) return null
          return (
            <HabitEditor
              name={editName}
              setName={setEditName}
              icon={editIcon}
              setIcon={setEditIcon}
              color={editColor}
              setColor={setEditColor}
              goal={editGoal}
              setGoal={setEditGoal}
              unit={editUnit}
              setUnit={setEditUnit}
              onSave={saveEdit}
              onCancel={() => setEditingId(null)}
            />
          )
        })()}
      </div>
    </div>
  )
}
