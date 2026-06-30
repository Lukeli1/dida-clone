import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { habitApi } from '../../api'
import { useUIStore } from '../../stores/uiStore'
import { Habit, HabitViewProps, PRESET_EMOJIS, PRESET_COLORS, dateKey, getWeekDays } from './constants'
import { HabitEditor } from './HabitEditor'
import { CreateHabitForm } from './CreateHabitForm'
import { HabitList } from './HabitList'
import { useConfirm } from '../common/ConfirmDialog'
import { useToast } from '../Toast'

/** 习惯视图：视图容器 + 状态管理 */
export function HabitView(_props: HabitViewProps) {
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editGoal, setEditGoal] = useState(1)
  const [editUnit, setEditUnit] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [formName, setFormName] = useState('')
  const [formIcon, setFormIcon] = useState(PRESET_EMOJIS[0])
  const [formColor, setFormColor] = useState(PRESET_COLORS[0])
  const [formGoal, setFormGoal] = useState(1)
  const [formUnit, setFormUnit] = useState('')

  const confirm = useConfirm()
  const toast = useToast()
  // 次要数据（习惯/模板）是否已就绪：未就绪时显示局部 loading，避免渲染空状态
  const secondaryDataLoaded = useUIStore(s => s.secondaryDataLoaded)
  const today = new Date()
  const weekDays = getWeekDays()
  const todayStr = dateKey(today)

  const loadHabits = useCallback(async () => {
    try {
      setLoading(true)
      // 始终加载全部（含已归档），客户端过滤以保持 archivedCount 计数
      const list = await habitApi.getHabits(true)
      const withRecords = await Promise.all(
        list.map(async h => {
          const records = await habitApi.getRecords(h.id)
          const recordMap: Record<string, number> = {}
          for (const r of records) recordMap[r.date] = r.count
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

  useEffect(() => { loadHabits() }, [loadHabits])

  const visibleHabits = showArchived ? habits : habits.filter(h => !h.archived)
  const archivedCount = habits.filter(h => !!h.archived).length

  function resetForm() {
    setFormName(''); setFormIcon(PRESET_EMOJIS[0]); setFormColor(PRESET_COLORS[0]); setFormGoal(1); setFormUnit('')
  }

  async function handleCreate() {
    const name = formName.trim()
    if (!name) return
    const target_count = Math.max(1, Math.floor(Number(formGoal)) || 1)
    try {
      const created = await habitApi.createHabit({
        name, icon: formIcon, color: formColor, target_count, unit: formUnit.trim() || undefined,
      })
      setHabits(prev => [...prev, { ...created, records: {} }])
      resetForm()
      setShowCreateForm(false)
      toast.success('习惯创建成功')
    } catch (e) {
      console.error('创建习惯失败:', e)
      toast.error('操作失败，请重试')
    }
  }

  function handleCancel() { resetForm(); setShowCreateForm(false) }

  async function handleDelete(id: number) {
    const ok = await confirm({ title: '删除习惯', message: '确定删除这个习惯吗？所有打卡记录将被清除。', danger: true, confirmText: '删除', cancelText: '取消' })
    if (!ok) return
    try {
      await habitApi.deleteHabit(id)
      setHabits(prev => prev.filter(h => h.id !== id))
      if (expandedId === id) setExpandedId(null)
      toast.success('习惯已删除')
    } catch (e) {
      console.error('删除习惯失败:', e)
      toast.error('操作失败，请重试')
    }
  }

  function toggleExpand(id: number) { setExpandedId(prev => (prev === id ? null : id)) }

  function startEditing(habit: Habit) {
    setEditingId(habit.id); setEditName(habit.name); setEditIcon(habit.icon ?? '')
    setEditColor(habit.color ?? PRESET_COLORS[0]); setEditGoal(habit.target_count); setEditUnit(habit.unit ?? '')
  }

  async function saveEdit() {
    if (!editingId) return
    const name = editName.trim()
    if (!name) return
    try {
      const updated = await habitApi.updateHabit(editingId, {
        name, icon: editIcon, color: editColor,
        target_count: Math.max(1, Math.floor(editGoal) || 1), unit: editUnit.trim() || undefined,
      })
      setHabits(prev => prev.map(h => (h.id === editingId ? { ...h, ...updated } : h)))
      setEditingId(null)
    } catch (e) {
      console.error('更新习惯失败:', e)
      toast.error('操作失败，请重试')
    }
  }

  async function toggleArchive(habitId: number) {
    const habit = habits.find(h => h.id === habitId)
    if (!habit) return
    const newArchived = !habit.archived
    try {
      await habitApi.archiveHabit(habitId, newArchived)
      setHabits(prev => prev.map(h => (h.id === habitId ? { ...h, archived: newArchived } : h)))
      if (expandedId === habitId) setExpandedId(null)
      toast.success(newArchived ? '习惯已归档' : '习惯已恢复')
    } catch (e) {
      console.error('归档习惯失败:', e)
      toast.error('操作失败，请重试')
    }
  }

  function handleRecordChange(habitId: number, date: string, count: number | null) {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h
      const newRecords = { ...h.records }
      if (count === null) delete newRecords[date]
      else newRecords[date] = count
      return { ...h, records: newRecords }
    }))
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-bg-secondary)] p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">习惯打卡</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{format(today, 'yyyy年M月d日 EEEE', { locale: zhCN })}</p>
          </div>
          <button type="button" onClick={() => { resetForm(); setShowCreateForm(true) }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg transition-colors hover:opacity-90">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建习惯
          </button>
        </div>

        {showCreateForm && (
          <CreateHabitForm
            name={formName} setName={setFormName} icon={formIcon} setIcon={setFormIcon}
            color={formColor} setColor={setFormColor} goal={formGoal} setGoal={setFormGoal}
            unit={formUnit} setUnit={setFormUnit} onSave={handleCreate} onCancel={handleCancel}
          />
        )}

        <HabitList
          loading={loading || !secondaryDataLoaded} habits={habits} visibleHabits={visibleHabits}
          showCreateForm={showCreateForm} expandedId={expandedId} todayStr={todayStr}
          weekDays={weekDays} today={today} showArchived={showArchived} archivedCount={archivedCount}
          onToggle={toggleExpand} onDelete={handleDelete} onEdit={startEditing}
          onArchive={toggleArchive} onRecordChange={handleRecordChange}
          onToggleArchived={() => setShowArchived(!showArchived)} onShowArchived={() => setShowArchived(true)}
        />

        {editingId && (() => {
          const habit = habits.find(h => h.id === editingId)
          if (!habit) return null
          return (
            <HabitEditor
              name={editName} setName={setEditName} icon={editIcon} setIcon={setEditIcon}
              color={editColor} setColor={setEditColor} goal={editGoal} setGoal={setEditGoal}
              unit={editUnit} setUnit={setEditUnit} onSave={saveEdit} onCancel={() => setEditingId(null)}
            />
          )
        })()}
      </div>
    </div>
  )
}
