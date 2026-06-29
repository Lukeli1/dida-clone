import { type RefObject } from 'react'
import { parseSmartDate } from '../../utils/smartDate'

interface TaskInputBarProps {
  newTaskInputRef: RefObject<HTMLInputElement>
  newTaskTitle: string
  setNewTaskTitle: (val: string) => void
  aiMode: boolean
  aiParsing: boolean
  setAiMode: (val: boolean) => void
  handleCreateTask: () => void
}

/** 新建任务输入栏（含 AI 模式切换 + 智能日期识别预览） */
export function TaskInputBar({ newTaskInputRef, newTaskTitle, setNewTaskTitle, aiMode, aiParsing, setAiMode, handleCreateTask }: TaskInputBarProps) {
  return (
    <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
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
            className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-all duration-200 ${
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
