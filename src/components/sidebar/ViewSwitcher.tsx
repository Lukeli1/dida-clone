import type { ViewSwitcherProps } from './types'

export function ViewSwitcher({
  currentView,
  selectedListId,
  onViewChange,
  onSelectList,
  onSelectTag,
  totalTasks,
  todayCount,
  archivedCount,
}: ViewSwitcherProps) {
  return (
    <>
      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
          智能清单
        </p>
        <button
          onClick={() => { onViewChange('tasks'); onSelectList(null) }}
          className={`w-full flex items-center justify-between sidebar-nav-item px-3 py-2 rounded-lg text-sm transition-colors ${
            currentView === 'tasks' && selectedListId === null
              ? 'bg-blue-50/60 text-[#378ADD] font-medium'
              : 'text-gray-700 hover:bg-gray-50/60'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            全部任务
          </span>
          <span className="text-xs text-gray-400">{totalTasks}</span>
        </button>

        <button
          onClick={() => { onViewChange('today'); onSelectList(null) }}
          className={`w-full flex items-center justify-between sidebar-nav-item px-3 py-2 rounded-lg text-sm transition-colors ${
            currentView === 'today'
              ? 'bg-blue-50/60 text-[#378ADD] font-medium'
              : 'text-gray-700 hover:bg-gray-50/60'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            今日任务
          </span>
          <span className="text-xs text-gray-400">{todayCount}</span>
        </button>

        <button
          onClick={() => { onViewChange('archived'); onSelectList(null); onSelectTag(null) }}
          className={`w-full flex items-center justify-between sidebar-nav-item px-3 py-2 rounded-lg text-sm transition-colors ${
            currentView === 'archived'
              ? 'bg-blue-50/60 text-[#378ADD] font-medium'
              : 'text-gray-700 hover:bg-gray-50/60'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            归档
          </span>
          <span className="text-xs text-gray-400">{archivedCount}</span>
        </button>

        <button
          onClick={() => onViewChange('calendar')}
          className={`w-full flex items-center justify-between sidebar-nav-item px-3 py-2 rounded-lg text-sm transition-colors ${
            currentView === 'calendar'
              ? 'bg-blue-50/60 text-[#378ADD] font-medium'
              : 'text-gray-700 hover:bg-gray-50/60'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            日历
          </span>
        </button>

        <button
          onClick={() => onViewChange('stats')}
          className={`w-full flex items-center justify-between sidebar-nav-item px-3 py-2 rounded-lg text-sm transition-colors ${
            currentView === 'stats'
              ? 'bg-blue-50/60 text-[#378ADD] font-medium'
              : 'text-gray-700 hover:bg-gray-50/60'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            统计
          </span>
        </button>

        <button
          onClick={() => onViewChange('ai')}
          className={`w-full flex items-center justify-between sidebar-nav-item px-3 py-2 rounded-lg text-sm transition-colors ${
            currentView === 'ai'
              ? 'bg-purple-50/60 text-purple-600 font-medium'
              : 'text-gray-700 hover:bg-gray-50/60'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI 助手
          </span>
        </button>
      </div>

      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
          高级视图
        </p>
        <button
          onClick={() => onViewChange('quadrant')}
          className={`w-full flex items-center justify-between sidebar-nav-item px-3 py-2 rounded-lg text-sm transition-colors ${
            currentView === 'quadrant'
              ? 'bg-blue-50/60 text-[#378ADD] font-medium'
              : 'text-gray-700 hover:bg-gray-50/60'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
            </svg>
            四象限
          </span>
        </button>
        <button
          onClick={() => onViewChange('pomodoro')}
          className={`w-full flex items-center justify-between sidebar-nav-item px-3 py-2 rounded-lg text-sm transition-colors ${
            currentView === 'pomodoro'
              ? 'bg-blue-50/60 text-[#378ADD] font-medium'
              : 'text-gray-700 hover:bg-gray-50/60'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            番茄钟
          </span>
        </button>
        <button
          onClick={() => onViewChange('habit')}
          className={`w-full flex items-center justify-between sidebar-nav-item px-3 py-2 rounded-lg text-sm transition-colors ${
            currentView === 'habit'
              ? 'bg-blue-50/60 text-[#378ADD] font-medium'
              : 'text-gray-700 hover:bg-gray-50/60'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            习惯打卡
          </span>
        </button>
      </div>
    </>
  )
}
