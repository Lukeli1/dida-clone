import { Habit } from './constants'

/* ============ 专注计时器弹窗 ============ */

export interface HabitFocusTimerProps {
  habit: Habit
  seconds: number
  targetSeconds: number
  onSetTarget: (targetSeconds: number) => void
  onStop: () => void
}

/** 专注计时器弹窗：环形进度 + 快捷时长切换 */
export function HabitFocusTimer({ habit, seconds, targetSeconds, onSetTarget, onStop }: HabitFocusTimerProps) {
  const remaining = targetSeconds - seconds
  const min = Math.floor(remaining / 60)
  const sec = remaining % 60
  const pct = (seconds / targetSeconds) * 100

  // 兼容后端可选字段：color / icon 缺省时回退默认值
  const color = habit.color ?? '#6B7280'
  const icon = habit.icon ?? '🎯'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onStop}>
      <div className="bg-[var(--color-surface)] rounded-2xl shadow-xl border border-[var(--color-border)] p-8 w-full max-w-sm mx-4 text-center" onClick={e => e.stopPropagation()}>
        <div className="text-5xl mb-3">{icon}</div>
        <p className="text-[var(--color-text-primary)] font-semibold mb-1">{habit.name}</p>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">专注中...</p>
        {/* 环形进度 */}
        <div className="relative w-40 h-40 mx-auto mb-6">
          <svg className="w-40 h-40 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#f3f4f6" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 42}`}
              strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-3xl font-mono font-bold text-[var(--color-text-primary)]">
              {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
            </span>
          </div>
        </div>
        {/* 快捷时长 */}
        <div className="flex items-center justify-center gap-2 mb-5">
          {[15, 25, 45].map(t => (
            <button
              key={t}
              type="button"
              onClick={() => onSetTarget(t * 60)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                targetSeconds === t * 60 ? 'text-white' : 'text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-tertiary)]'
              }`}
              style={targetSeconds === t * 60 ? { backgroundColor: color } : undefined}
            >
              {t}分钟
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onStop}
          className="px-6 py-2 text-sm text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
        >
          结束专注
        </button>
      </div>
    </div>
  )
}
