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
  const navItems = [
    {
      id: 'tasks',
      label: '全部任务',
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      count: totalTasks,
      action: () => { onViewChange('tasks'); onSelectList(null) },
      match: currentView === 'tasks' && selectedListId === null,
    },
    {
      id: 'today',
      label: '今日任务',
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      count: todayCount,
      action: () => { onViewChange('today'); onSelectList(null) },
      match: currentView === 'today',
    },
    {
      id: 'archived',
      label: '归档',
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      ),
      count: archivedCount,
      action: () => { onViewChange('archived'); onSelectList(null); onSelectTag(null) },
      match: currentView === 'archived',
    },
    {
      id: 'calendar',
      label: '日历',
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      action: () => onViewChange('calendar'),
      match: currentView === 'calendar',
    },
    {
      id: 'stats',
      label: '统计',
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      action: () => onViewChange('stats'),
      match: currentView === 'stats',
    },
    {
      id: 'ai',
      label: 'AI 助手',
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      action: () => onViewChange('ai'),
      match: currentView === 'ai',
      accentColor: true,
    },
  ]

  const advancedItems = [
    {
      id: 'quadrant',
      label: '四象限',
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
        </svg>
      ),
      action: () => onViewChange('quadrant'),
      match: currentView === 'quadrant',
    },
    {
      id: 'pomodoro',
      label: '番茄钟',
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      action: () => onViewChange('pomodoro'),
      match: currentView === 'pomodoro',
    },
    {
      id: 'habit',
      label: '习惯打卡',
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      action: () => onViewChange('habit'),
      match: currentView === 'habit',
    },
    {
      id: 'template',
      label: '模板',
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
        </svg>
      ),
      action: () => onViewChange('template'),
      match: currentView === 'template',
    },
    {
      id: 'goals',
      label: '目标 / OKR',
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      action: () => onViewChange('goals'),
      match: currentView === 'goals',
    },
  ]

  return (
    <>
      <div className="mb-3">
        <p className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.08em] mb-2 px-3">
          智能清单
        </p>
        <nav className="space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={item.action}
              className={`w-full flex items-center justify-between sidebar-nav-item px-3 py-[9px] rounded-xl text-[13px] font-medium transition-all duration-200 active:scale-[0.97] ${item.id === 'calendar' ? 'calendar-nav' : ''} ${item.id === 'ai' ? 'ai-assistant-btn' : ''} ${
                item.match
                  ? item.id === 'ai'
                    ? 'bg-[var(--color-ai-light)] text-[var(--color-ai)] shadow-sm'
                    : 'bg-[var(--color-accent-light)] text-[var(--color-accent)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className={item.match ? 'opacity-100' : 'opacity-60'}>
                  {item.icon}
                </span>
                {item.label}
              </span>
              {typeof item.count === 'number' && item.count > 0 && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full min-w-[20px] text-center ${
                  item.match
                    ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]'
                }`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="mb-3">
        <p className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.08em] mb-2 px-3">
          高级视图
        </p>
        <nav className="space-y-0.5">
          {advancedItems.map((item) => (
            <button
              key={item.id}
              onClick={item.action}
              className={`w-full flex items-center gap-2.5 sidebar-nav-item px-3 py-[9px] rounded-xl text-[13px] font-medium transition-all duration-200 active:scale-[0.97] ${
                item.match
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <span className={item.match ? 'opacity-100' : 'opacity-60'}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </>
  )
}
