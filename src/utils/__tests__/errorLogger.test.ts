import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadErrorLogs,
  logError,
  clearErrorLogs,
  exportErrorLogs,
  MAX_LOGS,
} from '../errorLogger'

describe('errorLogger 错误日志持久化', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // ===== loadErrorLogs =====
  describe('loadErrorLogs', () => {
    it('localStorage 为空时返回空数组', () => {
      expect(loadErrorLogs()).toEqual([])
    })

    it('已存储数据时正确读回', () => {
      const logs = [
        { id: '1', timestamp: '2026-01-01T00:00:00.000Z', message: 'err1', url: '', userAgent: '' },
      ]
      localStorage.setItem('error_logs', JSON.stringify(logs))
      expect(loadErrorLogs()).toEqual(logs)
    })

    it('localStorage 内容为损坏 JSON 时返回空数组（不抛错）', () => {
      localStorage.setItem('error_logs', 'not-a-json{')
      expect(loadErrorLogs()).toEqual([])
    })

    it('localStorage 内容为非数组 JSON 时直接返回解析结果', () => {
      // loadErrorLogs 只做 JSON.parse，不校验类型；调用方负责处理
      localStorage.setItem('error_logs', JSON.stringify({ foo: 'bar' }))
      expect(loadErrorLogs()).toEqual({ foo: 'bar' })
    })
  })

  // ===== logError =====
  describe('logError', () => {
    it('添加一条日志并持久化到 localStorage', () => {
      const err = new Error('测试错误')
      err.stack = 'Error: 测试错误\n  at foo:1:1'
      logError(err)

      const logs = loadErrorLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].message).toBe('测试错误')
      expect(logs[0].stack).toBe(err.stack)
    })

    it('生成 id 且格式正确（时间戳-随机串）', () => {
      logError(new Error('e1'))
      const logs = loadErrorLogs()
      expect(logs[0].id).toMatch(/^\d+-[a-z0-9]{6}$/)
    })

    it('生成 ISO 时间戳', () => {
      logError(new Error('e1'))
      const logs = loadErrorLogs()
      expect(new Date(logs[0].timestamp).toISOString()).toBe(logs[0].timestamp)
    })

    it('新日志插入到数组头部（unshift）', () => {
      logError(new Error('first'))
      logError(new Error('second'))
      const logs = loadErrorLogs()
      expect(logs).toHaveLength(2)
      expect(logs[0].message).toBe('second')
      expect(logs[1].message).toBe('first')
    })

    it('componentStack 被正确存储', () => {
      logError(new Error('e1'), 'in Component\n  at Foo')
      const logs = loadErrorLogs()
      expect(logs[0].componentStack).toBe('in Component\n  at Foo')
    })

    it('记录 url 与 userAgent', () => {
      logError(new Error('e1'))
      const logs = loadErrorLogs()
      expect(typeof logs[0].url).toBe('string')
      expect(typeof logs[0].userAgent).toBe('string')
    })

    it('超过 MAX_LOGS 条时截断到 MAX_LOGS（丢弃最旧）', () => {
      // 写入 MAX_LOGS + 5 条
      for (let i = 0; i < MAX_LOGS + 5; i++) {
        logError(new Error(`err-${i}`))
      }
      const logs = loadErrorLogs()
      expect(logs).toHaveLength(MAX_LOGS)
      // 最新的在头部，应是最后写入的 err-(MAX_LOGS+4)
      expect(logs[0].message).toBe(`err-${MAX_LOGS + 4}`)
      // 最旧的被丢弃，不应包含 err-0
      expect(logs.find((l) => l.message === 'err-0')).toBeUndefined()
    })

    it('每条日志 id 唯一', () => {
      for (let i = 0; i < 10; i++) logError(new Error(`e-${i}`))
      const logs = loadErrorLogs()
      const ids = logs.map((l) => l.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  // ===== clearErrorLogs =====
  describe('clearErrorLogs', () => {
    it('清除已存储的日志', () => {
      logError(new Error('e1'))
      expect(loadErrorLogs()).toHaveLength(1)
      clearErrorLogs()
      expect(loadErrorLogs()).toEqual([])
      expect(localStorage.getItem('error_logs')).toBeNull()
    })

    it('无日志时调用不抛错', () => {
      expect(() => clearErrorLogs()).not.toThrow()
    })
  })

  // ===== exportErrorLogs =====
  describe('exportErrorLogs', () => {
    it('空日志时返回 "[]" 的 JSON 字符串', () => {
      expect(exportErrorLogs()).toBe('[]')
    })

    it('有日志时返回格式化的 JSON 字符串，可被解析回原数据', () => {
      logError(new Error('exp-1'))
      logError(new Error('exp-2'))
      const exported = exportErrorLogs()
      // 应为格式化 JSON（含缩进）
      expect(exported).toContain('exp-1')
      expect(exported).toContain('exp-2')
      const parsed = JSON.parse(exported)
      expect(parsed).toHaveLength(2)
      expect(parsed[0].message).toBe('exp-2')
    })
  })

  // ===== localStorage 异常容错 =====
  describe('localStorage 异常容错', () => {
    it('loadErrorLogs 在 getItem 抛错时返回空数组', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage error')
      })
      expect(loadErrorLogs()).toEqual([])
      spy.mockRestore()
    })

    it('logError 在 setItem 抛错时不抛出（静默丢弃）', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded')
      })
      expect(() => logError(new Error('e1'))).not.toThrow()
      spy.mockRestore()
    })

    it('clearErrorLogs 在 removeItem 抛错时不抛出', () => {
      const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('storage error')
      })
      expect(() => clearErrorLogs()).not.toThrow()
      spy.mockRestore()
    })
  })
})
