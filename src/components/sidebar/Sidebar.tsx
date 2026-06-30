import type { SidebarProps } from './types'
import { ViewSwitcher } from './ViewSwitcher'
import { ListSection } from './ListSection'
import { TagSection } from './TagSection'
import { AvatarSection, SidebarFooter } from './SidebarFooter'
import { useWindowSize } from '../../hooks/useWindowSize'
import { useUIStore } from '../../stores/uiStore'
import { getAvatar } from '../../utils/avatar'

/**
 * 侧边栏内部内容（不含外层 aside 容器，由各响应式模式包裹）。
 * 桌面完整模式与移动端抽屉共用此结构，保证内容一致。
 */
function SidebarInner(props: SidebarProps) {
  const totalTasks = Object.values(props.taskCounts).reduce((a, b) => a + b, 0)

  return (
    <>
      {/* 顶部头像区域 */}
      <AvatarSection />

      {/* 可滚动内容区 */}
      <div className="flex-1 overflow-y-auto p-3">
        <ViewSwitcher
          currentView={props.currentView}
          selectedListId={props.selectedListId}
          onViewChange={props.onViewChange}
          onSelectList={props.onSelectList}
          onSelectTag={props.onSelectTag}
          totalTasks={totalTasks}
          todayCount={props.todayCount}
          archivedCount={props.archivedCount}
        />

        <ListSection
          lists={props.lists}
          selectedListId={props.selectedListId}
          currentView={props.currentView}
          onSelectList={props.onSelectList}
          onViewChange={props.onViewChange}
          onCreateList={props.onCreateList}
          onUpdateList={props.onUpdateList}
          onDeleteList={props.onDeleteList}
          taskCounts={props.taskCounts}
        />

        <TagSection
          tags={props.tags}
          selectedTagId={props.selectedTagId}
          onSelectTag={props.onSelectTag}
          onSelectList={props.onSelectList}
          onViewChange={props.onViewChange}
          onCreateTag={props.onCreateTag}
          onDeleteTag={props.onDeleteTag}
        />
      </div>

      {/* 底部固定栏：设置入口 */}
      <SidebarFooter currentView={props.currentView} onViewChange={props.onViewChange} />
    </>
  )
}

/**
 * 折叠态图标条（平板 / 桌面折叠模式）。
 * 仅显示关键导航图标，hover 时父级浮层展开完整内容。
 */
function CollapsedNav(props: SidebarProps) {
  const items = [
    {
      id: 'tasks',
      label: '全部任务',
      active: props.currentView === 'tasks' && props.selectedListId === null,
      onClick: () => { props.onViewChange('tasks'); props.onSelectList(null) },
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      id: 'today',
      label: '今日任务',
      active: props.currentView === 'today',
      onClick: () => { props.onViewChange('today'); props.onSelectList(null) },
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'calendar',
      label: '日历',
      active: props.currentView === 'calendar',
      onClick: () => props.onViewChange('calendar'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'quadrant',
      label: '四象限',
      active: props.currentView === 'quadrant',
      onClick: () => props.onViewChange('quadrant'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
        </svg>
      ),
    },
    {
      id: 'stats',
      label: '统计',
      active: props.currentView === 'stats',
      onClick: () => props.onViewChange('stats'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: 'pomodoro',
      label: '番茄钟',
      active: props.currentView === 'pomodoro',
      onClick: () => props.onViewChange('pomodoro'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'habit',
      label: '习惯打卡',
      active: props.currentView === 'habit',
      onClick: () => props.onViewChange('habit'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      id: 'template',
      label: '模板',
      active: props.currentView === 'template',
      onClick: () => props.onViewChange('template'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
        </svg>
      ),
    },
    {
      id: 'goals',
      label: '目标 / OKR',
      active: props.currentView === 'goals',
      onClick: () => props.onViewChange('goals'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      id: 'ai',
      label: 'AI 助手',
      active: props.currentView === 'ai',
      onClick: () => props.onViewChange('ai'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
  ]

  const avatar = getAvatar()

  return (
    <>
      {/* 头像 */}
      <div className="p-2.5 border-b border-[var(--color-border)] flex justify-center">
        {avatar ? (
          <img src={avatar} alt="头像" className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-hover)] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        )}
      </div>

      {/* 导航图标列 */}
      <nav className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick}
            title={item.label}
            aria-label={item.label}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
              item.active
                ? item.id === 'ai'
                  ? 'bg-purple-50 text-purple-600'
                  : 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {item.icon}
          </button>
        ))}
      </nav>

      {/* 设置 */}
      <div className="border-t border-[var(--color-border)] p-2.5 flex justify-center">
        <button
          onClick={() => props.onViewChange('settings')}
          title="设置"
          aria-label="设置"
          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
            props.currentView === 'settings'
              ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </>
  )
}

export function Sidebar(props: SidebarProps) {
  const { isNarrow, isCompact } = useWindowSize()
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)

  // 移动端：抽屉模式，通过 TitleBar 汉堡按钮唤出
  if (isNarrow) {
    // 选中导航项后自动关闭抽屉
    const drawerProps: SidebarProps = {
      ...props,
      onViewChange: (v) => { props.onViewChange(v); setSidebarOpen(false) },
      onSelectList: (id) => { props.onSelectList(id); setSidebarOpen(false) },
      onSelectTag: (id) => { props.onSelectTag(id); setSidebarOpen(false) },
    }

    return (
      <>
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`fixed left-0 top-0 bottom-0 z-50 w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col transform transition-transform duration-200 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <SidebarInner {...drawerProps} />
        </aside>
      </>
    )
  }

  // 平板始终折叠为图标条；桌面当 sidebarCollapsed(Ctrl+B) 时折叠
  const collapsed = isCompact || sidebarCollapsed

  if (collapsed) {
    return (
      <div className="relative shrink-0 group">
        {/* 折叠图标条 */}
        <aside className="w-16 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col h-full">
          <CollapsedNav {...props} />
        </aside>
        {/* hover 临时展开浮层 */}
        <div className="absolute left-full top-0 bottom-0 z-50 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-200 shadow-xl">
          <aside className="w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col h-full">
            <SidebarInner {...props} />
          </aside>
        </div>
      </div>
    )
  }

  // 桌面完整模式
  return (
    <aside className="w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col h-full shrink-0">
      <SidebarInner {...props} />
    </aside>
  )
}
