import { describe, it, expect, beforeEach } from 'vitest'
import type { ConflictStrategy } from '../SyncConflictDialog'
import { useUIStore } from '../../../stores/uiStore'

/**
 * 同步冲突解决 UI 测试（P11-05）
 *
 * 验证：
 * 1. ConflictStrategy 类型仅接受 local / remote / backup
 * 2. uiStore.syncConflict 状态的设置与清除
 * 3. 冲突错误信息检测逻辑（包含 conflict 或 冲突 关键词）
 */

/** 检查错误信息是否为同步冲突（模拟 SyncPanel 中的检测逻辑） */
function isConflictError(msg: string): boolean {
  return msg.includes('conflict') || msg.includes('冲突')
}

describe('ConflictStrategy 类型验证', () => {
  it('接受 local 策略', () => {
    const strategy: ConflictStrategy = 'local'
    expect(strategy).toBe('local')
  })

  it('接受 remote 策略', () => {
    const strategy: ConflictStrategy = 'remote'
    expect(strategy).toBe('remote')
  })

  it('接受 backup 策略', () => {
    const strategy: ConflictStrategy = 'backup'
    expect(strategy).toBe('backup')
  })

  it('三种策略构成完整集合', () => {
    const allStrategies: ConflictStrategy[] = ['local', 'remote', 'backup']
    expect(allStrategies).toHaveLength(3)
    expect(new Set(allStrategies).size).toBe(3)
  })
})

describe('uiStore syncConflict 状态', () => {
  beforeEach(() => {
    useUIStore.getState().setSyncConflict(null)
  })

  it('初始状态为 null', () => {
    expect(useUIStore.getState().syncConflict).toBeNull()
  })

  it('setSyncConflict 设置冲突信息', () => {
    useUIStore.getState().setSyncConflict({
      message: '检测到同步冲突 (conflict)：本地和远程数据均已修改',
    })
    const state = useUIStore.getState().syncConflict
    expect(state).not.toBeNull()
    expect(state!.message).toContain('conflict')
  })

  it('setSyncConflict(null) 清除冲突状态', () => {
    useUIStore.getState().setSyncConflict({ message: '冲突' })
    expect(useUIStore.getState().syncConflict).not.toBeNull()

    useUIStore.getState().setSyncConflict(null)
    expect(useUIStore.getState().syncConflict).toBeNull()
  })

  it('支持中文冲突信息', () => {
    useUIStore.getState().setSyncConflict({
      message: '检测到数据库冲突。本地版本已备份。',
    })
    expect(useUIStore.getState().syncConflict!.message).toContain('冲突')
  })
})

describe('冲突错误检测逻辑', () => {
  it('检测英文 conflict 关键词', () => {
    expect(isConflictError('sync conflict detected')).toBe(true)
    expect(isConflictError('CONFLICT')).toBe(false) // 大小写敏感
  })

  it('检测中文 冲突 关键词', () => {
    expect(isConflictError('检测到同步冲突')).toBe(true)
    expect(isConflictError('数据冲突，请处理')).toBe(true)
  })

  it('非冲突错误返回 false', () => {
    expect(isConflictError('网络连接失败')).toBe(false)
    expect(isConflictError('push 失败')).toBe(false)
    expect(isConflictError('authentication error')).toBe(false)
  })

  it('Git 冲突错误信息可被检测', () => {
    const gitConflictMsg =
      '检测到同步冲突 (conflict)。本地数据库已备份为 dida.db.local.bak，远程版本已加载到同步目录，请选择处理方式。'
    expect(isConflictError(gitConflictMsg)).toBe(true)
  })

  it('WebDAV 冲突错误信息可被检测', () => {
    const webdavConflictMsg = '检测到同步冲突 (conflict)：本地和远程数据均已修改，请选择保留方式。'
    expect(isConflictError(webdavConflictMsg)).toBe(true)
  })
})
