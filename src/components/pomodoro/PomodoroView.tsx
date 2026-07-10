import { useState, useEffect, useRef } from 'react'
import type { Task } from '../../types'
import type { TimerMode, PomodoroSettings, PomodoroStats } from './storage'
import {
  DEFAULT_SETTINGS,
  getDurationSeconds,
  getTodayString,
  loadSettings,
  loadStats,
  saveSettings,
  saveStats,
} from './storage'
import { MODE_CONFIG, PomodoroTimer } from './PomodoroTimer'
import { PomodoroSettingsPanel } from './PomodoroSettings'
import { PomodoroStatsPanel } from './PomodoroStats'
import { PRIORITY_STYLES } from '../../utils/priority'
import { EmptyState } from '../EmptyState'
import { timeTrackingApi } from '../../api/timeTrackingApi'

interface PomodoroViewProps {
  tasks: Task[]
  onTaskClick: (taskId: number) => void
  onToggleTask: (taskId: number) => void
}

export function PomodoroView({ tasks, onTaskClick, onToggleTask }: PomodoroViewProps) {
  const [mode, setMode] = useState<TimerMode>('focus')
  const [settings, setSettings] = useState<PomodoroSettings>(loadSettings)
  const [stats, setStats] = useState<PomodoroStats>(loadStats)
  const [secondsLeft, setSecondsLeft] = useState<number>(() => getDurationSeconds('focus', loadSettings()))
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState<boolean>(false)
  const [notification, setNotification] = useState<string | null>(null)

  // 使用 useRef 存储 interval id，避免闭包过期问题
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 锁定本次 session 的专注总秒数，防止运行中修改 settings 导致写入口径偏差
  const sessionDurationRef = useRef<number>(0)

  const incompleteTasks = tasks.filter((t) => !t.completed)
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null
  const totalSeconds = getDurationSeconds(mode, settings)
  const ringColor = MODE_CONFIG[mode].color
  const sessionsInCycle = ((stats.focusCount - 1) % settings.longBreakInterval) + 1

  // 更新 document.title
  useEffect(() => {
    function formatTime(sec: number): string {
      const m = Math.floor(Math.max(0, sec) / 60)
      const s = Math.max(0, sec) % 60
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    if (isRunning) {
      const modeLabel = MODE_CONFIG[mode].label
      document.title = `「${formatTime(secondsLeft)}」${modeLabel}中 - 滴答清单`
    } else if (secondsLeft < totalSeconds && secondsLeft > 0) {
      document.title = '已暂停 - 滴答清单'
    } else {
      document.title = '滴答清单'
    }
    return () => {
      document.title = '滴答清单'
    }
  }, [isRunning, secondsLeft, totalSeconds, mode])

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
      // 使用 sessionDurationRef 锁定值统一更新 focusMinutes，避免与 time_entries 分叉
      const focusMinutesAdded = Math.round((sessionDurationRef.current || settings.focusTime * 60) / 60)
      const newStats: PomodoroStats = {
        ...stats,
        date: getTodayString(),
        focusCount: newFocusCount,
        focusMinutes: stats.focusMinutes + focusMinutesAdded,
        totalSessions: stats.totalSessions + 1,
      }
      setStats(newStats)
      saveStats(newStats)

      // 番茄钟专注完成后，写入 time_entries 历史记录
      // 使用 sessionDurationRef 锁定启动时的专注时长，避免运行中修改 settings 导致偏差
      if (selectedTaskId !== null) {
        const durationSecs = sessionDurationRef.current || settings.focusTime * 60
        const endTimeIso = new Date().toISOString()
        const startTimeIso = new Date(Date.now() - durationSecs * 1000).toISOString()
        timeTrackingApi
          .addTimeEntry({
            taskId: selectedTaskId,
            startTime: startTimeIso,
            endTime: endTimeIso,
            durationSecs,
            note: '番茄钟专注',
          })
          .catch((err: unknown) => {
            // 写入失败不阻断番茄钟流程，但给用户明确提示
            const msg = err instanceof Error ? err.message : String(err)
            console.error('番茄钟专注时间写入失败:', msg)
            setNotification(`专注时间记录失败: ${msg}`)
            if (notificationTimerRef.current) {
              clearTimeout(notificationTimerRef.current)
            }
            notificationTimerRef.current = setTimeout(() => setNotification(null), 5000)
          })
      }

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

    // 发送浏览器通知
    try {
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          const notifBody = mode === 'focus' ? '休息一下吧！' : '继续专注吧！'
          new Notification('番茄钟完成', { body: notifBody })
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission()
        }
      }
    } catch {
      // Notification API 不可用时静默忽略
    }
  }, [secondsLeft, isRunning, mode, stats, settings, selectedTaskId])

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
    sessionDurationRef.current = 0
    setSecondsLeft(getDurationSeconds(m, settings))
  }

  function handleStartPause() {
    if (secondsLeft === 0) {
      setSecondsLeft(getDurationSeconds(mode, settings))
    }
    // 启动时锁定本次 session 时长
    if (!isRunning) {
      sessionDurationRef.current = getDurationSeconds(mode, settings)
    }
    setIsRunning((r) => !r)
  }

  function handleReset() {
    setIsRunning(false)
    sessionDurationRef.current = 0
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
    <div className="flex flex-col h-full">
      <header className="border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">番茄钟</h2>
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
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
          {/* 轻提示通知 */}
          {notification && (
            <div className="mb-4 px-4 py-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm animate-slide-in-top flex items-center gap-2 max-w-full">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ringColor }} />
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
                      backgroundColor: PRIORITY_STYLES[selectedTask.priority]?.hex || PRIORITY_STYLES[0].hex,
                    }}
                    title={`优先级：${PRIORITY_STYLES[selectedTask.priority]?.label || '无'}`}
                  />
                )}
              </div>
            )}
            {incompleteTasks.length === 0 && <EmptyState title="暂无专注任务" subtitle="先去添加一个任务吧" />}
          </div>

          {/* 统计卡片 */}
          <PomodoroStatsPanel stats={stats} />

          {/* 设置面板（展开/收起动画） */}
          <div
            className={`w-full grid transition-[grid-template-rows] duration-200 ease-out ${showSettings ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            aria-hidden={!showSettings}
          >
            <div className="overflow-hidden">
              <PomodoroSettingsPanel
                settings={settings}
                onSettingChange={handleSettingChange}
                onResetDefaults={handleResetDefaults}
                disabled={isRunning}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
