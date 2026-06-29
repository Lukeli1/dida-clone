import { useState, useEffect } from 'react'
import { isTauri, dataApi } from '../../api'
import type { ImportResult } from '../../api'
import { isEnabled, enable, disable } from '@tauri-apps/plugin-autostart'
import { save, open, confirm } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import { useToast } from '../Toast'
import { Toggle } from './Toggle'

type ExportFormat = 'json' | 'csv' | 'markdown'

interface ImportModalState {
  open: boolean
  fileName: string
  content: string
  mode: 'merge' | 'replace'
}

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

const EXPORT_OPTIONS: { format: ExportFormat; label: string; desc: string; ext: string }[] = [
  { format: 'json', label: 'JSON', desc: '完整数据备份', ext: '.json' },
  { format: 'csv', label: 'CSV', desc: '表格格式', ext: '.csv' },
  { format: 'markdown', label: 'Markdown', desc: '可读文档', ext: '.md' },
]

export function SystemPanel() {
  const toast = useToast()
  const [autoStart, setAutoStart] = useState(false)
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const [importModal, setImportModal] = useState<ImportModalState>({
    open: false,
    fileName: '',
    content: '',
    mode: 'merge',
  })
  const [importing, setImporting] = useState(false)

  // 初始化开机自启状态
  useEffect(() => {
    if (isTauri) {
      isEnabled().then(setAutoStart).catch(() => setAutoStart(false))
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
      // 弹出保存对话框，让用户选择保存位置
      const filePath = await save({
        defaultPath: `dida-export-${todayStr()}.${ext}`,
        filters: [{ name: label, extensions: [ext] }],
      })
      if (!filePath) return // 用户取消
      // 写入文件
      await writeTextFile(filePath, content)
      toast.success(`已导出 ${label} 文件`)
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
      const selected = await open({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (!selected) return // 用户取消
      // 读取文件内容
      const content = await readTextFile(selected)
      const fileName = selected.split(/[\\/]/).pop() || selected
      setImportModal({ open: true, fileName, content, mode: 'merge' })
    } catch (e) {
      console.error('读取文件失败', e)
      toast.error(`读取文件失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ===== 导入流程：确认导入 =====
  async function handleConfirmImport() {
    // 替换模式需要二次确认
    if (importModal.mode === 'replace') {
      const confirmed = await confirm('替换将清空所有现有数据，确定继续？', {
        title: '确认替换',
        kind: 'warning',
        okLabel: '确定替换',
        cancelLabel: '取消',
      })
      if (!confirmed) return
    }
    setImporting(true)
    try {
      const result = await dataApi.importJson(importModal.content, importModal.mode)
      toast.success(formatImportResult(result))
      setImportModal({ open: false, fileName: '', content: '', mode: 'merge' })
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
    setImportModal({ open: false, fileName: '', content: '', mode: 'merge' })
  }

  return (
    <div className="space-y-6">
      {/* ===== 开机自启 ===== */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-gray-900">开机自启</p>
            <p className="text-xs text-gray-500 mt-0.5">系统启动时自动打开应用</p>
          </div>
          <Toggle
            checked={autoStart}
            onChange={(v) => {
              setAutoStart(v)
              if (isTauri) {
                if (v) {
                  enable()
                } else {
                  disable()
                }
              }
            }}
          />
        </div>
      </div>

      {/* ===== 数据导出 ===== */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3.5 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-900">数据导出</p>
          <p className="text-xs text-gray-500 mt-0.5">选择格式将所有数据导出到文件</p>
        </div>
        <div className="p-4 grid grid-cols-3 gap-3">
          {EXPORT_OPTIONS.map(({ format, label, desc, ext }) => (
            <button
              key={format}
              onClick={() => handleExport(format)}
              disabled={exporting !== null}
              className="flex flex-col items-center gap-1.5 px-3 py-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-xs font-mono font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                {ext}
              </span>
              <span className="text-sm font-medium text-gray-900">{label}</span>
              <span className="text-xs text-gray-400">{exporting === format ? '导出中...' : desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ===== 数据导入 ===== */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3.5 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-900">数据导入</p>
          <p className="text-xs text-gray-500 mt-0.5">从 JSON 备份文件导入数据</p>
        </div>
        <div className="px-4 py-3.5">
          <button
            onClick={handleSelectFile}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm font-medium text-gray-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            选择文件导入
          </button>
        </div>
      </div>

      {/* ===== 导入模式选择弹窗 ===== */}
      {importModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closeImportModal}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-[440px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">导入数据</h3>
              <button
                onClick={closeImportModal}
                disabled={importing}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* 文件信息 */}
              <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-lg">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm text-gray-700 truncate">{importModal.fileName}</span>
              </div>

              {/* 模式选择 */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">导入模式</p>
                <div className="space-y-2">
                  {/* 合并 */}
                  <button
                    onClick={() => setImportModal((s) => ({ ...s, mode: 'merge' }))}
                    disabled={importing}
                    className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg border text-left transition-colors ${
                      importModal.mode === 'merge'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                        importModal.mode === 'merge' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`}
                    >
                      {importModal.mode === 'merge' && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">合并</p>
                      <p className="text-xs text-gray-500 mt-0.5">将导入数据添加到现有数据中，不会删除现有内容</p>
                    </div>
                  </button>

                  {/* 替换 */}
                  <button
                    onClick={() => setImportModal((s) => ({ ...s, mode: 'replace' }))}
                    disabled={importing}
                    className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg border text-left transition-colors ${
                      importModal.mode === 'replace'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                        importModal.mode === 'replace' ? 'border-red-500 bg-red-500' : 'border-gray-300'
                      }`}
                    >
                      {importModal.mode === 'replace' && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">替换</p>
                      <p className="text-xs text-gray-500 mt-0.5">清空所有现有数据，然后导入新数据</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* 替换模式警告 */}
              {importModal.mode === 'replace' && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-xs text-red-600">替换将清空所有现有数据，此操作不可恢复，请谨慎操作。</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
              <button
                onClick={closeImportModal}
                disabled={importing}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
                  importModal.mode === 'replace' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {importing ? '导入中...' : '确认导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
