import { useMemo, useState } from 'react'
import { isToday, isThisMonth, subDays, format, isSameDay, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { Task, List } from '../types'
import { getLLMConfig, generateSummary } from '../utils/llm'
import { PRIORITY_STYLES } from '../utils/priority'
import { useToast } from './Toast'

interface StatsViewProps {
  tasks: Task[]
  lists: List[]
}

export function StatsView({ tasks, lists }: StatsViewProps) {
  const toast = useToast()
  const [aiSummary, setAiSummary] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
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

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-bg-secondary)] p-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6">统计面板</h2>

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
                <span className="text-xs text-[var(--color-text-tertiary)]">{format(d.date, 'EEE', { locale: zhCN })}</span>
                <span className={`text-xs ${isToday(d.date) ? 'text-[var(--color-accent)] font-bold' : 'text-[var(--color-text-tertiary)]'}`}>
                  {format(d.date, 'M/d')}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* 按清单统计 */}
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6" style={{boxShadow:'var(--shadow-card)'}}>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">清单分布</h3>
            {stats.listStats.length === 0 ? (
              <p className="text-sm text-[var(--color-text-tertiary)]">暂无数据</p>
            ) : (
              <div className="space-y-3">
                {stats.listStats.map(s => (
                  <div key={s.list.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-[var(--color-text-secondary)] flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.list.color || '#9aa0a6' }} />
                        {s.list.name}
                      </span>
                      <span className="text-xs text-[var(--color-text-tertiary)]">{s.completed}/{s.total}</span>
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
                      <span className="text-xs text-[var(--color-text-tertiary)]">{p.count}</span>
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
