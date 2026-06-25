import { useState, useEffect } from 'react'
import { format, subDays, startOfWeek, eachDayOfInterval, isSameDay, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { hexWithAlpha } from '../utils/priority'

/* ============ 类型定义 ============ */

export interface Habit {
  id: string
  name: string
  icon: string        // emoji
  color: string       // hex 颜色
  goal: number        // 每日目标次数（例如 5 杯水）
  unit?: string       // 单位，例如 "杯"、"次"
  createdAt: string
  records: Record<string, number>  // 日期字符串(YYYY-MM-DD) -> 打卡次数
}

export interface HabitViewProps {
  // 无需 props，习惯数据自包含于 localStorage
}

/* ============ 预设数据 ============ */

const PRESET_EMOJIS = ['💧', '🏃', '📖', '🧘', '💊', '🌅', '💪', '🥗']
const PRESET_COLORS = ['#378ADD', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B', '#10B981', '#06B6D4', '#6B7280']
const STORAGE_KEY = 'habits_data'
const BRAND_COLOR = '#378ADD'

/* ============ 工具函数 ============ */

/** 生成唯一 ID */
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 日期 -> YYYY-MM-DD */
function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** 获取某天的打卡次数（无记录返回 0） */
function getCount(habit: Habit, key: string): number {
  return habit.records[key] ?? 0
}

/** 本周（周一至周日）7 天 */
function getWeekDays(): Date[] {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  // subDays(weekStart, -6) 即 weekStart + 6 天 = 本周日
  return eachDayOfInterval({ start: weekStart, end: subDays(weekStart, -6) })
}

/** 判断是否为未来日期（eachDayOfInterval 产生的日期均为本地零点） */
function isFutureDay(day: Date): boolean {
  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return day.getTime() > todayMidnight.getTime()
}

/**
 * 连续打卡天数
 * 规则：从今天往回数连续达标的天数；若今天尚未达标，则从昨天开始计算（不打断已有记录）。
 */
function getStreak(habit: Habit): number {
  // 解析所有记录日期，筛选出已达标的日子
  const completedKeys = new Set<string>()
  for (const [key, count] of Object.entries(habit.records)) {
    if (count >= habit.goal) {
      const d = parseISO(key)
      if (!Number.isNaN(d.getTime())) {
        completedKeys.add(format(d, 'yyyy-MM-dd'))
      }
    }
  }

  let streak = 0
  let cursor = new Date()
  // 今天尚未达标时，从昨天开始计算，避免打断连续记录
  if (!completedKeys.has(format(cursor, 'yyyy-MM-dd'))) {
    cursor = subDays(cursor, 1)
  }
  for (let i = 0; i < 366; i++) {
    if (completedKeys.has(format(cursor, 'yyyy-MM-dd'))) {
      streak++
      cursor = subDays(cursor, 1)
    } else {
      break
    }
  }
  return streak
}

/* ============ 单元格组件 ============ */

interface DayCellProps {
  count: number
  goal: number
  color: string
  isFuture: boolean
  isToday: boolean
  size: string
  showCount?: boolean
}

/** 单日打卡格子：满=实心，部分=半透明描边，未打卡=灰色，未来=浅灰 */
function DayCell({ count, goal, color, isFuture, isToday, size, showCount = false }: DayCellProps) {
  const ratio = goal > 0 ? Math.min(count / goal, 1) : 0
  const todayRing = isToday ? 'ring-2 ring-blue-400' : ''

  if (isFuture) {
    return <div className={`${size} rounded-full bg-gray-100 ${todayRing}`} title="未来日期" />
  }
  if (ratio >= 1) {
    return (
      <div
        className={`${size} rounded-full flex items-center justify-center text-white text-xs font-semibold ${todayRing}`}
        style={{ backgroundColor: color }}
        title={`已完成 ${count}/${goal}`}
      >
        {showCount ? count : ''}
      </div>
    )
  }
  if (ratio > 0) {
    return (
      <div
        className={`${size} rounded-full flex items-center justify-center text-xs font-semibold ${todayRing}`}
        style={{
          backgroundColor: hexWithAlpha(color, 0.25),
          color,
          border: `1.5px solid ${hexWithAlpha(color, 0.5)}`,
        }}
        title={`进行中 ${count}/${goal}`}
      >
        {showCount ? count : ''}
      </div>
    )
  }
  return <div className={`${size} rounded-full bg-gray-100 ${todayRing}`} title="未打卡" />
}

/* ============ 新建习惯表单 ============ */

interface CreateHabitFormProps {
  name: string
  setName: (v: string) => void
  icon: string
  setIcon: (v: string) => void
  color: string
  setColor: (v: string) => void
  goal: number
  setGoal: (v: number) => void
  unit: string
  setUnit: (v: string) => void
  onSave: () => void
  onCancel: () => void
}

function CreateHabitForm(props: CreateHabitFormProps) {
  const { name, setName, icon, setIcon, color, setColor, goal, setGoal, unit, setUnit, onSave, onCancel } = props
  const canSave = name.trim().length > 0

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 animate-slide-in-top">
      <div className="space-y-4">
        {/* 名称 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">习惯名称</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSave) onSave() }}
            placeholder="例如：喝水、读书、跑步"
            autoFocus
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* 图标选择 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">图标</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_EMOJIS.map(em => (
              <button
                key={em}
                type="button"
                onClick={() => setIcon(em)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all ${
                  icon === em ? 'ring-2 ring-blue-400 bg-blue-50' : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        {/* 颜色选择 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">颜色</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-all flex items-center justify-center ${
                  color === c ? 'ring-2 ring-blue-400 scale-110' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              >
                {color === c && (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 目标 + 单位 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">每日目标</label>
            <input
              type="number"
              min={1}
              value={goal}
              onChange={e => setGoal(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">单位（可选）</label>
            <input
              type="text"
              value={unit}
              onChange={e => setUnit(e.target.value)}
              placeholder="例如：杯、次、分钟"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: BRAND_COLOR }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

/* ============ 习惯卡片 ============ */

interface HabitCardProps {
  habit: Habit
  expanded: boolean
  todayStr: string
  weekDays: Date[]
  today: Date
  onToggle: (id: string) => void
  onIncrement: (id: string) => void
  onDecrement: (id: string) => void
  onDelete: (id: string) => void
}

function HabitCard({ habit, expanded, todayStr, weekDays, today, onToggle, onIncrement, onDecrement, onDelete }: HabitCardProps) {
  const todayCount = getCount(habit, todayStr)
  const goal = habit.goal
  const pct = goal > 0 ? Math.min((todayCount / goal) * 100, 100) : 0
  const streak = getStreak(habit)
  const completed = todayCount >= goal

  return (
    <div
      className="bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-colors p-4 group cursor-pointer"
      onClick={() => onToggle(habit.id)}
      onContextMenu={e => { e.preventDefault(); onDelete(habit.id) }}
    >
      <div className="flex items-center gap-4">
        {/* 图标 */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
          style={{ backgroundColor: hexWithAlpha(habit.color, 0.15) }}
        >
          {habit.icon}
        </div>

        {/* 名称 + 今日进度 + 进度条 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-gray-900 truncate">{habit.name}</span>
            {streak > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0"
                style={{ backgroundColor: hexWithAlpha('#F59E0B', 0.15), color: '#F59E0B' }}
              >
                🔥 {streak}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <span>今日 {todayCount}/{goal}{habit.unit ? ` ${habit.unit}` : ''}</span>
            {completed && <span className="text-xs text-green-500 font-medium">已完成</span>}
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: habit.color }}
            />
          </div>
        </div>

        {/* 7 天迷你视图 */}
        <div className="grid grid-cols-7 gap-1 flex-shrink-0">
          {weekDays.map(day => {
            const key = dateKey(day)
            return (
              <DayCell
                key={key}
                count={getCount(habit, key)}
                goal={goal}
                color={habit.color}
                isFuture={isFutureDay(day)}
                isToday={isSameDay(day, today)}
                size="w-7 h-7"
              />
            )
          })}
        </div>

        {/* 今日 +1 */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onIncrement(habit.id) }}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:opacity-90 transition-opacity flex-shrink-0"
          style={{ backgroundColor: habit.color }}
          title="今日 +1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {/* 删除（悬停显示） */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onDelete(habit.id) }}
          className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
          title="删除习惯"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 animate-slide-in-top">
          {/* 7 天日历视图 */}
          <div className="grid grid-cols-7 gap-2 mb-4">
            {weekDays.map(day => {
              const key = dateKey(day)
              const count = getCount(habit, key)
              return (
                <div key={key} className="flex flex-col items-center gap-1.5">
                  <span className="text-xs text-gray-400">{format(day, 'EEEEE', { locale: zhCN })}</span>
                  <DayCell
                    count={count}
                    goal={goal}
                    color={habit.color}
                    isFuture={isFutureDay(day)}
                    isToday={isSameDay(day, today)}
                    size="w-9 h-9"
                    showCount
                  />
                  <span className={`text-xs ${isSameDay(day, today) ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
                    {format(day, 'd')}
                  </span>
                </div>
              )
            })}
          </div>

          {/* 连续天数 + 今日快捷操作 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ backgroundColor: hexWithAlpha('#F59E0B', 0.15), color: '#F59E0B' }}
              >
                🔥 {streak} 天连续
              </span>
              <span className="text-sm text-gray-500">
                今日 {todayCount}/{goal}{habit.unit ? ` ${habit.unit}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onDecrement(habit.id) }}
                className="w-8 h-8 rounded-full flex items-center justify-center border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                title="今日 -1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                </svg>
              </button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onIncrement(habit.id) }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: habit.color }}
                title="今日 +1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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
        ) : (
          <div className="space-y-3">
            {habits.map(habit => (
              <HabitCard
                key={habit.id}
                habit={habit}
                expanded={expandedId === habit.id}
                todayStr={todayStr}
                weekDays={weekDays}
                today={today}
                onToggle={toggleExpand}
                onIncrement={increment}
                onDecrement={decrement}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
