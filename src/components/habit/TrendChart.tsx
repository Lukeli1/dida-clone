import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { dateKey } from './constants'

/* ============ 趋势视图折线图 ============ */

interface TrendPoint {
  date: string
  count: number
  avg: number | null
}

/**
 * 习惯打卡趋势折线图：展示最近 30 天的每日打卡次数与 7 天移动平均线。
 *
 * - records: 日期字符串(YYYY-MM-DD) -> 打卡次数
 *
 * 主线为实线，7 天移动平均线为虚线（avg 在前 6 天为 null，不绘制）。
 * 线条颜色取主题强调色 var(--color-accent)，适配深色模式。
 */
export function TrendChart({ records }: {
  records: Record<string, number>
}) {
  const trendData = useMemo<TrendPoint[]>(() => {
    const today = new Date()
    const data: TrendPoint[] = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (29 - i))
      const key = dateKey(d)
      const count = records[key] || 0
      return { date: `${d.getMonth() + 1}/${d.getDate()}`, count, avg: null }
    })

    // 计算 7 天移动平均线（从第 7 个点开始有值）
    for (let i = 6; i < data.length; i++) {
      const sum = data.slice(i - 6, i + 1).reduce((a, b) => a + b.count, 0)
      data[i].avg = sum / 7
    }
    return data
  }, [records])

  return (
    <div
      className="p-3 bg-[var(--color-bg-secondary)] rounded-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={trendData} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
          <XAxis
            dataKey="date"
            // 每 5 天显示一个标签（跳过 4 个）
            interval={4}
            tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
            stroke="var(--color-border-light)"
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
            allowDecimals={false}
            stroke="var(--color-border-light)"
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              color: 'var(--color-text-primary)',
              fontSize: '12px',
            }}
            labelStyle={{ color: 'var(--color-text-secondary)' }}
            itemStyle={{ color: 'var(--color-text-primary)' }}
            formatter={(value, name) => {
              const n = String(name)
              const label = n === 'count' ? '打卡次数' : n === 'avg' ? '7日均值' : n
              if (typeof value === 'number') {
                return [n === 'avg' ? value.toFixed(1) : value, label]
              }
              return [value ?? '-', label]
            }}
          />
          {/* 每日打卡次数（实线） */}
          <Line
            type="monotone"
            dataKey="count"
            name="count"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          {/* 7 天移动平均线（虚线） */}
          <Line
            type="monotone"
            dataKey="avg"
            name="avg"
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
            connectNulls
            opacity={0.6}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* 图例 */}
      <div className="mt-1 flex items-center justify-center gap-4 text-[10px] text-[var(--color-text-tertiary)]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-0.5 bg-[var(--color-accent)]" />
          每日打卡
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t border-dashed border-[var(--color-accent)] opacity-60" />
          7 日均值
        </span>
      </div>
    </div>
  )
}
