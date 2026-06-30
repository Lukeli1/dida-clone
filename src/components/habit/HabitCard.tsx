import { useState, useEffect, useRef } from 'react'
import { hexWithAlpha } from '../../utils/priority'
import { habitApi } from '../../api'
import { Habit, getCount } from './constants'
import { HabitStats } from './HabitStats'
import { HabitActions } from './HabitActions'
import { HabitCalendar } from './HabitCalendar'

/* ============ 习惯卡片 ============ */

export interface HabitCardProps {
  habit: Habit
  expanded: boolean
  todayStr: string
  weekDays: Date[]
  today: Date
  onToggle: (id: number) => void
  onDelete: (id: number) => void
  onEdit?: (habit: Habit) => void
  onArchive?: (habitId: number) => void
  /**
   * 打卡记录变更回调：count 为新值，null 表示该日记录已删除。
   * 由 HabitCard 在 habitApi.upsertRecord / deleteRecord 返回后调用，
   * 父组件据此更新本地 records 映射。
   */
  onRecordChange?: (habitId: number, date: string, count: number | null) => void
}

/** 单个习惯卡片：展示 + 打卡 + 7 天日历，包含右键菜单与专注计时器 */
export function HabitCard({ habit, expanded, todayStr, weekDays, today, onToggle, onDelete, onEdit, onArchive, onRecordChange }: HabitCardProps) {
  const goal = habit.target_count
  // 兼容后端可选字段：color / icon 缺省时回退默认值，保持 UI 不变
  const color = habit.color ?? '#6B7280'
  const icon = habit.icon ?? '🎯'

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  // 打卡操作进行中标志：避免并发点击导致计数错乱（等待 API 返回后再更新本地状态）
  const busyRef = useRef(false)

  // 历史日历：展开详情中可切换显示的月历组件
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  function closeContextMenu() {
    setContextMenu(null)
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

  /* ---- 打卡操作：直接调用 habitApi，等待返回后通过 onRecordChange 更新本地状态 ---- */

  // 今日 +1
  async function handleIncrement(e: React.MouseEvent) {
    e.stopPropagation()
    if (busyRef.current) return
    busyRef.current = true
    try {
      const cur = getCount(habit, todayStr)
      const rec = await habitApi.upsertRecord(habit.id, todayStr, cur + 1)
      onRecordChange?.(habit.id, todayStr, rec.count)
    } catch (err) {
      console.error('增加打卡失败:', err)
    } finally {
      busyRef.current = false
    }
  }

  // 今日 -1
  async function handleDecrement(e: React.MouseEvent) {
    e.stopPropagation()
    if (busyRef.current) return
    busyRef.current = true
    try {
      const cur = getCount(habit, todayStr)
      if (cur <= 0) return
      const next = cur - 1
      if (next <= 0) {
        await habitApi.deleteRecord(habit.id, todayStr)
        onRecordChange?.(habit.id, todayStr, null)
      } else {
        const rec = await habitApi.upsertRecord(habit.id, todayStr, next)
        onRecordChange?.(habit.id, todayStr, rec.count)
      }
    } catch (err) {
      console.error('减少打卡失败:', err)
    } finally {
      busyRef.current = false
    }
  }

  // 某天格子点击：在 0 / 目标值 之间切换（与原 toggleDay 逻辑一致）
  async function handleDayClick(dateKeyStr: string, isFuture: boolean) {
    if (isFuture || busyRef.current) return
    busyRef.current = true
    try {
      const cur = getCount(habit, dateKeyStr)
      if (cur <= 0) {
        // 未打卡 -> 打满
        const rec = await habitApi.upsertRecord(habit.id, dateKeyStr, goal)
        onRecordChange?.(habit.id, dateKeyStr, rec.count)
      } else if (cur >= goal) {
        // 已满 -> 取消打卡
        await habitApi.deleteRecord(habit.id, dateKeyStr)
        onRecordChange?.(habit.id, dateKeyStr, null)
      } else {
        // 部分打卡 -> 补满
        const rec = await habitApi.upsertRecord(habit.id, dateKeyStr, goal)
        onRecordChange?.(habit.id, dateKeyStr, rec.count)
      }
    } catch (err) {
      console.error('打卡操作失败:', err)
    } finally {
      busyRef.current = false
    }
  }

  return (
    <>
      <div
        className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border-light)] hover:border-[var(--color-border)] transition-colors p-4 group cursor-pointer"
        onClick={() => onToggle(habit.id)}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }) }}
      >
        <div className="flex items-center gap-4">
          {/* 图标 */}
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
            style={{ backgroundColor: hexWithAlpha(color, 0.15) }}
          >
            {icon}
          </div>

          {/* 名称 + 今日进度 + 进度条 + 7 天迷你视图 */}
          <HabitStats part="header" habit={habit} todayStr={todayStr} weekDays={weekDays} today={today} color={color} onDayClick={handleDayClick} />
          {/* 今日 +1 / 删除 */}
          <HabitActions part="header" habit={habit} color={color} onIncrement={handleIncrement} onDelete={onDelete} />
        </div>

        {/* 展开详情 */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-[var(--color-border-light)] animate-slide-in-top">
            {/* 7 天日历视图 */}
            <HabitStats part="expandedCalendar" habit={habit} todayStr={todayStr} weekDays={weekDays} today={today} color={color} onDayClick={handleDayClick} />

            {/* 连续天数 + 今日快捷操作 */}
            <div className="flex items-center justify-between">
              <HabitStats part="expandedSummary" habit={habit} todayStr={todayStr} weekDays={weekDays} today={today} color={color} onDayClick={handleDayClick} />
              <HabitActions part="checkin" habit={habit} color={color} onIncrement={handleIncrement} onDecrement={handleDecrement} />
            </div>

            {/* 统计图表：周 / 月 / 趋势（Tab 切换） */}
            <HabitStats part="expandedCharts" habit={habit} todayStr={todayStr} weekDays={weekDays} today={today} color={color} onDayClick={handleDayClick} />

            {/* 历史日历切换 */}
            <HabitActions part="toggle" habit={habit} color={color} showCalendar={showCalendar} onToggleCalendar={() => setShowCalendar(!showCalendar)} />

            {showCalendar && (
              <HabitCalendar
                records={habit.records}
                month={calendarMonth}
                onMonthChange={(dir) => {
                  const newMonth = new Date(calendarMonth)
                  if (dir === 'prev') newMonth.setMonth(newMonth.getMonth() - 1)
                  else newMonth.setMonth(newMonth.getMonth() + 1)
                  setCalendarMonth(newMonth)
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* 右键菜单 + 专注计时器（覆盖层） */}
      <HabitActions
        part="overlays"
        habit={habit}
        color={color}
        contextMenu={contextMenu}
        onCloseContextMenu={closeContextMenu}
        onDelete={onDelete}
        onEdit={onEdit}
        onArchive={onArchive}
      />
    </>
  )
}
