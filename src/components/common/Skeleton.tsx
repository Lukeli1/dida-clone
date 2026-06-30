/**
 * 骨架屏组件
 *
 * - Skeleton：基础骨架块，使用 Tailwind 内置 animate-pulse 与 --color-bg-tertiary 变量，
 *   自动适配浅色/深色主题。
 * - TaskListSkeleton：任务列表骨架，模拟 8 条任务行（复选框 + 标题 + 日期）。
 * - AppSkeleton：完整应用骨架屏，结构与 App.tsx 实际布局保持一致
 *   （TitleBar + flex row(Sidebar + TaskList)），使加载过渡更自然。
 */

export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-[var(--color-bg-tertiary)] rounded ${className ?? ''}`} />
}

export function TaskListSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="w-5 h-5 rounded-full" />
          <Skeleton className="flex-1 h-4" />
          <Skeleton className="w-20 h-4" />
        </div>
      ))}
    </div>
  )
}

export function AppSkeleton() {
  // 完整布局骨架屏：模拟 TitleBar + Sidebar + TaskList + DetailPanel
  // 维度与实际 App.tsx 一致：TitleBar h-10、Sidebar w-64
  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg-secondary)] overflow-hidden">
      {/* TitleBar 骨架 */}
      <div
        className="h-10 shrink-0 flex items-center px-4 gap-2.5 border-b border-[var(--color-border)]"
        style={{ backgroundColor: 'var(--titlebar-bg)' }}
      >
        <Skeleton className="w-5 h-5 rounded-md" />
        <Skeleton className="w-32 h-4" />
        <div className="flex-1" />
        <Skeleton className="w-8 h-8 rounded-lg" />
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar 骨架 */}
        <div className="w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] p-3 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-8 rounded-lg" />
          ))}
        </div>
        {/* TaskList 骨架 */}
        <div className="flex-1 bg-[var(--color-bg-secondary)]">
          <TaskListSkeleton />
        </div>
      </div>
    </div>
  )
}
