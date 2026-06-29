import { useState, useEffect, useRef } from 'react'
import type { Task } from '../../types'
import type { TimerMode, PomodoroSettings, PomodoroStats } from './storage'
import { DEFAULT_SETTINGS, getDurationSeconds, getTodayString, loadSettings, loadStats, saveSettings, saveStats } from './storage'
import { MODE_CONFIG, PomodoroTimer } from './PomodoroTimer'
import { PomodoroSettingsPanel } from './PomodoroSettings'
import { PomodoroStatsPanel } from './PomodoroStats'

interface PomodoroViewProps {
  tasks: Task[]
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
}

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

  function handleResetDefaults() {
    setSettings({ ...DEFAULT_SETTINGS })
    saveSettings({ ...DEFAULT_SETTINGS })
    setSecondsLeft(getDurationSeconds(mode, { ...DEFAULT_SETTINGS }))
  }

  function handleTaskSelect(value: string) {
    setSelectedTaskId(value === '' ? null : Number(value))
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-bg-secondary)]">
      <div className="min-h-full flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-2xl flex flex-col items-center">
          {/* 标题栏 */}
          <div className="w-full flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">番茄钟</h2>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className={`p-2 rounded-lg transition-colors ${
                showSettings
                  ? 'text-[var(--color-accent)] bg-[var(--color-accent-light)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
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
            <div className="mb-4 px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm animate-slide-in-top flex items-center gap-2 max-w-full">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: ringColor }}
              />
              <span className="text-sm text-[var(--color-text-secondary)]">{notification}</span>
            </div>
          )}

          {/* 计时器（模式切换 + 圆环 + 控制按钮 + 进度圆点） */}
          <PomodoroTimer
            mode={mode}
            secondsLeft={secondsLeft}
            totalSeconds={totalSeconds}
            isRunning={isRunning}
            sessionsInCycle={sessionsInCycle}
            longBreakInterval={settings.longBreakInterval}
            onModeChange={handleModeChange}
            onStartPause={handleStartPause}
            onReset={handleReset}
          />

          {/* 任务选择器 */}
          <div className="w-full bg-[var(--color-surface)] rounded-lg border border-[var(--color-border-light)] p-3 mb-4">
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">专注任务</label>
            <select
              value={selectedTaskId ?? ''}
              onChange={(e) => handleTaskSelect(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] bg-[var(--color-surface)]"
            >
              <option value="">选择一个任务…</option>
              {incompleteTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            {selectedTask && (
              <div className="mt-3 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--color-bg-secondary)] transition-colors">
                <input
                  type="checkbox"
                  checked={selectedTask.completed}
                  onChange={() => onToggleTask(selectedTask.id)}
                  className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)] cursor-pointer"
                />
                <button
                  onClick={() => onTaskClick(selectedTask.id)}
                  className="flex-1 text-left text-sm text-[var(--color-text-secondary)] truncate hover:text-[var(--color-accent)] transition-colors"
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
              <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">暂未完成专注任务，先去添加一个吧</p>
            )}
          </div>

          {/* 统计卡片 */}
          <PomodoroStatsPanel stats={stats} />

          {/* 设置面板 */}
          {showSettings && (
            <PomodoroSettingsPanel
              settings={settings}
              onSettingChange={handleSettingChange}
              onResetDefaults={handleResetDefaults}
            />
          )}
        </div>
      </div>
    </div>
  )
}
