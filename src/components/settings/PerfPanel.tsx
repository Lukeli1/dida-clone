import { useState, useEffect, useCallback } from 'react'
import { useToast } from '../Toast'
import {
  getPerfStats,
  clearPerfRecords,
  MAX_RECORDS,
  type PerfStat,
} from '../../utils/perfMonitor'

/**
 * 性能监控面板（P12-07）
 *
 * 在「设置 → 性能监控」中展示关键操作（loadTasks / loadLists / loadTags 等）的
 * 耗时统计，支持刷新 / 清空。数据持久化在 localStorage（key: perf_records），
 * 最多保留 200 条记录，用于持续监控性能回归。
 *
 * 表格列：操作名 | 次数 | 平均(ms) | 最大(ms) | 最近(ms)
 */
export function PerfPanel() {
  const toast = useToast()
  const [stats, setStats] = useState<PerfStat[]>(() => getPerfStats())

  const refresh = useCallback(() => {
    setStats(getPerfStats())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // ===== 清空性能记录 =====
  function handleClear() {
    clearPerfRecords()
    refresh()
    toast.success('已清除性能数据')
  }

  // ===== 手动刷新 =====
  function handleRefresh() {
    refresh()
    toast.info('已刷新性能数据')
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--color-border-light)]">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">性能监控</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              关键操作耗时统计（共 {stats.length} 项操作）
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors text-[var(--color-text-secondary)]"
            >
              刷新
            </button>
            <button
              onClick={handleClear}
              disabled={stats.length === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors text-[var(--color-text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              清空
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3.5">
          {stats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <svg
                className="w-10 h-10 mb-2 text-[var(--color-text-tertiary)] opacity-40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <p className="text-sm text-[var(--color-text-tertiary)]">暂无性能数据</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border-light)] text-left">
                    <th className="py-2 pr-4 font-medium text-[var(--color-text-secondary)]">操作名</th>
                    <th className="py-2 px-4 font-medium text-[var(--color-text-secondary)] text-right">次数</th>
                    <th className="py-2 px-4 font-medium text-[var(--color-text-secondary)] text-right">平均 (ms)</th>
                    <th className="py-2 px-4 font-medium text-[var(--color-text-secondary)] text-right">最大 (ms)</th>
                    <th className="py-2 pl-4 font-medium text-[var(--color-text-secondary)] text-right">最近 (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((stat) => (
                    <tr
                      key={stat.name}
                      className="border-b border-[var(--color-border-light)] last:border-0"
                    >
                      <td className="py-2.5 pr-4 text-[var(--color-text-primary)] font-mono text-xs">
                        {stat.name}
                      </td>
                      <td className="py-2.5 px-4 text-right text-[var(--color-text-primary)] tabular-nums">
                        {stat.count}
                      </td>
                      <td className="py-2.5 px-4 text-right text-[var(--color-text-primary)] tabular-nums">
                        {stat.avg.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-[var(--color-text-primary)] tabular-nums">
                        {stat.max.toFixed(2)}
                      </td>
                      <td className="py-2.5 pl-4 text-right text-[var(--color-text-primary)] tabular-nums">
                        {stat.last.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 底部说明 */}
      <p className="text-xs text-[var(--color-text-tertiary)] px-1">
        数据保存在 localStorage，最多保留 {MAX_RECORDS} 条记录。每次启动应用会自动记录关键操作耗时。
      </p>
    </div>
  )
}
