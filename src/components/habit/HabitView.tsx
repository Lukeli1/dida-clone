import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { habitApi } from '../../api'
import { Habit, HabitViewProps, PRESET_EMOJIS, PRESET_COLORS, BRAND_COLOR, dateKey, getWeekDays } from './constants'
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

/* ============ 加载状态 ============ */

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div
        className="w-8 h-8 rounded-full animate-spin"
        style={{ border: '3px solid #E5E7EB', borderTopColor: BRAND_COLOR }}
      />
    </div>
  )
}

/* ============ 主组件 ============ */

export function HabitView(_props: HabitViewProps) {
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // 编辑模式
  const [editingId, setEditingId] = useState<number | null>(null)
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

  const today = new Date()
  const weekDays = getWeekDays()
  const todayStr = dateKey(today)

  // ===== 异步加载习惯 + 打卡记录 =====
  const loadHabits = useCallback(async () => {
    try {
      setLoading(true)
      // 始终加载全部（含已归档），客户端过滤以保持 archivedCount 计数
      const list = await habitApi.getHabits(true)
      // 为每个习惯加载全部打卡记录（getStreak 最多回溯 366 天）
      const withRecords = await Promise.all(
        list.map(async h => {
          const records = await habitApi.getRecords(h.id)
          const recordMap: Record<string, number> = {}
          for (const r of records) {
            recordMap[r.date] = r.count
          }
          return { ...h, records: recordMap } as Habit
        }),
      )
      setHabits(withRecords)
    } catch (e) {
      console.error('加载习惯数据失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHabits()
  }, [loadHabits])

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

  // ===== 创建习惯 =====
  async function handleCreate() {
    const name = formName.trim()
    if (!name) return
    const target_count = Math.max(1, Math.floor(Number(formGoal)) || 1)
    try {
      const created = await habitApi.createHabit({
        name,
        icon: formIcon,
        color: formColor,
        target_count,
        unit: formUnit.trim() || undefined,
      })
      // 新习惯无打卡记录，records 初始化为空
      setHabits(prev => [...prev, { ...created, records: {} }])
      resetForm()
      setShowCreateForm(false)
    } catch (e) {
      console.error('创建习惯失败:', e)
    }
  }

  function handleCancel() {
    resetForm()
    setShowCreateForm(false)
  }

  function handleDelete(id: number) {
    if (!window.confirm('确定删除这个习惯吗？所有打卡记录将被清除。')) return
    habitApi
      .deleteHabit(id)
      .then(() => {
        setHabits(prev => prev.filter(h => h.id !== id))
        if (expandedId === id) setExpandedId(null)
      })
      .catch(e => console.error('删除习惯失败:', e))
  }

  function toggleExpand(id: number) {
    setExpandedId(prev => (prev === id ? null : id))
  }

  // ===== 编辑 =====
  function startEditing(habit: Habit) {
    setEditingId(habit.id)
    setEditName(habit.name)
    setEditIcon(habit.icon ?? '')
    setEditColor(habit.color ?? PRESET_COLORS[0])
    setEditGoal(habit.target_count)
    setEditUnit(habit.unit ?? '')
  }

  async function saveEdit() {
    if (!editingId) return
    const name = editName.trim()
    if (!name) return
    try {
      const updated = await habitApi.updateHabit(editingId, {
        name,
        icon: editIcon,
        color: editColor,
        target_count: Math.max(1, Math.floor(editGoal) || 1),
        unit: editUnit.trim() || undefined,
      })
      setHabits(prev => prev.map(h => (h.id === editingId ? { ...h, ...updated } : h)))
      setEditingId(null)
    } catch (e) {
      console.error('更新习惯失败:', e)
    }
  }

  // ===== 归档 =====
  async function toggleArchive(habitId: number) {
    const habit = habits.find(h => h.id === habitId)
    if (!habit) return
    const newArchived = !habit.archived
    try {
      await habitApi.archiveHabit(habitId, newArchived)
      setHabits(prev => prev.map(h => (h.id === habitId ? { ...h, archived: newArchived } : h)))
      if (expandedId === habitId) setExpandedId(null)
    } catch (e) {
      console.error('归档习惯失败:', e)
    }
  }

  // ===== 打卡记录变更：由 HabitCard 在 habitApi 返回后回调，更新本地 records 映射 =====
  function handleRecordChange(habitId: number, date: string, count: number | null) {
    setHabits(prev =>
      prev.map(h => {
        if (h.id !== habitId) return h
        const newRecords = { ...h.records }
        if (count === null) {
          delete newRecords[date]
        } else {
          newRecords[date] = count
        }
        return { ...h, records: newRecords }
      }),
    )
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

        {/* 加载中 */}
        {loading ? (
          <LoadingState />
        ) : habits.length === 0 && !showCreateForm ? (
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
                  onDelete={handleDelete}
                  onEdit={startEditing}
                  onArchive={toggleArchive}
                  onRecordChange={handleRecordChange}
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
