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

/** 新建任务输入栏（含 AI 模式切换 + 智能日期识别预览），原样从 TaskListPanel 搬迁，未改逻辑 */
export function TaskInputBar({ newTaskInputRef, newTaskTitle, setNewTaskTitle, aiMode, aiParsing, setAiMode, handleCreateTask }: TaskInputBarProps) {
  return (
    <div className="p-4 border-b border-gray-200 bg-white">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            ref={newTaskInputRef}
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !aiParsing && handleCreateTask()}
            disabled={aiParsing}
            placeholder={aiMode ? '试试输入：明天下午3点开会，优先级高' : '添加新任务... (试试：明天下午3点开会)'}
            className={`w-full pl-4 pr-24 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-60 ${aiMode ? 'border-purple-300 bg-purple-50/30' : 'border-gray-300'}`}
          />
          <button
            onClick={() => { setAiMode(!aiMode); newTaskInputRef.current?.focus() }}
            className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${aiMode ? 'bg-purple-500 text-white' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}
            title={aiMode ? '关闭 AI 模式' : '开启 AI 自然语言输入'}
          >
            {aiMode ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            )}
            AI
          </button>
          {/* 智能日期识别预览 */}
          {!aiMode && newTaskTitle.trim() && (() => {
            const preview = parseSmartDate(newTaskTitle.trim())
            const hasParsed = preview.dueDate || (preview.priority !== undefined && preview.priority > 0) || preview.repeatRule
            if (!hasParsed) return null
            return (
              <div className="absolute top-full left-0 right-0 mt-1 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-xs text-blue-700 flex items-center gap-3 z-10 shadow-sm">
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  智能识别
                </span>
                {preview.dueDate && (
                  <span className="flex items-center gap-0.5">📅 {new Date(preview.dueDate).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
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
          className={`px-6 py-2 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${aiMode ? 'bg-purple-500 hover:bg-purple-600' : 'bg-[#378ADD] hover:bg-[#185FA5]'}`}
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
        <p className="mt-1.5 text-xs text-purple-500 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          AI 模式：用自然语言描述任务，AI 会自动识别时间、优先级
        </p>
      )}
    </div>
  )
}
