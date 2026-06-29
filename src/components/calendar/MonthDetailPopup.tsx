// 月视图：双击日期格打开的「详细创建任务」弹窗（从 MonthView 提取，行为不变）
import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { List } from '../../types'
import type { CreateTaskOnRange } from './shared/types'

const priorityOptions = [
  { value: 0, label: '无', color: 'text-gray-400' },
  { value: 1, label: '高', color: 'text-red-600' },
  { value: 2, label: '中', color: 'text-amber-600' },
  { value: 3, label: '低', color: 'text-blue-600' },
]

interface MonthDetailPopupProps {
  /** 当前打开的日期 key（yyyy-MM-dd） */
  dateKey: string
  lists: List[]
  defaultListId: number
  onSubmit: CreateTaskOnRange
  onClose: () => void
}

export function MonthDetailPopup({ dateKey, lists, defaultListId, onSubmit, onClose }: MonthDetailPopupProps) {
  const [popupTitle, setPopupTitle] = useState('')
  const [popupNotes, setPopupNotes] = useState('')
  const [popupPriority, setPopupPriority] = useState(2)
  const [popupListId, setPopupListId] = useState(defaultListId)
  const [popupHour, setPopupHour] = useState(9)
  const [popupMinute, setPopupMinute] = useState(0)
  const detailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => detailInputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  function handleDetailSubmit() {
    const title = popupTitle.trim()
    if (title) {
      const endHour = (popupHour + 1) % 24
      onSubmit({
        dateKey,
        title,
        notes: popupNotes.trim() || undefined,
        priority: popupPriority,
        listId: popupListId || defaultListId,
        startHour: popupHour,
        startMin: popupMinute,
        endHour,
        endMin: popupMinute,
      })
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 p-5 w-80" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-[#378ADD]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {format(new Date(dateKey), 'M月d日 EEEE', { locale: zhCN })} 新建任务
          </span>
        </div>

        <input
          ref={detailInputRef}
          value={popupTitle}
          onChange={(e) => setPopupTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleDetailSubmit(); if (e.key === 'Escape') onClose() }}
          placeholder="任务标题"
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20 focus:border-[#378ADD] mb-3"
        />

        <div className="mb-3">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">时间</label>
          <div className="flex items-center gap-2">
            <select value={popupHour} onChange={(e) => setPopupHour(Number(e.target.value))} className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20 focus:border-[#378ADD]">
              {Array.from({ length: 24 }, (_, i) => (<option key={i} value={i}>{String(i).padStart(2, '0')}</option>))}
            </select>
            <span className="text-gray-400 dark:text-gray-500">:</span>
            <select value={popupMinute} onChange={(e) => setPopupMinute(Number(e.target.value))} className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20 focus:border-[#378ADD]">
              <option value={0}>00</option>
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={45}>45</option>
            </select>
          </div>
        </div>

        <textarea value={popupNotes} onChange={(e) => setPopupNotes(e.target.value)} placeholder="备注（可选）" rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20 focus:border-[#378ADD] mb-3 resize-none" />

        <div className="mb-3">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">优先级</label>
          <div className="flex gap-1.5">
            {priorityOptions.map((opt) => (
              <button key={opt.value} onClick={() => setPopupPriority(opt.value)} className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${popupPriority === opt.value ? `${opt.color} border-current font-medium bg-gray-50 dark:bg-gray-700` : 'text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'}`}>{opt.label}</button>
            ))}
          </div>
        </div>

        {lists.length > 1 && (
          <div className="mb-4">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">清单</label>
            <select value={popupListId || defaultListId} onChange={(e) => setPopupListId(Number(e.target.value))} className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#378ADD]/20 focus:border-[#378ADD]">
              {lists.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
            </select>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={handleDetailSubmit} className="flex-1 px-3 py-2 text-sm bg-[#378ADD] text-white rounded-lg hover:bg-[#185FA5] transition-colors font-medium">创建任务</button>
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">取消</button>
        </div>
      </div>
    </div>
  )
}
