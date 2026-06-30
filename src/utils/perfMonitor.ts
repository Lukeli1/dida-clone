/**
 * 性能监控工具（P12-07）
 *
 * 记录关键操作耗时并持久化到 localStorage，供设置面板查看 / 清除，
 * 用于持续监控性能回归。
 *
 * 存储结构：localStorage['perf_records'] = JSON.stringify(PerfRecord[])
 * 上限 MAX_RECORDS 条，超出后丢弃最旧的一条（新记录插在数组头部，与 errorLogger 一致）。
 *
 * 设计要点：
 * - 所有 localStorage / 解析操作均 try-catch，永不抛错（避免性能记录本身引发二次错误）
 * - measure / measureAsync 使用 performance.now()，在浏览器与 Tauri WebView 中均可用
 * - measure / measureAsync 无论 fn 成功或失败都会记录耗时（finally 保证），失败时 rethrow 原错误
 */

export interface PerfRecord {
  /** 操作名，如 "loadTasks" / "loadLists" / "loadTags" */
  name: string
  /** 耗时（毫秒） */
  duration: number
  /** 记录时间戳（Date.now()，毫秒） */
  timestamp: number
}

const PERF_KEY = 'perf_records'
export const MAX_RECORDS = 200

/**
 * 从 localStorage 读取全部性能记录。
 * - 未存储 / 解析失败时返回空数组，绝不抛错。
 */
export function getPerfRecords(): PerfRecord[] {
  try {
    const data = localStorage.getItem(PERF_KEY)
    return data ? (JSON.parse(data) as PerfRecord[]) : []
  } catch {
    return []
  }
}

/**
 * 记录一条性能数据并持久化。
 * 新记录插在数组头部（newest first），超过 MAX_RECORDS 条时截断丢弃最旧的。
 */
export function recordPerf(name: string, duration: number): void {
  try {
    const records = getPerfRecords()
    records.unshift({ name, duration, timestamp: Date.now() })
    if (records.length > MAX_RECORDS) records.length = MAX_RECORDS
    localStorage.setItem(PERF_KEY, JSON.stringify(records))
  } catch {
    // localStorage 满或不可用时静默丢弃，避免性能记录本身引发二次错误
  }
}

/**
 * 清空全部性能记录。
 */
export function clearPerfRecords(): void {
  try {
    localStorage.removeItem(PERF_KEY)
  } catch {
    // 忽略
  }
}

/**
 * 测量异步函数执行时间并记录。
 * 无论 fn 成功或失败均会记录耗时；fn 失败时 rethrow 原始错误。
 */
export async function measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    return await fn()
  } finally {
    recordPerf(name, performance.now() - start)
  }
}

/**
 * 测量同步函数执行时间并记录。
 * 无论 fn 成功或失败均会记录耗时；fn 失败时 rethrow 原始错误。
 */
export function measure<T>(name: string, fn: () => T): T {
  const start = performance.now()
  try {
    return fn()
  } finally {
    recordPerf(name, performance.now() - start)
  }
}

export interface PerfStat {
  /** 操作名 */
  name: string
  /** 记录次数 */
  count: number
  /** 平均耗时（毫秒，保留 2 位小数） */
  avg: number
  /** 最大耗时（毫秒，保留 2 位小数） */
  max: number
  /** 最近一次耗时（毫秒，保留 2 位小数） */
  last: number
}

/** 保留 2 位小数（毫秒级显示足够精确） */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * 获取性能统计（按操作名分组）。
 * - count: 该操作的记录次数
 * - avg:   平均耗时
 * - max:   最大耗时
 * - last:  最近一次耗时
 *
 * records 按时间倒序存储（newest first），故首次遇到某 name 即为其最近一次记录，
 * 后续遇到同名记录不再覆盖 last。
 */
export function getPerfStats(): PerfStat[] {
  try {
    const records = getPerfRecords()
    const map = new Map<
      string,
      { count: number; total: number; max: number; last: number }
    >()
    for (const r of records) {
      const existing = map.get(r.name)
      if (existing) {
        existing.count += 1
        existing.total += r.duration
        if (r.duration > existing.max) existing.max = r.duration
        // last 保持首次遇到（最新）的值，不覆盖
      } else {
        map.set(r.name, {
          count: 1,
          total: r.duration,
          max: r.duration,
          last: r.duration,
        })
      }
    }
    const stats: PerfStat[] = []
    for (const [name, s] of map) {
      stats.push({
        name,
        count: s.count,
        avg: round2(s.total / s.count),
        max: round2(s.max),
        last: round2(s.last),
      })
    }
    return stats
  } catch {
    return []
  }
}
