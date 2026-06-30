import { useState, useMemo } from 'react'
import { format, isSameDay } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { hexWithAlpha } from '../../utils/priority'
import { Habit, dateKey, getCount, getStreak, isFutureDay } from './constants'
import { DayCell } from './DayCell'
import { MonthHeatmap } from './MonthHeatmap'
import { TrendChart } from './TrendChart'

/* ============ 习惯统计展示 ============ */

export type HabitStatsPart = 'header' | 'expandedCalendar' | 'expandedSummary' | 'expandedCharts'

export interface HabitStatsProps {
  habit: Habit
  todayStr: string
  weekDays: Date[]
  today: Date
  color: string
  /** 渲染哪个位置的统计片段 */
  part: HabitStatsPart
  /** 某天格子点击：在 0 / 目标值 之间切换 */
  onDayClick: (dateKeyStr: string, isFuture: boolean) => void
}

/**
 * 习惯统计展示：依据 `part` 渲染不同位置的统计片段。
 * - 'header'          : 卡片头部中间列（名称 + 连续天数徽标 + 今日进度 + 进度条）+ 7 天迷你视图
 * - 'expandedCalendar': 展开详情中的 7 天日历网格（含星期标签与日期）
 * - 'expandedSummary' : 展开详情中连续天数 + 今日进度的文字摘要
 */
export function HabitStats({ habit, todayStr, weekDays, today, color, part, onDayClick }: HabitStatsProps) {
  const todayCount = getCount(habit, todayStr)
  const goal = habit.target_count
  const pct = goal > 0 ? Math.min((todayCount / goal) * 100, 100) : 0
  const streak = getStreak(habit)
  const completed = todayCount >= goal

  /* ---- 头部：名称 + 今日进度 + 进度条 + 7 天迷你视图 ---- */
  if (part === 'header') {
    return (
      <>
        {/* 名称 + 今日进度 + 进度条 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-[var(--color-text-primary)] truncate">{habit.name}</span>
            {streak > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0"
                style={{ backgroundColor: hexWithAlpha('#F59E0B', 0.15), color: '#F59E0B' }}
              >
                🔥 {streak}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] mb-2">
            <span>今日 {todayCount}/{goal}{habit.unit ? ` ${habit.unit}` : ''}</span>
            {completed && <span className="text-xs text-[var(--color-success)] font-medium">已完成</span>}
          </div>
          <div className="h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: color }}
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
                color={color}
                isFuture={isFutureDay(day)}
                isToday={isSameDay(day, today)}
                size="w-7 h-7"
                onClick={() => onDayClick(key, isFutureDay(day))}
              />
            )
          })}
        </div>
      </>
    )
  }

  /* ---- 展开：7 天日历网格（星期标签 + 日期 + 格子） ---- */
  if (part === 'expandedCalendar') {
    return (
      <div className="grid grid-cols-7 gap-2 mb-4">
        {weekDays.map(day => {
          const key = dateKey(day)
          const count = getCount(habit, key)
          return (
            <div key={key} className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-[var(--color-text-tertiary)]">{format(day, 'EEEEE', { locale: zhCN })}</span>
              <DayCell
                count={count}
                goal={goal}
                color={color}
                isFuture={isFutureDay(day)}
                isToday={isSameDay(day, today)}
                size="w-9 h-9"
                showCount
                onClick={() => onDayClick(key, isFutureDay(day))}
              />
              <span className={`text-xs ${isSameDay(day, today) ? 'text-[var(--color-accent)] font-bold' : 'text-[var(--color-text-tertiary)]'}`}>
                {format(day, 'd')}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  /* ---- 展开：统计图表区域（周/月/趋势 Tab 切换） ---- */
  if (part === 'expandedCharts') {
    return <HabitCharts records={habit.records} />
  }

  /* ---- 展开：连续天数 + 今日进度摘要 ---- */
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
        style={{ backgroundColor: hexWithAlpha('#F59E0B', 0.15), color: '#F59E0B' }}
      >
        🔥 {streak} 天连续
      </span>
      <span className="text-sm text-[var(--color-text-secondary)]">
        今日 {todayCount}/{goal}{habit.unit ? ` ${habit.unit}` : ''}
      </span>
    </div>
  )
}

/* ============ 统计图表区域：周 / 月 / 趋势 ============ */

type ChartView = 'week' | 'month' | 'trend'

/**
 * 习惯统计图表：在展开详情中以 Tab 切换三种可视化视图。
 * - week  : 最近 7 天每日打卡次数柱状图（BarChart）
 * - month : 当月打卡热力图（CSS Grid，MonthHeatmap）
 * - trend : 最近 30 天打卡趋势折线图 + 7 天移动平均线（TrendChart）
 *
 * 颜色统一使用主题强调色 var(--color-accent)，适配深色模式。
 */
function HabitCharts({ records }: { records: Record<string, number> }) {
  const [chartView, setChartView] = useState<ChartView>('week')

  // 周视图数据：最近 7 天每日打卡次数
  const weekData = useMemo(() => {
    const today = new Date()
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (6 - i))
      const key = dateKey(d)
      return { date: `${d.getMonth() + 1}/${d.getDate()}`, count: records[key] || 0 }
    })
  }, [records])

  return (
    <div className="mt-4" onClick={(e) => e.stopPropagation()}>
      {/* 标题 */}
      <div className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">统计图表</div>

      {/* Tab 切换 */}
      <div className="flex gap-2 mb-3">
        {(['week', 'month', 'trend'] as const).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => setChartView(v)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              chartView === v
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
            }`}
          >
            {v === 'week' ? '本周' : v === 'month' ? '本月' : '趋势'}
          </button>
        ))}
      </div>

      {/* 图表内容 */}
      {chartView === 'week' && (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weekData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
              stroke="var(--color-border-light)"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
              allowDecimals={false}
              stroke="var(--color-border-light)"
            />
            <Tooltip
              cursor={{ fill: 'var(--color-bg-tertiary)' }}
              contentStyle={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                color: 'var(--color-text-primary)',
                fontSize: '12px',
              }}
              labelStyle={{ color: 'var(--color-text-secondary)' }}
              itemStyle={{ color: 'var(--color-text-primary)' }}
              formatter={(value) => [value ?? 0, '打卡次数']}
            />
            <Bar dataKey="count" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {chartView === 'month' && <MonthHeatmap records={records} />}

      {chartView === 'trend' && <TrendChart records={records} />}
    </div>
  )
}
