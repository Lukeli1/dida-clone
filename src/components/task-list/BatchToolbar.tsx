import type { TaskActions } from '../../hooks/useTaskActions'
import type { List } from '../../types'

interface BatchToolbarProps {
  selectedTaskIds: Set<number>
  selectAllTasks: () => void
  clearSelection: () => void
  actions: TaskActions
  lists: List[]
}

/**
 * 批量操作工具栏（完成 / 归档 / 设优先级 / 移动清单 / 删除）
 * 原样从 TaskListPanel 搬迁，未做任何逻辑改动。
 */
export function BatchToolbar({ selectedTaskIds, selectAllTasks, clearSelection, actions, lists }: BatchToolbarProps) {
  return (
    <div className="mt-3 p-2 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-2 flex-wrap">
      <span className="text-sm font-medium text-gray-700">
        已选 {selectedTaskIds.size} 项
      </span>
      <div className="h-4 w-px bg-gray-200 mx-1" />
      <button onClick={selectAllTasks} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">全选</button>
      <button onClick={clearSelection} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">取消</button>
      <div className="h-4 w-px bg-gray-200 mx-1" />
      <button
        onClick={actions.handleBatchComplete}
        disabled={selectedTaskIds.size === 0}
        className="flex items-center gap-1 px-2 py-1 text-xs text-green-600 hover:bg-green-100 rounded disabled:opacity-40"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        完成
      </button>
      <button
        onClick={actions.handleBatchArchive}
        disabled={selectedTaskIds.size === 0}
        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded disabled:opacity-40"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
        归档
      </button>
      <select
        onChange={(e) => {
          if (e.target.value) actions.handleBatchPriority(Number(e.target.value))
          e.target.value = ''
        }}
        disabled={selectedTaskIds.size === 0}
        className="px-2 py-1 text-xs border border-gray-200 rounded bg-white disabled:opacity-40"
        defaultValue=""
      >
        <option value="" disabled>设优先级</option>
        <option value="1">高</option>
        <option value="2">中</option>
        <option value="3">低</option>
        <option value="0">无</option>
      </select>
      <select
        onChange={(e) => {
          if (e.target.value) actions.handleBatchMoveList(Number(e.target.value))
          e.target.value = ''
        }}
        disabled={selectedTaskIds.size === 0}
        className="px-2 py-1 text-xs border border-gray-200 rounded bg-white disabled:opacity-40"
        defaultValue=""
      >
        <option value="" disabled>移动到清单</option>
        {lists.map(list => (
          <option key={list.id} value={list.id}>{list.name}</option>
        ))}
      </select>
      <div className="flex-1" />
      <button
        onClick={actions.handleBatchDelete}
        disabled={selectedTaskIds.size === 0}
        className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-100 rounded disabled:opacity-40"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        删除
      </button>
    </div>
  )
}
