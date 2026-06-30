import { useMemo, useState, useEffect } from 'react'
import { isToday, isThisMonth, subDays, format, isSameDay, parseISO, startOfWeek, endOfWeek } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Task, List } from '../types'
import { getLLMConfig, generateSummary } from '../utils/llm'
import { PRIORITY_STYLES } from '../utils/priority'
import { timeTrackingApi } from '../api/timeTrackingApi'
import type { TimeStat } from '../api/timeTrackingApi'
import { reportApi } from '../api/reportApi'
import type { ReportRecord } from '../api/reportApi'
import { generateWeeklyReport } from '../utils/reportGenerator'
import { useToast } from './Toast'
import { EmptyState } from './EmptyState'

interface StatsViewProps {
  tasks: Task[]
  lists: List[]
}

/** 格式化秒数为人类可读字符串：h/m/s */
function formatDuration(secs: number): string {
  const safe = Math.max(0, Math.floor(secs))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  if (h > 0) return `${h}h${m}m`
  if (m > 0) return `${m}m${s}s`
  return `${s}s`
}

export function StatsView({ tasks, lists }: StatsViewProps) {
  const toast = useToast()
  const [aiSummary, setAiSummary] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [timeStats, setTimeStats] = useState<TimeStat[]>([])

  // 加载本周按清单分组的时间分布统计
  useEffect(() => {
    let cancelled = false
    async function loadTimeStats() {
      try {
        const now = new Date()
        const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString()
        const stats = await timeTrackingApi.getTimeStats('list', weekStart, weekEnd)
        if (!cancelled) setTimeStats(stats)
      } catch (e: any) {
        console.error('加载时间分布统计失败', e)
      }
    }
    loadTimeStats()
    return () => { cancelled = true }
  }, [])

  // 本周时间分布柱状图数据（按清单），关联 lists 获取颜色
  const timeChartData = useMemo(() => {
    return timeStats.map(s => {
      const list = lists.find(l => l.name === s.label)
      return {
        label: s.label,
        seconds: s.seconds,
        color: list?.color || '#3B82F6',
      }
    })
  }, [timeStats, lists])

  const weekTotalSeconds = useMemo(
    () => timeStats.reduce((sum, s) => sum + s.seconds, 0),
    [timeStats]
  )

  const stats = useMemo(() => {
    const today = new Date()

    // 今日统计
    const todayTasks = tasks.filter(t => t.due_date && isToday(parseISO(t.due_date)))
    const todayCompleted = todayTasks.filter(t => t.completed).length
    const todayTotal = todayTasks.length
    const todayRate = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0

    // 本周完成趋势（7 天）
    const weekData = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(today, 6 - i)
      const completedCount = tasks.filter(t => {
        if (!t.completed) return false
        // 用 updated_at 作为完成时间近似
        if (!t.updated_at) return false
        return isSameDay(parseISO(t.updated_at), date)
      }).length
      return { date, count: completedCount }
    })

    // 本月完成总数
    const monthCompleted = tasks.filter(t => t.completed && t.updated_at && isThisMonth(parseISO(t.updated_at))).length

    // 按清单统计
    const listStats = lists.map(list => {
      const listTasks = tasks.filter(t => t.list_id === list.id)
      return {
        list,
        total: listTasks.length,
        completed: listTasks.filter(t => t.completed).length,
        incomplete: listTasks.filter(t => !t.completed).length,
      }
    }).filter(s => s.total > 0)

    // 按优先级统计
    const priorityStats = [
      { label: '高', value: 1, color: PRIORITY_STYLES[1].hex, count: tasks.filter(t => t.priority === 1 && !t.completed).length },
      { label: '中', value: 2, color: PRIORITY_STYLES[2].hex, count: tasks.filter(t => t.priority === 2 && !t.completed).length },
      { label: '低', value: 3, color: PRIORITY_STYLES[3].hex, count: tasks.filter(t => t.priority === 3 && !t.completed).length },
      { label: '无', value: 0, color: PRIORITY_STYLES[0].hex, count: tasks.filter(t => t.priority === 0 && !t.completed).length },
    ]

    // 连续完成天数
    let streak = 0
    for (let i = 0; i < 365; i++) {
      const date = subDays(today, i)
      const hasCompleted = tasks.some(t => t.completed && t.updated_at && isSameDay(parseISO(t.updated_at), date))
      if (hasCompleted) {
        streak++
      } else if (i > 0) {
        break
      }
    }

    // 总完成率
    const totalCompleted = tasks.filter(t => t.completed).length
    const totalTasks = tasks.length
    const overallRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0

    return { todayCompleted, todayTotal, todayRate, weekData, monthCompleted, listStats, priorityStats, streak, totalCompleted, totalTasks, overallRate }
  }, [tasks, lists])

  const maxWeekCount = Math.max(...stats.weekData.map(d => d.count), 1)
  const maxListTotal = Math.max(...stats.listStats.map(s => s.total), 1)

  // P12-05: 最近 6 个月月度趋势（完成数 + 逾期数）
  // 完成数：按 updated_at（完成时间近似）所在月份分组
  // 逾期数：按 due_date 所在月份分组，且 due_date 早于 now 且未完成
  const monthlyTrend = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      return { year: d.getFullYear(), month: d.getMonth(), label: `${d.getMonth() + 1}月` }
    })
    return months.map(m => {
      const completed = tasks.filter(t => {
        if (!t.completed || !t.updated_at) return false
        const d = new Date(t.updated_at)
        return d.getFullYear() === m.year && d.getMonth() === m.month
      }).length
      const overdue = tasks.filter(t => {
        if (!t.due_date || t.completed) return false
        const d = new Date(t.due_date)
        return d.getFullYear() === m.year && d.getMonth() === m.month && d < now
      }).length
      return { label: m.label, completed, overdue }
    })
  }, [tasks])

  // P12-05: 历史报告状态
  const [reports, setReports] = useState<ReportRecord[]>([])
  const [selectedReport, setSelectedReport] = useState<ReportRecord | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)

  async function handleAISummary() {
    if (!getLLMConfig()) {
      toast.error('请先在设置中配置大模型 API')
      return
    }
    setAiLoading(true)
    setAiSummary('')
    try {
      // 取今日 + 未完成任务作为摘要输入
      const todayTasks = tasks.filter(t => t.due_date && isToday(parseISO(t.due_date)))
      const summary = await generateSummary(todayTasks.length > 0 ? todayTasks : tasks.slice(0, 20))
      setAiSummary(summary)
    } catch (e: any) {
      toast.error(`AI 摘要生成失败: ${e.message || e}`)
    } finally {
      setAiLoading(false)
    }
  }

  // P12-05: 加载历史报告列表
  async function loadReports() {
    setReportLoading(true)
    try {
      const list = await reportApi.getAll(undefined, 50)
      setReports(list)
    } catch (e: any) {
      console.error('加载历史报告失败', e)
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => {
    loadReports()
  }, [])

  // P12-05: 手动生成周报
  async function handleGenerateWeekly() {
    if (!getLLMConfig()) {
      toast.error('请先在设置中配置大模型 API')
      return
    }
    setGeneratingReport(true)
    try {
      const id = await generateWeeklyReport(tasks)
      if (id !== null) {
        toast.success('周报已生成')
        await loadReports()
        // 自动选中新生成的报告
        const fresh = await reportApi.getAll('weekly', 1)
        if (fresh.length > 0) setSelectedReport(fresh[0])
      } else {
        toast.error('周报生成失败，请稍后重试')
      }
    } catch (e: any) {
      toast.error(`周报生成失败: ${e.message || e}`)
    } finally {
      setGeneratingReport(false)
    }
  }

  // P12-05: 删除报告
  async function handleDeleteReport(id: number) {
    try {
      await reportApi.delete(id)
      setReports(prev => prev.filter(r => r.id !== id))
      if (selectedReport?.id === id) setSelectedReport(null)
      toast.info('已删除报告')
    } catch (e: any) {
      toast.error(`删除失败: ${e.message || e}`)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">统计面板</h2>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto">

        {/* 概览卡片 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard title="今日完成" value={`${stats.todayCompleted}/${stats.todayTotal}`} subtitle={`${stats.todayRate}%`} color="blue" />
          <StatCard title="本月完成" value={stats.monthCompleted} subtitle="个任务" color="green" />
          <StatCard title="连续天数" value={stats.streak} subtitle="天" color="orange" />
          <StatCard title="总完成率" value={`${stats.overallRate}%`} subtitle={`${stats.totalCompleted}/${stats.totalTasks}`} color="purple" />
        </div>

        {/* AI 智能摘要 */}
        <div className="bg-[var(--color-ai)]/5 border border-[var(--color-ai)]/20 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
              <svg className="w-5 h-5 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI 智能摘要
            </h3>
            <button
              onClick={handleAISummary}
              disabled={aiLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiLoading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              {aiLoading ? '生成中...' : '生成摘要'}
            </button>
          </div>
          {aiSummary ? (
            <div className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap bg-[var(--color-surface)]/60 rounded-lg p-4 border border-[var(--color-accent-light)]">
              {aiSummary}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-tertiary)]">点击"生成摘要"，AI 会根据你的任务情况生成工作总结和建议</p>
          )}
        </div>

        {/* 本周完成趋势 */}
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 mb-6" style={{boxShadow:'var(--shadow-card)'}}>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">本周完成趋势</h3>
          <div className="flex items-end justify-between gap-3 h-48">
            {stats.weekData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs text-[var(--color-text-secondary)] font-medium">{d.count}</span>
                <div className="w-full bg-[var(--color-bg-tertiary)] rounded-t-lg overflow-hidden flex items-end" style={{ height: '120px' }}>
                  <div
                    className="w-full bg-gradient-to-t from-[var(--color-accent)] to-[var(--color-accent-hover)] rounded-t-lg transition-all"
                    style={{ height: `${(d.count / maxWeekCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-center text-[var(--color-text-secondary)]">{format(d.date, 'EEE', { locale: zhCN })}</span>
                <span className={`text-xs ${isToday(d.date) ? 'text-[var(--color-accent)] font-bold' : 'text-[var(--color-text-secondary)]'}`}>
                  {format(d.date, 'M/d')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 本周时间分布（时间追踪） */}
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 mb-6" style={{boxShadow:'var(--shadow-card)'}}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">本周时间分布</h3>
            <span className="text-sm text-[var(--color-text-secondary)]">
              总计 <span className="font-semibold text-[var(--color-accent)]">{formatDuration(weekTotalSeconds)}</span>
            </span>
          </div>
          {timeChartData.length === 0 ? (
            <EmptyState title="本周暂无时间追踪记录" />
          ) : (
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeChartData} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                    stroke="var(--color-border-light)"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                    stroke="var(--color-border-light)"
                    tickFormatter={(v) => formatDuration(v)}
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
                    formatter={(value) => [formatDuration(Number(value)), '时长']}
                  />
                  <Bar dataKey="seconds" name="时长" radius={[4, 4, 0, 0]} maxBarSize={56}>
                    {timeChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* P12-05: 月度趋势（最近 6 个月完成数 + 逾期数） */}
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 mb-6" style={{boxShadow:'var(--shadow-card)'}}>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">月度趋势（近 6 个月）</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                  stroke="var(--color-border-light)"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
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
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="完成数"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--color-accent)' }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="overdue"
                  name="逾期数"
                  stroke="var(--color-warning)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--color-warning)' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* 按清单统计 */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6" style={{boxShadow:'var(--shadow-card)'}}>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">清单分布</h3>
            {stats.listStats.length === 0 ? (
              <EmptyState title="暂无数据" />
            ) : (
              <div className="space-y-3">
                {stats.listStats.map(s => (
                  <div key={s.list.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-[var(--color-text-secondary)] flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.list.color || '#9aa0a6' }} />
                        {s.list.name}
                      </span>
                      <span className="text-xs text-[var(--color-text-secondary)]">{s.completed}/{s.total}</span>
                    </div>
                    <div className="w-full bg-[var(--color-bg-tertiary)] rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(s.total / maxListTotal) * 100}%`,
                          backgroundColor: s.list.color || '#9aa0a6',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 按优先级统计 */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6" style={{boxShadow:'var(--shadow-card)'}}>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">优先级分布（未完成）</h3>
            <div className="space-y-3">
              {stats.priorityStats.map(p => {
                const maxCount = Math.max(...stats.priorityStats.map(s => s.count), 1)
                return (
                  <div key={p.value}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-[var(--color-text-secondary)] flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.label}
                      </span>
                      <span className="text-xs text-[var(--color-text-secondary)]">{p.count}</span>
                    </div>
                    <div className="w-full bg-[var(--color-bg-tertiary)] rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(p.count / maxCount) * 100}%`,
                          backgroundColor: p.color,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* P12-05: 历史报告（周报 / 月报） */}
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 mt-6" style={{boxShadow:'var(--shadow-card)'}}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
              <svg className="w-5 h-5 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              历史报告
            </h3>
            <button
              onClick={handleGenerateWeekly}
              disabled={generatingReport}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[var(--color-accent)] text-white rounded-lg hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingReport ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
              {generatingReport ? '生成中...' : '手动生成本周周报'}
            </button>
          </div>

          {reports.length === 0 ? (
            reportLoading ? (
              <p className="text-sm text-[var(--color-text-tertiary)]">加载中...</p>
            ) : (
              <EmptyState title="暂无历史报告" subtitle="点击右上角按钮生成本周周报" />
            )
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {/* 报告列表 */}
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {reports.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedReport(r)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      selectedReport?.id === r.id
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]/40'
                        : 'border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${r.type === 'weekly' ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'bg-[var(--color-ai)]/10 text-[var(--color-ai)]'}`}>
                        {r.type === 'weekly' ? '周报' : '月报'}
                      </span>
                      <span className="text-xs text-[var(--color-text-tertiary)]">{r.period_start}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* 报告内容预览 */}
              <div className="col-span-2">
                {selectedReport ? (
                  <div className="border border-[var(--color-border)] rounded-lg p-4 max-h-96 overflow-y-auto">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--color-border)]">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${selectedReport.type === 'weekly' ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'bg-[var(--color-ai)]/10 text-[var(--color-ai)]'}`}>
                          {selectedReport.type === 'weekly' ? '周报' : '月报'}
                        </span>
                        <span className="text-sm text-[var(--color-text-secondary)]">
                          {selectedReport.period_start} ~ {selectedReport.period_end}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteReport(selectedReport.id)}
                        className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors"
                        title="删除报告"
                      >
                        删除
                      </button>
                    </div>
                    <div className="prose prose-sm max-w-none text-[var(--color-text-secondary)]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedReport.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full border border-dashed border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-tertiary)]">
                    点击左侧报告查看内容
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, subtitle, color }: { title: string; value: string | number; subtitle: string; color: 'blue' | 'green' | 'orange' | 'purple' }) {
  const dotColorMap = {
    blue: 'bg-[var(--color-accent)]',
    green: 'bg-[var(--color-success)]',
    orange: 'bg-[var(--color-warning)]',
    purple: 'bg-[var(--color-ai)]',
  }
  const textColorMap = {
    blue: 'text-[var(--color-accent)]',
    green: 'text-[var(--color-success)]',
    orange: 'text-[var(--color-warning)]',
    purple: 'text-[var(--color-ai)]',
  }
  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4" style={{boxShadow:'var(--shadow-card)'}}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${dotColorMap[color]}`} />
        <p className="text-xs text-[var(--color-text-secondary)]">{title}</p>
      </div>
      <p className={`text-2xl font-bold ${textColorMap[color]}`}>{value}</p>
      <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{subtitle}</p>
    </div>
  )
}
