import { describe, it, expect } from 'vitest'
import type { SyncConfig, SyncType, WebDavSyncResult } from '../../types/sync'

/**
 * WebDAV 同步工具函数 + 类型验证测试（P11-04）
 *
 * 对应 Rust 端 webdav_sync.rs 的 URL 拼接逻辑和前端的 SyncConfig 类型。
 */

/**
 * 模拟 Rust 端 WebDavClient::build_url 的 URL 拼接逻辑。
 * 规则：base 去尾斜杠 + path 去首斜杠 + "/" 连接。
 */
function buildWebDavUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '')
  const p = path.replace(/^\/+/, '')
  if (!p) return b
  return `${b}/${p}`
}

/**
 * 模拟 Rust 端 ensure_remote_dir 的路径拆分逻辑。
 * 将 /dida-clone/dida.db 拆分为目录层级 ["dida-clone"] + 文件名 "dida.db"
 */
function splitRemotePath(remotePath: string): { dirs: string[]; filename: string } {
  const parts = remotePath.split('/').filter((s) => s.length > 0)
  if (parts.length === 0) return { dirs: [], filename: '' }
  return {
    dirs: parts.slice(0, -1),
    filename: parts[parts.length - 1],
  }
}

describe('WebDAV URL 拼接', () => {
  it('正常拼接：base 带尾斜杠 + path 带首斜杠', () => {
    expect(buildWebDavUrl('https://dav.jianguoyun.com/dav/', '/dida-clone/dida.db'))
      .toBe('https://dav.jianguoyun.com/dav/dida-clone/dida.db')
  })

  it('无尾斜杠的 base', () => {
    expect(buildWebDavUrl('https://dav.jianguoyun.com/dav', '/dida-clone/dida.db'))
      .toBe('https://dav.jianguoyun.com/dav/dida-clone/dida.db')
  })

  it('无首斜杠的 path', () => {
    expect(buildWebDavUrl('https://dav.jianguoyun.com/dav/', 'dida-clone/dida.db'))
      .toBe('https://dav.jianguoyun.com/dav/dida-clone/dida.db')
  })

  it('多个尾斜杠的 base', () => {
    expect(buildWebDavUrl('https://dav.jianguoyun.com/dav///', '/dida-clone/dida.db'))
      .toBe('https://dav.jianguoyun.com/dav/dida-clone/dida.db')
  })

  it('Nextcloud 风格 URL', () => {
    expect(buildWebDavUrl('https://cloud.example.com/remote.php/dav/files/user/', '/dida-clone/dida.db'))
      .toBe('https://cloud.example.com/remote.php/dav/files/user/dida-clone/dida.db')
  })

  it('群晖 NAS 风格 URL（带端口号）', () => {
    expect(buildWebDavUrl('https://nas.local:5006/', '/dida-clone/dida.db'))
      .toBe('https://nas.local:5006/dida-clone/dida.db')
  })

  it('空 path 返回 base', () => {
    expect(buildWebDavUrl('https://dav.jianguoyun.com/dav/', ''))
      .toBe('https://dav.jianguoyun.com/dav')
  })
})

describe('远程路径拆分', () => {
  it('正常路径拆分', () => {
    const result = splitRemotePath('/dida-clone/dida.db')
    expect(result.dirs).toEqual(['dida-clone'])
    expect(result.filename).toBe('dida.db')
  })

  it('多级目录路径拆分', () => {
    const result = splitRemotePath('/a/b/c/dida.db')
    expect(result.dirs).toEqual(['a', 'b', 'c'])
    expect(result.filename).toBe('dida.db')
  })

  it('无目录的路径', () => {
    const result = splitRemotePath('/dida.db')
    expect(result.dirs).toEqual([])
    expect(result.filename).toBe('dida.db')
  })

  it('空路径', () => {
    const result = splitRemotePath('/')
    expect(result.dirs).toEqual([])
    expect(result.filename).toBe('')
  })
})

describe('SyncConfig 类型验证', () => {
  it('Git 配置包含必要字段', () => {
    const config: SyncConfig = {
      repo_url: 'https://github.com/user/repo.git',
      branch: 'main',
      auto_sync: true,
      auto_sync_interval_secs: 900,
      sync_type: 'git',
    }
    expect(config.sync_type).toBe('git')
    expect(config.webdav_url).toBeUndefined()
  })

  it('WebDAV 配置包含 WebDAV 字段', () => {
    const config: SyncConfig = {
      repo_url: '',
      branch: '',
      auto_sync: false,
      auto_sync_interval_secs: 900,
      sync_type: 'webdav',
      webdav_url: 'https://dav.jianguoyun.com/dav/',
      webdav_username: 'user@example.com',
      webdav_password: 'app-password',
      webdav_remote_path: '/dida-clone/dida.db',
    }
    expect(config.sync_type).toBe('webdav')
    expect(config.webdav_url).toBe('https://dav.jianguoyun.com/dav/')
    expect(config.webdav_password).toBe('app-password')
  })

  it('sync_type 可为空字符串（向后兼容旧配置）', () => {
    const config: SyncConfig = {
      repo_url: 'https://github.com/user/repo.git',
      branch: 'main',
      auto_sync: false,
      auto_sync_interval_secs: 900,
      sync_type: '',
    }
    // 空值视为 git
    const effectiveType: SyncType = config.sync_type === 'webdav' ? 'webdav' : 'git'
    expect(effectiveType).toBe('git')
  })

  it('WebDAV 字段可为 null（未配置时）', () => {
    const config: SyncConfig = {
      repo_url: 'https://github.com/user/repo.git',
      branch: 'main',
      auto_sync: false,
      auto_sync_interval_secs: 900,
      sync_type: 'git',
      webdav_url: null,
      webdav_username: null,
      webdav_password: null,
      webdav_remote_path: null,
    }
    expect(config.webdav_url).toBeNull()
  })
})

describe('WebDavSyncResult 类型验证', () => {
  it('接受 upload 结果', () => {
    const result: WebDavSyncResult = 'upload'
    expect(result).toBe('upload')
  })

  it('接受 download 结果', () => {
    const result: WebDavSyncResult = 'download'
    expect(result).toBe('download')
  })

  it('接受 no-change 结果', () => {
    const result: WebDavSyncResult = 'no-change'
    expect(result).toBe('no-change')
  })
})
