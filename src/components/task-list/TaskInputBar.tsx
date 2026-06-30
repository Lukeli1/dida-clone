import { useState, useEffect, useRef, type RefObject } from 'react'
import { parseSmartDate } from '../../utils/smartDate'
import { templateApi } from '../../api'
import { useUIStore } from '../../stores/uiStore'
import { useTaskStore } from '../../stores/taskStore'
import { useToast } from '../Toast'
import type { TaskTemplate } from '../../types/template'

interface TaskInputBarProps {
  newTaskInputRef: RefObject<HTMLInputElement>
  newTaskTitle: string
  setNewTaskTitle: (val: string) => void
  aiMode: boolean
  aiParsing: boolean
  setAiMode: (val: boolean) => void
  handleCreateTask: () => void
}

/** 新建任务输入栏（含 AI 模式切换 + 智能日期识别预览 + 从模板创建） */
export function TaskInputBar({ newTaskInputRef, newTaskTitle, setNewTaskTitle, aiMode, aiParsing, setAiMode, handleCreateTask }: TaskInputBarProps) {
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const selectedListId = useUIStore(s => s.selectedListId)
  const loadTasks = useTaskStore(s => s.loadTasks)

  // 点击外部关闭模板下拉
  useEffect(() => {
    if (!showTemplateDropdown) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTemplateDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTemplateDropdown])

  // 首次打开时加载模板列表
  useEffect(() => {
    if (showTemplateDropdown && !templatesLoaded) {
      templateApi.getTemplates()
        .then(setTemplates)
        .catch(e => console.error('加载模板列表失败:', e))
        .finally(() => setTemplatesLoaded(true))
    }
  }, [showTemplateDropdown, templatesLoaded])

  async function handleApplyTemplate(template: TaskTemplate) {
    try {
      const listId = selectedListId ?? 1
      await templateApi.applyTemplate(template.id, listId)
      await loadTasks()
      toast.success(`已从模板「${template.name}」创建任务`)
      setShowTemplateDropdown(false)
    } catch (e) {
      console.error('应用模板失败:', e)
      toast.error('创建失败，请重试')
    }
  }

  return (
    <div className="task-input-bar px-4 pb-2 pt-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex gap-2.5">
        <div className="flex-1 relative">
          <input
            ref={newTaskInputRef}
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !aiParsing && handleCreateTask()}
            disabled={aiParsing}
            placeholder={aiMode ? '试试输入：明天下午3点开会，优先级高' : '添加新任务... (试试：明天下午3点开会)'}
            className={`w-full pl-4 pr-28 py-2.5 text-[14px] border rounded-xl transition-all duration-200 focus:outline-none focus:ring-[3px] disabled:opacity-50 ${
              aiMode
                ? 'border-purple-300 bg-purple-50/30 focus:border-purple-400 focus:ring-purple-100'
                : 'border-[var(--color-border)] bg-[var(--color-bg)] focus:border-[var(--color-accent)] focus:ring-[var(--color-accent-light)]'
            }`}
          />
          <button
            onClick={() => { setAiMode(!aiMode); newTaskInputRef.current?.focus() }}
            className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-all duration-200 active:scale-95 ${
              aiMode
                ? 'bg-purple-500 text-white shadow-sm hover:bg-purple-600'
                : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
            }`}
            title={aiMode ? '关闭 AI 模式' : '开启 AI 自然语言输入'}
          >
            {aiMode ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            )}
            AI
          </button>
          {/* 智能日期识别预览 */}
          {!aiMode && newTaskTitle.trim() && (() => {
            const preview = parseSmartDate(newTaskTitle.trim())
            const hasParsed = preview.dueDate || (preview.priority !== undefined && preview.priority > 0) || preview.repeatRule
            if (!hasParsed) return null
            return (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--color-accent-light)] border border-[var(--color-accent-light)] rounded-xl px-4 py-2 text-xs text-[var(--color-accent-text)] flex items-center gap-3 z-10 shadow-sm animate-float-up">
                <span className="flex items-center gap-1.5 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  智能识别
                </span>
                {preview.dueDate && (
                  <span className="flex items-center gap-1">📅 {new Date(preview.dueDate).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                )}
                {preview.priority !== undefined && preview.priority > 0 && (
                  <span>🔥 {preview.priority === 1 ? '高优先级' : preview.priority === 2 ? '中优先级' : '低优先级'}</span>
                )}
                {preview.repeatRule && (<span>🔁 重复</span>)}
              </div>
            )
          })()}
        </div>

        {/* 从模板创建按钮 */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
            disabled={aiParsing}
            className="px-3 py-2.5 text-[14px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-xl transition-all duration-200 hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50 flex items-center justify-center"
            title="从模板创建任务"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
          </button>
          {/* 模板下拉列表 */}
          {showTemplateDropdown && (
            <div className="absolute top-full right-0 mt-2 w-72 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg py-1.5 z-50 animate-scale-in max-h-80 overflow-y-auto">
              {templates.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-[var(--color-text-tertiary)]">暂无模板</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">在「模板」视图中创建模板</p>
                </div>
              ) : (
                <>
                  <p className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider px-3 py-1.5 border-b border-[var(--color-border)] mb-1">
                    从模板创建
                  </p>
                  {templates.map(template => (
                    <button
                      key={template.id}
                      onClick={() => handleApplyTemplate(template)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors rounded-lg mx-1 w-[calc(100%-8px)]"
                    >
                      <span className="text-lg flex-shrink-0">{template.icon ?? '📋'}</span>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-medium text-[var(--color-text-primary)] truncate">{template.name}</p>
                        {template.subtask_templates.length > 0 && (
                          <p className="text-xs text-[var(--color-text-tertiary)]">
                            含 {template.subtask_templates.length} 个子任务
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <button
          onClick={handleCreateTask}
          disabled={aiParsing}
          className={`px-6 py-2.5 text-white text-[14px] font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm active:scale-[0.97] ${
            aiMode
              ? 'bg-purple-500 hover:bg-purple-600 hover:shadow-md'
              : 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] hover:shadow-md'
          }`}
        >
          {aiParsing && (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {aiParsing ? '解析中...' : aiMode ? 'AI 创建' : '添加'}
        </button>
      </div>
      {aiMode && (
        <p className="mt-2 text-xs text-purple-500 flex items-center gap-1.5 font-medium">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          AI 模式：用自然语言描述任务，AI 会自动识别时间、优先级
        </p>
      )}
    </div>
  )
}
