import { useState, useEffect, useRef } from 'react'
import type { Task } from '../types'

// ============ 类型定义 ============

type TimerMode = 'focus' | 'shortBreak' | 'longBreak'

interface PomodoroSettings {
  focusTime: number // 分钟
  shortBreak: number // 分钟
  longBreak: number // 分钟
  longBreakInterval: number // 多少次专注后进入长休息
}

interface PomodoroStats {
  date: string // YYYY-MM-DD
  focusCount: number // 当日专注次数
  focusMinutes: number // 当日专注总分钟数
  totalSessions: number // 历史累计专注次数
}

interface PomodoroViewProps {
  tasks: Task[]
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
}

// ============ 常量 ============

const STORAGE_SETTINGS_KEY = 'pomodoro_settings'
const STORAGE_STATS_KEY = 'pomodoro_stats'

const DEFAULT_SETTINGS: PomodoroSettings = {
  focusTime: 25,
  shortBreak: 5,
  longBreak: 15,
  longBreakInterval: 4,
}

const MODE_CONFIG: Record<TimerMode, { label: string; color: string }> = {
  focus: { label: '专注', color: '#378ADD' },
  shortBreak: { label: '短休息', color: '#10B981' },
  longBreak: { label: '长休息', color: '#8B5CF6' },
}

const MODE_ORDER: TimerMode[] = ['focus', 'shortBreak', 'longBreak']

// 圆环 SVG 参数
const RING_SIZE = 280
const RING_STROKE = 14
const RING_CENTER = RING_SIZE / 2
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

// ============ 工具函数（纯函数，无状态依赖） ============

function getTodayString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function loadSettings(): PomodoroSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PomodoroSettings>
      return {
        focusTime:
          typeof parsed.focusTime === 'number' && parsed.focusTime > 0
            ? parsed.focusTime
            : DEFAULT_SETTINGS.focusTime,
        shortBreak:
          typeof parsed.shortBreak === 'number' && parsed.shortBreak > 0
            ? parsed.shortBreak
            : DEFAULT_SETTINGS.shortBreak,
        longBreak:
          typeof parsed.longBreak === 'number' && parsed.longBreak > 0
            ? parsed.longBreak
            : DEFAULT_SETTINGS.longBreak,
        longBreakInterval:
          typeof parsed.longBreakInterval === 'number' && parsed.longBreakInterval > 0
            ? parsed.longBreakInterval
            : DEFAULT_SETTINGS.longBreakInterval,
      }
    }
  } catch {
    // 解析失败时回退默认值
  }
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(s: PomodoroSettings): void {
  try {
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // 忽略写入异常
  }
}

function loadStats(): PomodoroStats {
  const today = getTodayString()
  try {
    const raw = localStorage.getItem(STORAGE_STATS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PomodoroStats>
      const totalSessions =
        typeof parsed.totalSessions === 'number' ? parsed.totalSessions : 0
      // 同一天：保留当日数据；跨天：重置当日计数，保留累计
      if (parsed.date === today) {
        return {
          date: today,
          focusCount: typeof parsed.focusCount === 'number' ? parsed.focusCount : 0,
          focusMinutes: typeof parsed.focusMinutes === 'number' ? parsed.focusMinutes : 0,
          totalSessions,
        }
      }
      return { date: today, focusCount: 0, focusMinutes: 0, totalSessions }
    }
  } catch {
    // 忽略解析异常
  }
  return { date: today, focusCount: 0, focusMinutes: 0, totalSessions: 0 }
}

function saveStats(s: PomodoroStats): void {
  try {
    localStorage.setItem(STORAGE_STATS_KEY, JSON.stringify(s))
  } catch {
    // 忽略写入异常
  }
}

function getDurationSeconds(mode: TimerMode, s: PomodoroSettings): number {
  switch (mode) {
    case 'focus':
      return s.focusTime * 60
    case 'shortBreak':
      return s.shortBreak * 60
    case 'longBreak':
      return s.longBreak * 60
    default:
      return s.focusTime * 60
  }
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ============ 主组件 ============

export function PomodoroView({ tasks, onTaskClick, onToggleTask }: PomodoroViewProps) {
  const [mode, setMode] = useState<TimerMode>('focus')
  const [settings, setSettings] = useState<PomodoroSettings>(loadSettings)
  const [stats, setStats] = useState<PomodoroStats>(loadStats)
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    getDurationSeconds('focus', loadSettings())
  )
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState<boolean>(false)
  const [notification, setNotification] = useState<string | null>(null)

  // 使用 useRef 存储 interval id，避免闭包过期问题
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const incompleteTasks = tasks.filter((t) => !t.completed)
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null
  const totalSeconds = getDurationSeconds(mode, settings)
  const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 0
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress)
  const ringColor = MODE_CONFIG[mode].color
  const sessionsInCycle = stats.focusCount % settings.longBreakInterval

  // 计时器：运行时每秒递减（使用函数式更新避免闭包过期）
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0))
      }, 1000)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRunning])

  // 完成检测：当倒计时归零且仍在运行时触发
  // 依赖中包含 mode/stats/settings 以保证使用最新值，guard 保证仅在归零时执行
  useEffect(() => {
    if (secondsLeft !== 0 || !isRunning) return

    setIsRunning(false)
    let message = ''

    if (mode === 'focus') {
      const newFocusCount = stats.focusCount + 1
      const newStats: PomodoroStats = {
        ...stats,
        date: getTodayString(),
        focusCount: newFocusCount,
        focusMinutes: stats.focusMinutes + settings.focusTime,
        totalSessions: stats.totalSessions + 1,
      }
      setStats(newStats)
      saveStats(newStats)

      if (newFocusCount % settings.longBreakInterval === 0) {
        setMode('longBreak')
        setSecondsLeft(settings.longBreak * 60)
        message = `专注完成！已完成 ${newFocusCount} 次专注，建议长休息一下`
      } else {
        setMode('shortBreak')
        setSecondsLeft(settings.shortBreak * 60)
        message = `专注完成！今日已专注 ${newFocusCount} 次`
      }
    } else {
      setMode('focus')
      setSecondsLeft(settings.focusTime * 60)
      message = mode === 'longBreak' ? '长休息结束，继续专注吧' : '短休息结束，继续专注吧'
    }

    if (message) {
      setNotification(message)
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current)
      }
      notificationTimerRef.current = setTimeout(() => setNotification(null), 3500)
    }
  }, [secondsLeft, isRunning, mode, stats, settings])

  // 选中任务被完成或删除后自动清除选择
  useEffect(() => {
    if (selectedTaskId === null) return
    const t = tasks.find((x) => x.id === selectedTaskId)
    if (!t || t.completed) {
      setSelectedTaskId(null)
    }
  }, [tasks, selectedTaskId])

  // 卸载时清理定时器
  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current)
        notificationTimerRef.current = null
      }
    }
  }, [])

  // ============ 事件处理 ============

  function handleModeChange(m: TimerMode) {
    if (m === mode) return
    setMode(m)
    setIsRunning(false)
    setSecondsLeft(getDurationSeconds(m, settings))
  }

  function handleStartPause() {
    if (secondsLeft === 0) {
      setSecondsLeft(getDurationSeconds(mode, settings))
    }
    setIsRunning((r) => !r)
  }

  function handleReset() {
    setIsRunning(false)
    setSecondsLeft(getDurationSeconds(mode, settings))
  }

  function handleSettingChange<K extends keyof PomodoroSettings>(key: K, value: number) {
    if (!Number.isFinite(value)) return
    const safe = Math.max(1, Math.floor(value))
    const newSettings = { ...settings, [key]: safe }
    setSettings(newSettings)
    saveSettings(newSettings)
    // 非运行状态下实时更新当前模式剩余时间
    if (!isRunning) {
      setSecondsLeft(getDurationSeconds(mode, newSettings))
    }
  }

  function handleTaskSelect(value: string) {
    setSelectedTaskId(value === '' ? null : Number(value))
  }

  // ============ 渲染 ============

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="min-h-full flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-2xl flex flex-col items-center">
          {/* 标题栏 */}
          <div className="w-full flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">番茄钟</h2>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className={`p-2 rounded-lg transition-colors ${
                showSettings
                  ? 'text-[#378ADD] bg-blue-50'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              aria-label="设置"
              title="设置"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          {/* 轻提示通知 */}
          {notification && (
            <div className="mb-4 px-4 py-2.5 rounded-lg bg-white border border-gray-200 shadow-sm animate-slide-in-top flex items-center gap-2 max-w-full">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: ringColor }}
              />
              <span className="text-sm text-gray-700">{notification}</span>
            </div>
          )}

          {/* 模式切换 */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-8">
            {MODE_ORDER.map((m) => {
              const active = m === mode
              return (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
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
              onClick={handleStartPause}
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
              onClick={handleReset}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2 py-1"
              aria-label="重置"
            >
              重置
            </button>
          </div>

          {/* 当前进度圆点（距离长休息） */}
          <div className="flex items-center gap-1.5 mb-8">
            {Array.from({ length: settings.longBreakInterval }).map((_, i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full transition-colors"
                style={{ backgroundColor: i < sessionsInCycle ? ringColor : '#D1D5DB' }}
              />
            ))}
            <span className="ml-2 text-xs text-gray-400">
              {sessionsInCycle}/{settings.longBreakInterval} 至长休息
            </span>
          </div>

          {/* 任务选择器 */}
          <div className="w-full bg-white rounded-lg border border-gray-100 p-3 mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-2">专注任务</label>
            <select
              value={selectedTaskId ?? ''}
              onChange={(e) => handleTaskSelect(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
            >
              <option value="">选择一个任务…</option>
              {incompleteTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            {selectedTask && (
              <div className="mt-3 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={selectedTask.completed}
                  onChange={() => onToggleTask(selectedTask.id)}
                  className="w-4 h-4 rounded border-gray-300 text-[#378ADD] focus:ring-[#378ADD] cursor-pointer"
                />
                <button
                  onClick={() => onTaskClick(selectedTask.id)}
                  className="flex-1 text-left text-sm text-gray-700 truncate hover:text-[#378ADD] transition-colors"
                  title={selectedTask.title}
                >
                  {selectedTask.title}
                </button>
                {selectedTask.priority > 0 && (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor:
                        selectedTask.priority === 1
                          ? '#EF4444'
                          : selectedTask.priority === 2
                          ? '#F59E0B'
                          : '#10B981',
                    }}
                    title={`优先级：${selectedTask.priority === 1 ? '高' : selectedTask.priority === 2 ? '中' : '低'}`}
                  />
                )}
              </div>
            )}
            {incompleteTasks.length === 0 && (
              <p className="mt-2 text-xs text-gray-400">暂未完成专注任务，先去添加一个吧</p>
            )}
          </div>

          {/* 统计卡片 */}
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

          {/* 设置面板 */}
          {showSettings && (
            <div className="w-full bg-white rounded-lg border border-gray-100 p-4 mt-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">自定义时长</h3>
              <div className="grid grid-cols-2 gap-4">
                <SettingInput
                  label="专注时长（分钟）"
                  value={settings.focusTime}
                  onChange={(v) => handleSettingChange('focusTime', v)}
                />
                <SettingInput
                  label="短休息（分钟）"
                  value={settings.shortBreak}
                  onChange={(v) => handleSettingChange('shortBreak', v)}
                />
                <SettingInput
                  label="长休息（分钟）"
                  value={settings.longBreak}
                  onChange={(v) => handleSettingChange('longBreak', v)}
                />
                <SettingInput
                  label="长休息间隔（次）"
                  value={settings.longBreakInterval}
                  onChange={(v) => handleSettingChange('longBreakInterval', v)}
                />
              </div>
              <button
                onClick={() => {
                  setSettings({ ...DEFAULT_SETTINGS })
                  saveSettings({ ...DEFAULT_SETTINGS })
                  setSecondsLeft(getDurationSeconds(mode, { ...DEFAULT_SETTINGS }))
                }}
                className="text-xs text-gray-400 hover:text-[#378ADD] transition-colors"
              >
                恢复默认设置
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ 设置输入子组件 ============

function SettingInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
      />
    </div>
  )
}
