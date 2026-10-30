import { useState, useEffect, useCallback } from 'react'
import { useToast } from '../Toast'
import { getPerfStats, clearPerfRecords, MAX_RECORDS, type PerfStat } from '../../utils/perfMonitor'

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
    <div className="space-y-4" data-testid="perf-panel">
      <section
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        aria-labelledby="perf-heading"
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border-light)] px-4 py-3.5">
          <div className="min-w-0">
            <h4 id="perf-heading" className="text-sm font-medium text-[var(--color-text-primary)]">
              性能监控
            </h4>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              关键操作耗时统计（共 {stats.length} 项操作）
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              data-testid="perf-refresh"
              onClick={handleRefresh}
              className="inline-flex h-8 items-center rounded-lg border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
            >
              刷新
            </button>
            <button
              type="button"
              data-testid="perf-clear"
              onClick={handleClear}
              disabled={stats.length === 0}
              className="inline-flex h-8 items-center rounded-lg border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]/40 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="mb-2 h-10 w-10 text-[var(--color-text-tertiary)] opacity-40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
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
            <div className="overflow-x-auto" data-testid="perf-table-wrap">
              <table className="w-full table-fixed text-sm" aria-label="性能统计数据" data-testid="perf-table">
                <colgroup>
                  <col />
                  <col className="w-16" />
                  <col className="w-20" />
                  <col className="w-20" />
                  <col className="w-20" />
                </colgroup>
                <thead>
                  <tr className="border-b border-[var(--color-border-light)] text-left">
                    <th scope="col" className="py-2 pr-3 font-medium text-[var(--color-text-secondary)]">
                      操作名
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-2 py-2 text-right font-medium text-[var(--color-text-secondary)]"
                    >
                      次数
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-2 py-2 text-right font-medium text-[var(--color-text-secondary)]"
                    >
                      平均 (ms)
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-2 py-2 text-right font-medium text-[var(--color-text-secondary)]"
                    >
                      最大 (ms)
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap py-2 pl-2 text-right font-medium text-[var(--color-text-secondary)]"
                    >
                      最近 (ms)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((stat) => (
                    <tr key={stat.name} className="border-b border-[var(--color-border-light)] last:border-0">
                      <td className="py-2.5 pr-3 font-mono text-xs leading-relaxed text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
                        {stat.name}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-[var(--color-text-primary)]">
                        {stat.count}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-[var(--color-text-primary)]">
                        {stat.avg.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-[var(--color-text-primary)]">
                        {stat.max.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pl-2 text-right tabular-nums text-[var(--color-text-primary)]">
                        {stat.last.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 底部说明 */}
      <p className="px-1 text-xs leading-relaxed text-[var(--color-text-tertiary)] [overflow-wrap:anywhere]">
        数据保存在 localStorage，最多保留 {MAX_RECORDS} 条记录。每次启动应用会自动记录关键操作耗时。
      </p>
    </div>
  )
}
