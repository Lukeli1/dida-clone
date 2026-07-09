import { useState, useEffect } from 'react'
import { isTauri, dataApi } from '../../api'
import { exportTextFile, importTextFile } from '../../api/fileApi'
import type { ImportResult } from '../../api'
import { isEnabled, enable, disable } from '@tauri-apps/plugin-autostart'
import { useToast } from '../Toast'
import { useConfirm } from '../common/ConfirmDialog'
import { Toggle } from './Toggle'
import { DataPanel, type ExportFormat } from './system/DataPanel'
import { CleanupPanel, type ImportModalState } from './system/CleanupPanel'
import { ErrorLogPanel } from './system/ErrorLogPanel'
import { SnapshotPanel } from './system/SnapshotPanel'
import { SyncLogPanel } from './system/SyncLogPanel'

/** 当天日期字符串，用于生成导出文件名，如 2026-06-29 */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 将 ImportResult 格式化为用户可读的摘要 */
function formatImportResult(r: ImportResult): string {
  const parts: string[] = []
  if (r.lists_imported) parts.push(`${r.lists_imported} 个清单`)
  if (r.tasks_imported) parts.push(`${r.tasks_imported} 条任务`)
  if (r.tags_imported) parts.push(`${r.tags_imported} 个标签`)
  if (r.habits_imported) parts.push(`${r.habits_imported} 个习惯`)
  if (r.habit_records_imported) parts.push(`${r.habit_records_imported} 条打卡记录`)
  if (parts.length === 0) return '导入完成（无新增数据）'
  return `导入成功：${parts.join('、')}`
}

export function SystemPanel() {
  const toast = useToast()
  const confirm = useConfirm()
  const [autoStart, setAutoStart] = useState(false)
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const [importModal, setImportModal] = useState<ImportModalState>({
    open: false,
    fileName: '',
    content: '',
    mode: 'merge',
    previewResult: null,
    previewing: false,
  })
  const [importing, setImporting] = useState(false)

  // 初始化开机自启状态
  useEffect(() => {
    if (isTauri) {
      isEnabled()
        .then(setAutoStart)
        .catch(() => setAutoStart(false))
    }
  }, [])

  // ===== 导出流程 =====
  async function handleExport(format: ExportFormat) {
    setExporting(format)
    try {
      let content: string
      let ext: string
      let label: string
      if (format === 'json') {
        content = await dataApi.exportJson()
        ext = 'json'
        label = 'JSON'
      } else if (format === 'csv') {
        content = await dataApi.exportCsv()
        ext = 'csv'
        label = 'CSV'
      } else {
        content = await dataApi.exportMarkdown()
        ext = 'md'
        label = 'Markdown'
      }
      // 通过后端受控命令弹出保存对话框并写入（取代前端直接 plugin-fs）
      const savedPath = await exportTextFile({
        defaultName: `dida-export-${todayStr()}.${ext}`,
        filters: [{ name: label, extensions: ext }],
        content,
      })
      if (savedPath) toast.success(`已导出 ${label} 文件`)
    } catch (e) {
      console.error('导出失败', e)
      toast.error(`导出失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExporting(null)
    }
  }

  // ===== 导入流程：选择文件 =====
  async function handleSelectFile() {
    try {
      const result = await importTextFile({
        filters: [{ name: 'JSON', extensions: 'json' }],
      })
      if (!result) return // 用户取消
      const [fileName, content] = result
      setImportModal({ open: true, fileName, content, mode: 'merge', previewResult: null, previewing: false })
    } catch (e) {
      console.error('读取文件失败', e)
      toast.error(`读取文件失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ===== 导入流程：预览 =====
  async function handlePreview() {
    setImportModal((s) => ({ ...s, previewing: true }))
    try {
      const preview = await dataApi.importJsonPreview(importModal.content, importModal.mode)
      setImportModal((s) => ({ ...s, previewResult: preview }))
    } catch (e) {
      console.error('预览失败', e)
      toast.error(`预览失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImportModal((s) => ({ ...s, previewing: false }))
    }
  }

  // ===== 导入流程：确认导入 =====
  async function handleConfirmImport() {
    // 替换模式需要二次确认
    if (importModal.mode === 'replace') {
      const confirmed = await confirm({
        message: '替换将清空所有现有数据，确定继续？',
        title: '确认替换',
        danger: true,
        confirmText: '确定替换',
        cancelText: '取消',
      })
      if (!confirmed) return
    }
    setImporting(true)
    try {
      const result = await dataApi.importJson(importModal.content, importModal.mode)
      toast.success(formatImportResult(result))
      setImportModal({ open: false, fileName: '', content: '', mode: 'merge', previewResult: null, previewing: false })
      // 延迟刷新页面，让 toast 先显示（习惯数据为组件本地状态，需整页刷新）
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      console.error('导入失败', e)
      toast.error(`导入失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImporting(false)
    }
  }

  function closeImportModal() {
    if (importing) return
    setImportModal({ open: false, fileName: '', content: '', mode: 'merge', previewResult: null, previewing: false })
  }

  function handleImportModeChange(mode: 'merge' | 'replace') {
    // 切换模式时清除预览结果
    setImportModal((s) => ({ ...s, mode, previewResult: null }))
  }

  function handleAutoStartChange(v: boolean) {
    setAutoStart(v)
    if (isTauri) {
      if (v) enable()
      else disable()
    }
  }

  return (
    <div className="space-y-6">
      {/* ===== 开机自启 ===== */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">开机自启</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">系统启动时自动打开应用</p>
          </div>
          <Toggle checked={autoStart} onChange={handleAutoStartChange} />
        </div>
      </div>

      <DataPanel exporting={exporting} onExport={handleExport} onSelectFile={handleSelectFile} />

      <CleanupPanel
        importModal={importModal}
        importing={importing}
        onConfirmImport={handleConfirmImport}
        onCloseImportModal={closeImportModal}
        onImportModeChange={handleImportModeChange}
        onPreview={handlePreview}
      />

      <SnapshotPanel toast={toast} />

      <SyncLogPanel toast={toast} />

      <ErrorLogPanel toast={toast} />
    </div>
  )
}
