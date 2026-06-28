import { useState, useEffect } from 'react'
import { format, isSameDay } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { hexWithAlpha } from '../../utils/priority'
import { Habit, dateKey, getCount, getStreak, isFutureDay } from './constants'
import { DayCell } from './DayCell'
import { HabitFocusTimer } from './HabitFocusTimer'

/* ============ 习惯卡片 ============ */

export interface HabitCardProps {
  habit: Habit
  expanded: boolean
  todayStr: string
  weekDays: Date[]
  today: Date
  onToggle: (id: string) => void
  onIncrement: (id: string) => void
  onDecrement: (id: string) => void
  onDelete: (id: string) => void
  onDayClick?: (habitId: string, dateKeyStr: string) => void
  onEdit?: (habit: Habit) => void
  onArchive?: (habitId: string) => void
}

/** 单个习惯卡片：展示 + 打卡 + 7 天日历，包含右键菜单与专注计时器 */
export function HabitCard({ habit, expanded, todayStr, weekDays, today, onToggle, onIncrement, onDecrement, onDelete, onDayClick, onEdit, onArchive }: HabitCardProps) {
  const todayCount = getCount(habit, todayStr)
  const goal = habit.goal
  const pct = goal > 0 ? Math.min((todayCount / goal) * 100, 100) : 0
  const streak = getStreak(habit)
  const completed = todayCount >= goal

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  // 专注计时器
  const [focusTimer, setFocusTimer] = useState<{ seconds: number; targetSeconds: number } | null>(null)
  const [focusInterval, setFocusInterval] = useState<ReturnType<typeof setInterval> | null>(null)

  function closeContextMenu() {
    setContextMenu(null)
  }

  function startFocus() {
    setFocusTimer({ seconds: 0, targetSeconds: 25 * 60 })
  }

  function stopFocus() {
    setFocusTimer(null)
    if (focusInterval) { clearInterval(focusInterval); setFocusInterval(null) }
  }

  // 右键菜单：点击外部 / ESC 关闭
  useEffect(() => {
    if (!contextMenu) return
    function onDown() { closeContextMenu() }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeContextMenu() }
    document.addEventListener('click', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  // 专注计时器：每秒 +1
  useEffect(() => {
    if (focusTimer) {
      const id = setInterval(() => {
        setFocusTimer(prev => {
          if (!prev) return null
          const next = prev.seconds + 1
          if (next >= prev.targetSeconds) {
            clearInterval(id)
            return null
          }
          return { ...prev, seconds: next }
        })
      }, 1000)
      setFocusInterval(id)
      return () => clearInterval(id)
    }
    return undefined
  }, [focusTimer !== null])

  return (
    <>
      <div
        className="bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-colors p-4 group cursor-pointer"
        onClick={() => onToggle(habit.id)}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }) }}
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
              const handleClick = onDayClick ? () => onDayClick(habit.id, key) : undefined
              return (
                <DayCell
                  key={key}
                  count={getCount(habit, key)}
                  goal={goal}
                  color={habit.color}
                  isFuture={isFutureDay(day)}
                  isToday={isSameDay(day, today)}
                  size="w-7 h-7"
                  onClick={handleClick}
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
                const handleDayClick = onDayClick ? () => onDayClick(habit.id, key) : undefined
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
                      onClick={handleDayClick}
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

      {/* ---- 右键菜单 ---- */}
      {contextMenu && (
        <div className="fixed inset-0 z-50" onClick={closeContextMenu}>
          <div
            className="absolute bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 min-w-[180px]"
            style={{ left: Math.min(contextMenu.x, window.innerWidth - 190), top: Math.min(contextMenu.y, window.innerHeight - 200) }}
          >
            {/* 编辑 */}
            <button
              type="button"
              onClick={() => { onEdit?.(habit); closeContextMenu() }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>编辑</span>
            </button>
            {/* 开始专注 */}
            <button
              type="button"
              onClick={() => { startFocus(); closeContextMenu() }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <span>开始专注</span>
            </button>
            {/* 归档 */}
            <button
              type="button"
              onClick={() => { onArchive?.(habit.id); closeContextMenu() }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <span>{habit.archived ? '取消归档' : '归档'}</span>
            </button>
            {/* 分割线 */}
            <div className="border-t border-gray-100 my-1" />
            {/* 删除 */}
            <button
              type="button"
              onClick={() => { onDelete(habit.id); closeContextMenu() }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
            >
              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>删除</span>
            </button>
          </div>
        </div>
      )}

      {/* ---- 专注计时器 ---- */}
      {focusTimer && (
        <HabitFocusTimer
          habit={habit}
          seconds={focusTimer.seconds}
          targetSeconds={focusTimer.targetSeconds}
          onSetTarget={(t) => setFocusTimer({ seconds: 0, targetSeconds: t })}
          onStop={stopFocus}
        />
      )}
    </>
  )
}
