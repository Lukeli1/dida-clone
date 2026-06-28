import type { SidebarProps } from './types'
import { ViewSwitcher } from './ViewSwitcher'
import { ListSection } from './ListSection'
import { TagSection } from './TagSection'
import { AvatarSection, SidebarFooter } from './SidebarFooter'

export function Sidebar({
  lists,
  tags,
  selectedListId,
  selectedTagId,
  currentView,
  onSelectList,
  onSelectTag,
  onViewChange,
  onCreateList,
  onUpdateList,
  onDeleteList,
  onCreateTag,
  onDeleteTag,
  taskCounts,
  todayCount,
  archivedCount,
}: SidebarProps) {
  const totalTasks = Object.values(taskCounts).reduce((a, b) => a + b, 0)

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* 顶部头像区域 */}
      <AvatarSection />

      {/* 可滚动内容区 */}
      <div className="flex-1 overflow-y-auto p-3">
        <ViewSwitcher
          currentView={currentView}
          selectedListId={selectedListId}
          onViewChange={onViewChange}
          onSelectList={onSelectList}
          onSelectTag={onSelectTag}
          totalTasks={totalTasks}
          todayCount={todayCount}
          archivedCount={archivedCount}
        />

        <ListSection
          lists={lists}
          selectedListId={selectedListId}
          currentView={currentView}
          onSelectList={onSelectList}
          onViewChange={onViewChange}
          onCreateList={onCreateList}
          onUpdateList={onUpdateList}
          onDeleteList={onDeleteList}
          taskCounts={taskCounts}
        />

        <TagSection
          tags={tags}
          selectedTagId={selectedTagId}
          onSelectTag={onSelectTag}
          onSelectList={onSelectList}
          onViewChange={onViewChange}
          onCreateTag={onCreateTag}
          onDeleteTag={onDeleteTag}
        />
      </div>

      {/* 底部固定栏：设置入口 */}
      <SidebarFooter currentView={currentView} onViewChange={onViewChange} />
    </aside>
  )
}
