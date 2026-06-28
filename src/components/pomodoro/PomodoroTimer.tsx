import type { TimerMode } from './storage'

// ============ 常量 ============

export const MODE_CONFIG: Record<TimerMode, { label: string; color: string }> = {
  focus: { label: '专注', color: '#378ADD' },
  shortBreak: { label: '短休息', color: '#10B981' },
  longBreak: { label: '长休息', color: '#8B5CF6' },
}

export const MODE_ORDER: TimerMode[] = ['focus', 'shortBreak', 'longBreak']

// 圆环 SVG 参数
const RING_SIZE = 280
const RING_STROKE = 14
const RING_CENTER = RING_SIZE / 2
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

// ============ 工具函数 ============

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ============ 组件 ============

interface PomodoroTimerProps {
  mode: TimerMode
  secondsLeft: number
  totalSeconds: number
  isRunning: boolean
  sessionsInCycle: number
  longBreakInterval: number
  onModeChange: (mode: TimerMode) => void
  onStartPause: () => void
  onReset: () => void
}

export function PomodoroTimer({
  mode,
  secondsLeft,
  totalSeconds,
  isRunning,
  sessionsInCycle,
  longBreakInterval,
  onModeChange,
  onStartPause,
  onReset,
}: PomodoroTimerProps) {
  const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 0
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress)
  const ringColor = MODE_CONFIG[mode].color

  return (
    <>
      {/* 模式切换 */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-8">
        {MODE_ORDER.map((m) => {
          const active = m === mode
          return (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`px-5 py-1.5 text-sm rounded-md transition-all ${
                active
                  ? 'bg-white shadow-sm text-gray-900 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {MODE_CONFIG[m].label}
            </button>
          )
        })}
      </div>

      {/* 圆环计时器 */}
      <div className="relative mb-8" style={{ width: RING_SIZE, height: RING_SIZE }}>
        <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
          {/* 背景轨道 */}
          <circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth={RING_STROKE}
          />
          {/* 进度环 */}
          <circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        {/* 中心文字 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-6xl font-bold tabular-nums text-gray-900">
            {formatTime(secondsLeft)}
          </span>
          <span className="mt-2 text-sm text-gray-500">{MODE_CONFIG[mode].label}中</span>
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center gap-6 mb-6">
        <button
          onClick={onStartPause}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors shadow-sm ${
            isRunning
              ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              : 'bg-[#378ADD] text-white hover:bg-[#185FA5]'
          }`}
          aria-label={isRunning ? '暂停' : '开始'}
        >
          {isRunning ? (
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          ) : (
            <svg className="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          onClick={onReset}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2 py-1"
          aria-label="重置"
        >
          重置
        </button>
      </div>

      {/* 当前进度圆点（距离长休息） */}
      <div className="flex items-center gap-1.5 mb-8">
        {Array.from({ length: longBreakInterval }).map((_, i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full transition-colors"
            style={{ backgroundColor: i < sessionsInCycle ? ringColor : '#D1D5DB' }}
          />
        ))}
        <span className="ml-2 text-xs text-gray-400">
          {sessionsInCycle}/{longBreakInterval} 至长休息
        </span>
      </div>
    </>
  )
}
