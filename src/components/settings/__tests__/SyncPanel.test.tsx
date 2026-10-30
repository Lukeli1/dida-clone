import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncConfig, SyncStatus } from '../../../types/sync'
import { useUIStore } from '../../../stores/uiStore'

vi.mock('../../../api', () => ({
  isTauri: true,
  syncApi: {
    getConfig: vi.fn(),
    saveConfig: vi.fn(),
    initRepo: vi.fn(),
    syncNow: vi.fn(),
    getStatus: vi.fn(),
    webdavTestConnection: vi.fn(),
    webdavSync: vi.fn(),
    webdavUpload: vi.fn(),
    webdavDownload: vi.fn(),
    resolveSyncConflict: vi.fn(),
  },
}))

vi.mock('../../../api/secretApi', () => ({
  getSecret: vi.fn(),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
  SECRET_KEYS: { webdavPassword: 'webdav_password' },
}))

import { syncApi } from '../../../api'
import { getSecret, setSecret, deleteSecret } from '../../../api/secretApi'
import SyncPanel from '../SyncPanel'

const baseConfig: SyncConfig = {
  repo_url: 'https://github.com/example/dida-data.git',
  branch: 'main',
  auto_sync: false,
  auto_sync_interval_secs: 900,
  sync_type: 'webdav',
  webdav_url: 'https://dav.jianguoyun.com/dav/',
  webdav_username: 'tester',
  webdav_password: null,
  webdav_remote_path: '/dida-clone/dida.db',
}

const baseStatus: SyncStatus = {
  enabled: true,
  ahead: 0,
  behind: 0,
  last_sync: new Date().toISOString(),
  has_conflict: false,
  conflict_message: null,
}

const LONG_ERROR =
  '无法连接到 https://dav.an-extremely-long-provider-name-for-layout-validation.example.com/remote.php/dav/files/layout-validator/，请检查网络、证书和凭据是否正确。'

function setDefaults(overrides?: { config?: SyncConfig | null; status?: SyncStatus | null }) {
  vi.mocked(syncApi.getConfig).mockResolvedValue(
    overrides && 'config' in overrides ? overrides.config ?? null : baseConfig,
  )
  vi.mocked(syncApi.getStatus).mockResolvedValue(
    overrides && 'status' in overrides ? overrides.status ?? baseStatus : baseStatus,
  )
  vi.mocked(syncApi.saveConfig).mockResolvedValue(undefined)
  vi.mocked(syncApi.initRepo).mockResolvedValue(undefined)
  vi.mocked(syncApi.syncNow).mockResolvedValue(baseStatus)
  vi.mocked(syncApi.webdavTestConnection).mockResolvedValue(true)
  vi.mocked(syncApi.webdavSync).mockResolvedValue('no-change')
  vi.mocked(syncApi.resolveSyncConflict).mockResolvedValue(undefined)
  vi.mocked(getSecret).mockResolvedValue('')
  vi.mocked(setSecret).mockResolvedValue(undefined)
  vi.mocked(deleteSecret).mockResolvedValue(undefined)
}

async function waitForLoadedPanel() {
  await waitFor(() => {
    expect(screen.getByTestId('sync-type-webdav')).toBeInTheDocument()
  })
}

describe('SyncPanel 数据同步设置', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUIStore.setState({ syncConflict: null })
    setDefaults()
  })

  it('加载期间显示稳定状态，完成后展示已保存配置与同步摘要', async () => {
    render(<SyncPanel />)

    expect(screen.getByTestId('sync-loading')).toBeInTheDocument()
    expect(screen.getByTestId('sync-loading')).toHaveAttribute('role', 'status')

    await waitForLoadedPanel()
    expect(screen.getByLabelText('WebDAV 服务地址')).toHaveValue(baseConfig.webdav_url)
    expect(screen.getByLabelText('用户名')).toHaveValue('tester')
    expect(screen.getByLabelText('远程文件路径')).toHaveValue('/dida-clone/dida.db')
    expect(screen.getByTestId('sync-status-summary')).toHaveTextContent('数据已是最新，与远程一致')
    expect(screen.getByRole('switch', { name: '自动同步' })).not.toBeChecked()
  })

  it('测试连接失败时在 alert 区域展示可换行的完整错误，并恢复按钮可用', async () => {
    vi.mocked(syncApi.webdavTestConnection).mockRejectedValue(new Error(LONG_ERROR))
    render(<SyncPanel />)
    await waitForLoadedPanel()

    const testButton = screen.getByTestId('sync-webdav-test')
    fireEvent.click(testButton)

    await waitFor(() => {
      const alert = screen.getByTestId('sync-error')
      expect(alert).toHaveAttribute('role', 'alert')
      expect(alert).toHaveTextContent(LONG_ERROR)
    })
    expect(testButton).toBeEnabled()
    expect(screen.getByLabelText('关闭错误提示')).toBeInTheDocument()
  })

  it('切换同步方式后显示 Git 配置并调用既有保存接口', async () => {
    render(<SyncPanel />)
    await waitForLoadedPanel()

    fireEvent.click(screen.getByTestId('sync-type-git'))

    await waitFor(() => {
      expect(screen.getByLabelText('仓库 URL')).toHaveValue(baseConfig.repo_url)
      expect(screen.getByTestId('sync-type-git')).toHaveAttribute('aria-pressed', 'true')
    })
    expect(syncApi.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ sync_type: 'git' }))
  })

  it('自动同步与间隔选项保持既有保存行为和无障碍状态', async () => {
    render(<SyncPanel />)
    await waitForLoadedPanel()

    fireEvent.click(screen.getByRole('switch', { name: '自动同步' }))
    await waitFor(() => {
      expect(screen.getByTestId('sync-interval-options')).toBeInTheDocument()
      expect(syncApi.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ auto_sync: true }))
    })

    const intervalButton = screen.getByRole('button', { name: '30 分钟' })
    fireEvent.click(intervalButton)
    await waitFor(() => {
      expect(intervalButton).toHaveAttribute('aria-pressed', 'true')
    })
    expect(syncApi.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ auto_sync_interval_secs: 1800 }),
    )
  })

  it('存在冲突时展示完整冲突说明与处理入口', async () => {
    const conflictMessage =
      '本地数据库与远程仓库在多个任务字段上存在冲突：任务标题、完成状态、截止日期、标签关联和重复规则均被同时修改。'
    setDefaults({
      status: {
        ...baseStatus,
        ahead: 2,
        behind: 1,
        has_conflict: true,
        conflict_message: conflictMessage,
      },
    })

    render(<SyncPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('sync-conflict')).toBeInTheDocument()
    })
    expect(screen.getByTestId('sync-conflict')).toHaveAttribute('role', 'alert')
    expect(screen.getByTestId('sync-conflict')).toHaveTextContent(conflictMessage)
    expect(screen.getByTestId('sync-use-remote')).toBeEnabled()
    expect(screen.getByTestId('sync-dismiss-conflict')).toBeEnabled()
  })

  it('WebDAV 普通“立即同步”调用 webdavSync，不触发强制下载', async () => {
    vi.mocked(syncApi.webdavSync).mockResolvedValue('upload')

    render(<SyncPanel />)
    await waitForLoadedPanel()
    expect(syncApi.getStatus).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('sync-now'))

    await waitFor(() => {
      expect(screen.getByTestId('sync-success')).toHaveTextContent('已上传本地数据到 WebDAV')
    })
    expect(syncApi.webdavSync).toHaveBeenCalledTimes(1)
    expect(syncApi.webdavDownload).not.toHaveBeenCalled()
    expect(syncApi.syncNow).not.toHaveBeenCalled()
    expect(syncApi.getStatus).toHaveBeenCalledTimes(2)
  })

  it('WebDAV 冲突下“使用远程版本”强制下载远程数据库并收敛冲突状态', async () => {
    const conflictStatus: SyncStatus = {
      ...baseStatus,
      ahead: 2,
      behind: 1,
      has_conflict: true,
      conflict_message: '本地数据库与远程文件均已被修改，请选择处理方式。',
    }
    setDefaults({ status: conflictStatus })
    // 初始化读取到冲突状态；强制下载后的刷新返回已收敛状态
    vi.mocked(syncApi.getStatus)
      .mockResolvedValueOnce(conflictStatus)
      .mockResolvedValue({ ...baseStatus, has_conflict: false, conflict_message: null })
    vi.mocked(syncApi.webdavDownload).mockResolvedValue(undefined)

    render(<SyncPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('sync-conflict')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('sync-use-remote'))

    await waitFor(() => {
      expect(screen.getByTestId('sync-success')).toHaveTextContent('已使用远程数据覆盖本地')
    })
    expect(syncApi.webdavDownload).toHaveBeenCalledTimes(1)
    expect(syncApi.webdavSync).not.toHaveBeenCalled()
    expect(syncApi.syncNow).not.toHaveBeenCalled()
    expect(syncApi.getStatus).toHaveBeenCalledTimes(2)
    await waitFor(() => {
      expect(screen.queryByTestId('sync-conflict')).not.toBeInTheDocument()
    })
  })

  it('WebDAV 强制下载成功但状态刷新失败时保留覆盖成功并单独提示刷新失败', async () => {
    const conflictStatus: SyncStatus = {
      ...baseStatus,
      ahead: 2,
      behind: 1,
      has_conflict: true,
      conflict_message: '远程文件与本地数据库存在冲突。',
    }
    setDefaults({ status: conflictStatus })
    // 初始化读取到冲突状态；覆盖后的状态刷新失败
    vi.mocked(syncApi.getStatus)
      .mockResolvedValueOnce(conflictStatus)
      .mockRejectedValue(new Error('读取同步状态失败'))
    vi.mocked(syncApi.webdavDownload).mockResolvedValue(undefined)

    render(<SyncPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('sync-conflict')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('sync-use-remote'))

    await waitFor(() => {
      expect(screen.getByTestId('sync-success')).toHaveTextContent('已使用远程数据覆盖本地')
      expect(screen.getByTestId('sync-error')).toHaveTextContent(
        '同步状态刷新失败：读取同步状态失败（远程数据覆盖已生效）',
      )
    })
    // 下载已成功，错误区不得使用“同步失败”的误导措辞
    expect(screen.getByTestId('sync-error')).not.toHaveTextContent('同步失败')
    expect(syncApi.webdavDownload).toHaveBeenCalledTimes(1)
    expect(syncApi.webdavSync).not.toHaveBeenCalled()
    expect(syncApi.syncNow).not.toHaveBeenCalled()
    expect(syncApi.getStatus).toHaveBeenCalledTimes(2)
    // 覆盖已生效，冲突面板应本地收敛，主同步按钮恢复可用
    expect(screen.queryByTestId('sync-conflict')).not.toBeInTheDocument()
    expect(screen.getByTestId('sync-now')).toBeEnabled()
  })

  it('WebDAV 强制下载失败时展示错误、不显示成功并恢复按钮可用', async () => {
    const conflictStatus: SyncStatus = {
      ...baseStatus,
      has_conflict: true,
      conflict_message: '远程文件与本地数据库存在冲突。',
    }
    setDefaults({ status: conflictStatus })
    vi.mocked(syncApi.webdavDownload).mockRejectedValue(new Error('远程文件不存在'))

    render(<SyncPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('sync-conflict')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('sync-use-remote'))

    await waitFor(() => {
      expect(screen.getByTestId('sync-error')).toHaveTextContent('同步失败：远程文件不存在')
    })
    expect(screen.getByTestId('sync-error')).not.toHaveTextContent('已使用远程数据覆盖本地')
    expect(screen.queryByTestId('sync-success')).not.toBeInTheDocument()
    expect(syncApi.webdavDownload).toHaveBeenCalledTimes(1)
    expect(syncApi.webdavSync).not.toHaveBeenCalled()
    expect(syncApi.getStatus).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(screen.getByTestId('sync-use-remote')).toBeEnabled()
    })
  })

  it('Git 模式普通“立即同步”保持既有 syncNow 语义', async () => {
    setDefaults({
      config: { ...baseConfig, sync_type: 'git' },
      status: { ...baseStatus, ahead: 1 },
    })

    render(<SyncPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('sync-type-git')).toHaveAttribute('aria-pressed', 'true')
    })

    fireEvent.click(screen.getByTestId('sync-now'))
    await waitFor(() => {
      expect(screen.getByTestId('sync-success')).toHaveTextContent('同步成功')
    })
    expect(syncApi.syncNow).toHaveBeenCalledTimes(1)
    expect(syncApi.webdavSync).not.toHaveBeenCalled()
    expect(syncApi.webdavDownload).not.toHaveBeenCalled()
  })

  it('Git 模式“使用远程版本”仍走 syncNow 并沿用冲突解决提示', async () => {
    setDefaults({
      config: { ...baseConfig, sync_type: 'git' },
      status: {
        ...baseStatus,
        has_conflict: true,
        conflict_message: '本地与远程仓库存在 Git 冲突。',
      },
    })

    render(<SyncPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('sync-conflict')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('sync-use-remote'))

    await waitFor(() => {
      expect(screen.getByTestId('sync-success')).toHaveTextContent('已使用远程版本解决冲突')
    })
    expect(syncApi.syncNow).toHaveBeenCalledTimes(1)
    expect(syncApi.webdavDownload).not.toHaveBeenCalled()
    expect(syncApi.webdavSync).not.toHaveBeenCalled()
  })
})
