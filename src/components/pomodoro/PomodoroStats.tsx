import type { PomodoroStats } from './storage'

interface PomodoroStatsPanelProps {
  stats: PomodoroStats
}

export function PomodoroStatsPanel({ stats }: PomodoroStatsPanelProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 w-full mb-4">
        <div className="bg-white rounded-lg border border-gray-100 p-4">
          <p className="text-xs text-gray-500">今日专注次数</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.focusCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-100 p-4">
          <p className="text-xs text-gray-500">今日专注分钟</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.focusMinutes}</p>
        </div>
      </div>
      <div className="w-full bg-white rounded-lg border border-gray-100 p-4 flex items-center justify-between">
        <span className="text-xs text-gray-500">累计专注次数</span>
        <span className="text-sm font-semibold text-gray-900">{stats.totalSessions} 次</span>
      </div>
    </>
  )
}
