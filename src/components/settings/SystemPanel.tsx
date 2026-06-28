import { useState, useEffect } from 'react'
import { isTauri } from '../../api'
import { isEnabled, enable, disable } from '@tauri-apps/plugin-autostart'
import { Toggle } from './Toggle'

export function SystemPanel() {
  const [autoStart, setAutoStart] = useState(false)

  // 初始化开机自启状态
  useEffect(() => {
    if (isTauri) {
      isEnabled().then(setAutoStart).catch(() => setAutoStart(false))
    }
  }, [])

  async function handleExportData() {
    try {
      const { api } = await import('../../api')
      const tasks = await api.getTasks()
      const json = JSON.stringify(tasks, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dida-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('导出失败', e)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-gray-900">开机自启</p>
            <p className="text-xs text-gray-500 mt-0.5">系统启动时自动打开应用</p>
          </div>
          <Toggle checked={autoStart} onChange={(v) => {
            setAutoStart(v)
            if (isTauri) {
              if (v) { enable() } else { disable() }
            }
          }} />
        </div>
        <button
          onClick={handleExportData}
          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
        >
          <div>
            <p className="text-sm font-medium text-gray-900">导出数据</p>
            <p className="text-xs text-gray-500 mt-0.5">备份所有任务到 JSON 文件</p>
          </div>
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l3 3m0 0l-3 3m3-3H8" />
          </svg>
        </button>
      </div>
    </div>
  )
}
