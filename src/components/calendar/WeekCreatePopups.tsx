// 周视图：「快速添加」与「拖选后详细创建」两个弹窗（从 WeekView 提取，行为不变）
import type { List } from '../../types'
import type { TimeSelectionApi } from './useTimeSelection'

const priorityOptions = [
  { value: 0, label: '无', color: 'text-gray-400' },
  { value: 1, label: '高', color: 'text-red-600' },
  { value: 2, label: '中', color: 'text-yellow-600' },
  { value: 3, label: '低', color: 'text-green-600' },
]

const priorityFlags = [
  { value: 0, color: 'text-gray-300', label: '无优先级' },
  { value: 1, color: 'text-red-500', label: '高优先级' },
  { value: 2, color: 'text-yellow-500', label: '中优先级' },
  { value: 3, color: 'text-green-500', label: '低优先级' },
]

interface WeekCreatePopupsProps {
  /** 当前所在列的日期 key（yyyy-MM-dd） */
  dateKey: string
  sel: TimeSelectionApi
  lists: List[]
  defaultListId: number
}

export function WeekCreatePopups({ dateKey, sel, lists, defaultListId }: WeekCreatePopupsProps) {
  const createPopup = sel.createPopup
  if (!createPopup || createPopup.dateKey !== dateKey) return null
  const { formatMinute, popupTitle, popupNotes, popupPriority, popupListId, popupInputRef, setPopupTitle, setPopupNotes, setPopupPriority, setPopupListId, handlePopupSubmit, cyclePriority, closeCreatePopup } = sel

  if (createPopup.isQuickAdd) {
    return (
      <div className="absolute z-20 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-blue-200 dark:border-blue-800 p-3 w-64"
        style={{ top: `${Math.max(0, createPopup.top - 10)}px`, left: `${Math.min(createPopup.left, 60)}px` }}
        onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
            {formatMinute(createPopup.startHour * 60 + createPopup.startMin)} - {formatMinute(createPopup.endHour * 60 + createPopup.endMin)}
          </span>
          <button onClick={cyclePriority} className={`ml-auto p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${priorityFlags[popupPriority].color}`} title={priorityFlags[popupPriority].label}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5v9" /></svg>
          </button>
        </div>
        <input ref={popupInputRef} value={popupTitle} onChange={(e) => setPopupTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handlePopupSubmit(); if (e.key === 'Escape') closeCreatePopup() }}
          placeholder="任务标题，回车保存"
          className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
      </div>
    )
  }

  return (
    <div className="absolute z-20 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 w-72"
      style={{ top: `${Math.max(0, createPopup.top - 40)}px`, left: `${Math.min(createPopup.left, 80)}px` }}
      onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {formatMinute(createPopup.startHour * 60 + createPopup.startMin)} - {formatMinute(createPopup.endHour * 60 + createPopup.endMin)}
        </span>
      </div>

      <input ref={popupInputRef} value={popupTitle} onChange={(e) => setPopupTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handlePopupSubmit(); if (e.key === 'Escape') closeCreatePopup() }}
        placeholder="任务标题" className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 mb-2" />

      <textarea value={popupNotes} onChange={(e) => setPopupNotes(e.target.value)} placeholder="备注（可选）" rows={2} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 mb-3 resize-none" />

      <div className="mb-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">优先级</label>
        <div className="flex gap-1.5">
          {priorityOptions.map((opt) => (
            <button key={opt.value} onClick={() => setPopupPriority(opt.value)} className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${popupPriority === opt.value ? `${opt.color} border-current font-medium bg-gray-50 dark:bg-gray-700` : 'text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'}`}>{opt.label}</button>
          ))}
        </div>
      </div>

      {lists.length > 1 && (
        <div className="mb-3">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">清单</label>
          <select value={popupListId || defaultListId} onChange={(e) => setPopupListId(Number(e.target.value))} className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={handlePopupSubmit} className="flex-1 px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium">创建任务</button>
        <button onClick={closeCreatePopup} className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">取消</button>
      </div>
    </div>
  )
}
