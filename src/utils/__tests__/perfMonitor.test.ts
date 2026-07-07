import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getPerfRecords,
  recordPerf,
  clearPerfRecords,
  measureAsync,
  measure,
  getPerfStats,
  MAX_RECORDS,
} from '../perfMonitor'

describe('perfMonitor 性能监控持久化', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // ===== getPerfRecords =====
  describe('getPerfRecords', () => {
    it('localStorage 为空时返回空数组', () => {
      expect(getPerfRecords()).toEqual([])
    })

    it('已存储数据时正确读回', () => {
      const records = [{ name: 'loadTasks', duration: 12.5, timestamp: 1000 }]
      localStorage.setItem('perf_records', JSON.stringify(records))
      expect(getPerfRecords()).toEqual(records)
    })

    it('localStorage 内容为损坏 JSON 时返回空数组（不抛错）', () => {
      localStorage.setItem('perf_records', 'not-a-json{')
      expect(getPerfRecords()).toEqual([])
    })
  })

  // ===== recordPerf =====
  describe('recordPerf', () => {
    it('添加一条记录并持久化到 localStorage', () => {
      recordPerf('loadTasks', 10.5)
      const records = getPerfRecords()
      expect(records).toHaveLength(1)
      expect(records[0].name).toBe('loadTasks')
      expect(records[0].duration).toBe(10.5)
    })

    it('生成 timestamp（Date.now 毫秒）', () => {
      const before = Date.now()
      recordPerf('op', 1)
      const after = Date.now()
      const records = getPerfRecords()
      expect(records[0].timestamp).toBeGreaterThanOrEqual(before)
      expect(records[0].timestamp).toBeLessThanOrEqual(after)
    })

    it('新记录插入到数组头部（unshift，newest first）', () => {
      recordPerf('op', 1)
      recordPerf('op', 2)
      const records = getPerfRecords()
      expect(records).toHaveLength(2)
      // 最新的在头部
      expect(records[0].duration).toBe(2)
      expect(records[1].duration).toBe(1)
    })

    it('超过 MAX_RECORDS 条时截断到 MAX_RECORDS（丢弃最旧）', () => {
      for (let i = 0; i < MAX_RECORDS + 5; i++) {
        recordPerf(`op-${i}`, i)
      }
      const records = getPerfRecords()
      expect(records).toHaveLength(MAX_RECORDS)
      // 最新的在头部，应是最后写入的 op-(MAX_RECORDS+4)
      expect(records[0].name).toBe(`op-${MAX_RECORDS + 4}`)
      // 最旧的被丢弃
      expect(records.find((r) => r.name === 'op-0')).toBeUndefined()
    })
  })

  // ===== clearPerfRecords =====
  describe('clearPerfRecords', () => {
    it('清除已存储的记录', () => {
      recordPerf('op', 1)
      expect(getPerfRecords()).toHaveLength(1)
      clearPerfRecords()
      expect(getPerfRecords()).toEqual([])
      expect(localStorage.getItem('perf_records')).toBeNull()
    })

    it('无记录时调用不抛错', () => {
      expect(() => clearPerfRecords()).not.toThrow()
    })
  })

  // ===== measureAsync =====
  describe('measureAsync', () => {
    it('返回 fn 的结果并记录耗时', async () => {
      const result = await measureAsync('asyncOp', async () => 42)
      expect(result).toBe(42)
      const records = getPerfRecords()
      expect(records).toHaveLength(1)
      expect(records[0].name).toBe('asyncOp')
      expect(records[0].duration).toBeGreaterThanOrEqual(0)
    })

    it('fn 失败时仍记录耗时并 rethrow 原错误', async () => {
      const err = new Error('boom')
      await expect(
        measureAsync('asyncFail', async () => {
          throw err
        }),
      ).rejects.toThrow('boom')
      const records = getPerfRecords()
      expect(records).toHaveLength(1)
      expect(records[0].name).toBe('asyncFail')
    })
  })

  // ===== measure =====
  describe('measure', () => {
    it('返回 fn 的结果并记录耗时', () => {
      const result = measure('syncOp', () => 'hello')
      expect(result).toBe('hello')
      const records = getPerfRecords()
      expect(records).toHaveLength(1)
      expect(records[0].name).toBe('syncOp')
      expect(records[0].duration).toBeGreaterThanOrEqual(0)
    })

    it('fn 失败时仍记录耗时并 rethrow 原错误', () => {
      expect(() =>
        measure('syncFail', () => {
          throw new Error('sync boom')
        }),
      ).toThrow('sync boom')
      const records = getPerfRecords()
      expect(records).toHaveLength(1)
      expect(records[0].name).toBe('syncFail')
    })
  })

  // ===== getPerfStats =====
  describe('getPerfStats', () => {
    it('无记录时返回空数组', () => {
      expect(getPerfStats()).toEqual([])
    })

    it('按 name 分组统计 count / avg / max / last', () => {
      // loadTasks: 3 条（按时间顺序写入 10, 20, 30，存储后 newest=30 在头部）
      recordPerf('loadTasks', 10)
      recordPerf('loadTasks', 20)
      recordPerf('loadTasks', 30)
      // loadLists: 1 条
      recordPerf('loadLists', 5)

      const stats = getPerfStats()
      const taskStat = stats.find((s) => s.name === 'loadTasks')!
      expect(taskStat.count).toBe(3)
      expect(taskStat.avg).toBe(Math.round(((10 + 20 + 30) / 3) * 100) / 100)
      expect(taskStat.max).toBe(30)
      expect(taskStat.last).toBe(30) // 最新写入的是 30

      const listStat = stats.find((s) => s.name === 'loadLists')!
      expect(listStat.count).toBe(1)
      expect(listStat.avg).toBe(5)
      expect(listStat.max).toBe(5)
      expect(listStat.last).toBe(5)
    })

    it('last 反映最近一次耗时（newest first，不随后续记录覆盖）', () => {
      recordPerf('op', 100) // 最早
      recordPerf('op', 200) // 最近
      const stats = getPerfStats()
      expect(stats[0].last).toBe(200)
    })

    it('avg / max / last 保留 2 位小数', () => {
      recordPerf('op', 10.123456)
      recordPerf('op', 20.987654)
      const stats = getPerfStats()
      // avg = (10.123456 + 20.987654) / 2 = 15.555555 -> 15.56
      expect(stats[0].avg).toBe(15.56)
      // max = 20.987654 -> 20.99
      expect(stats[0].max).toBe(20.99)
      // last = 20.987654 -> 20.99
      expect(stats[0].last).toBe(20.99)
    })

    it('不同 name 各自独立统计', () => {
      recordPerf('a', 1)
      recordPerf('b', 2)
      recordPerf('a', 3)
      const stats = getPerfStats()
      expect(stats).toHaveLength(2)
      const a = stats.find((s) => s.name === 'a')!
      const b = stats.find((s) => s.name === 'b')!
      expect(a.count).toBe(2)
      expect(b.count).toBe(1)
    })
  })

  // ===== localStorage 异常容错 =====
  describe('localStorage 异常容错', () => {
    it('getPerfRecords 在 getItem 抛错时返回空数组', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage error')
      })
      expect(getPerfRecords()).toEqual([])
      spy.mockRestore()
    })

    it('recordPerf 在 setItem 抛错时不抛出（静默丢弃）', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded')
      })
      expect(() => recordPerf('op', 1)).not.toThrow()
      spy.mockRestore()
    })

    it('clearPerfRecords 在 removeItem 抛错时不抛出', () => {
      const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('storage error')
      })
      expect(() => clearPerfRecords()).not.toThrow()
      spy.mockRestore()
    })

    it('getPerfStats 在解析失败时返回空数组', () => {
      localStorage.setItem('perf_records', 'corrupted{')
      expect(getPerfStats()).toEqual([])
    })
  })
})
