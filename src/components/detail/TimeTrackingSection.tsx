import { useState, useEffect, useRef, useCallback } from 'react'
import type { Task } from '../../types'
import type { TimeEntry } from '../../api/timeTrackingApi'
import { timeTrackingApi } from '../../api/timeTrackingApi'
import { useToast } from '../Toast'

interface TimeTrackingSectionProps {
  task: Task
}

/** localStorage 持久化计时状态的结构 */
interface TrackingState {
  entryId: number
  startTs: number
}

const RECENT_LIMIT = 5

/** 格式化秒数为人类可读字符串：h/m/s */
export function formatDuration(secs: number): string {
  const safe = Math.max(0, Math.floor(secs))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  if (h > 0) return `${h}h${m}m`
  if (m > 0) return `${m}m${s}s`
  return `${s}s`
}

/** 格式化日期用于历史记录展示 */
function formatStartTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/** 时间追踪区块：开始/停止计时、实时时长、历史记录、累计时间 */
export function TimeTrackingSection({ task }: TimeTrackingSectionProps) {
  const toast = useToast()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [totalSeconds, setTotalSeconds] = useState(0)
  const [activeEntryId, setActiveEntryId] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0) // 计时中实时已过秒数
  const [toggling, setToggling] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTsRef = useRef<number | null>(null)

  const storageKey = `time_tracking_${task.id}`

  /** 读取 localStorage 恢复计时状态 */
  const restoreTracking = useCallback(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const saved: TrackingState = JSON.parse(raw)
      if (saved && typeof saved.entryId === 'number' && typeof saved.startTs === 'number') {
        setActiveEntryId(saved.entryId)
        startTsRef.current = saved.startTs
        const now = Date.now()
        setElapsed(Math.floor((now - saved.startTs) / 1000))
      }
    } catch {
      // 损坏的存储忽略
    }
  }, [storageKey])

  /** 加载历史记录与累计时间 */
  const loadEntries = useCallback(async () => {
    try {
      const list = await timeTrackingApi.getTimeEntries(task.id)
      setEntries(list)
      const total = list.reduce((sum, e) => sum + (e.duration_secs || 0), 0)
      setTotalSeconds(total)
    } catch (e: any) {
      console.error('加载时间记录失败', e)
    }
  }, [task.id])

  // 任务切换时加载数据并恢复计时状态
  useEffect(() => {
    loadEntries()
    setActiveEntryId(null)
    startTsRef.current = null
    setElapsed(0)
    restoreTracking()
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [task.id, loadEntries, restoreTracking])

  // 启动/停止每秒更新计时器
  useEffect(() => {
    if (activeEntryId !== null && startTsRef.current !== null) {
      // 立即刷新一次
      setElapsed(Math.floor((Date.now() - (startTsRef.current as number)) / 1000))
      timerRef.current = setInterval(() => {
        if (startTsRef.current !== null) {
          setElapsed(Math.floor((Date.now() - (startTsRef.current as number)) / 1000))
        }
      }, 1000)
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [activeEntryId])

  /** 开始计时 */
  async function handleStart() {
    if (activeEntryId !== null) return
    setToggling(true)
    try {
      const entryId = await timeTrackingApi.startTimeTracking(task.id)
      const startTs = Date.now()
      setActiveEntryId(entryId)
      startTsRef.current = startTs
      setElapsed(0)
      const state: TrackingState = { entryId, startTs }
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch (e: any) {
      toast.error(`开始计时失败: ${e.message || e}`)
    } finally {
      setToggling(false)
    }
  }

  /** 停止计时 */
  async function handleStop() {
    if (activeEntryId === null) return
    setToggling(true)
    try {
      await timeTrackingApi.stopTimeTracking(activeEntryId)
      localStorage.removeItem(storageKey)
      setActiveEntryId(null)
      startTsRef.current = null
      setElapsed(0)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      await loadEntries()
      toast.success(`已记录 ${formatDuration(elapsed)}`)
    } catch (e: any) {
      toast.error(`停止计时失败: ${e.message || e}`)
    } finally {
      setToggling(false)
    }
  }

  /** 删除一条历史记录 */
  async function handleDelete(entryId: number) {
    try {
      await timeTrackingApi.deleteTimeEntry(entryId)
      await loadEntries()
      toast.info('已删除记录')
    } catch (e: any) {
      toast.error(`删除记录失败: ${e.message || e}`)
    }
  }

  const isTracking = activeEntryId !== null
  const recentEntries = entries.slice(0, RECENT_LIMIT)

  return (
    <div className="relative">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--color-text-tertiary)]">时间追踪</span>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          累计 {formatDuration(totalSeconds)}
        </span>
      </div>

      {/* 计时控制区 */}
      <div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--color-bg-secondary)]">
        {/* 计时图标 */}
        <svg
          className={`w-5 h-5 shrink-0 ${isTracking ? 'text-[var(--color-accent)] animate-pulse' : 'text-[var(--color-text-tertiary)]'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="9" strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7v5l3 2" />
        </svg>

        {/* 实时时长 */}
        <span className="flex-1 text-sm font-mono tabular-nums text-[var(--color-text-primary)]">
          {isTracking ? formatDuration(elapsed) : '未开始'}
        </span>

        {/* 开始/停止按钮 */}
        {isTracking ? (
          <button
            onClick={handleStop}
            disabled={toggling}
            className="px-3 py-1 text-xs rounded-md bg-[var(--color-danger)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            停止计时
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={toggling}
            className="px-3 py-1 text-xs rounded-md bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50"
          >
            开始计时
          </button>
        )}
      </div>

      {/* 历史记录列表 */}
      {recentEntries.length > 0 && (
        <div className="mt-2 space-y-1">
          {recentEntries.map((entry) => (
            <div
              key={entry.id}
              className="group flex items-center gap-2 px-2 py-1 rounded text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
            >
              <span className="flex-1 truncate">{formatStartTime(entry.start_time)}</span>
              <span className="font-mono tabular-nums text-[var(--color-text-primary)]">
                {formatDuration(entry.duration_secs)}
              </span>
              <button
                onClick={() => handleDelete(entry.id)}
                className="opacity-0 group-hover:opacity-100 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-opacity shrink-0"
                title="删除记录"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
