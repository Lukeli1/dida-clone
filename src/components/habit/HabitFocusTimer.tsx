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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onStop}>
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 w-full max-w-sm mx-4 text-center" onClick={e => e.stopPropagation()}>
        <div className="text-5xl mb-3">{habit.icon}</div>
        <p className="text-gray-900 font-semibold mb-1">{habit.name}</p>
        <p className="text-sm text-gray-500 mb-6">专注中...</p>
        {/* 环形进度 */}
        <div className="relative w-40 h-40 mx-auto mb-6">
          <svg className="w-40 h-40 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#f3f4f6" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke={habit.color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 42}`}
              strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-3xl font-mono font-bold text-gray-900">
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
                targetSeconds === t * 60 ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
              style={targetSeconds === t * 60 ? { backgroundColor: habit.color } : undefined}
            >
              {t}分钟
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onStop}
          className="px-6 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
        >
          结束专注
        </button>
      </div>
    </div>
  )
}
