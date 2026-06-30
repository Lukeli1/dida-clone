import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { goalApi } from '../../api'
import type { Goal, CreateGoalRequest, UpdateGoalRequest } from '../../api/goalApi'
import { useUIStore } from '../../stores/uiStore'
import { GoalCard } from './GoalCard'
import { GoalEditor } from './GoalEditor'
import { useConfirm } from '../common/ConfirmDialog'
import { useToast } from '../Toast'
import { EmptyState } from '../EmptyState'

/** 目标视图：卡片网格布局 + 创建/编辑/归档/删除 */
export function GoalView() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditor, setShowEditor] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const confirm = useConfirm()
  const toast = useToast()
  // 次要数据是否已就绪：未就绪时显示局部 loading，避免渲染空状态
  const secondaryDataLoaded = useUIStore(s => s.secondaryDataLoaded)
  const today = new Date()

  const loadGoals = useCallback(async () => {
    try {
      setLoading(true)
      // 始终加载全部（含归档），客户端过滤以保持归档计数
      const list = await goalApi.getAll()
      setGoals(list)
    } catch (e) {
      console.error('加载目标失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadGoals() }, [loadGoals])

  const visibleGoals = showArchived ? goals : goals.filter(g => g.status !== 'archived')
  const archivedCount = goals.filter(g => g.status === 'archived').length

  function handleCreate() {
    setEditingGoal(null)
    setShowEditor(true)
  }

  function handleEdit(goal: Goal) {
    setEditingGoal(goal)
    setShowEditor(true)
  }

  async function handleEditorSave(payload: { create?: CreateGoalRequest; update?: { id: number; updates: UpdateGoalRequest } }) {
    try {
      if (payload.create) {
        await goalApi.create(payload.create)
        toast.success('目标创建成功')
      } else if (payload.update) {
        await goalApi.update(payload.update.id, payload.update.updates)
        toast.success('目标已更新')
      }
      await loadGoals()
      setShowEditor(false)
      setEditingGoal(null)
    } catch (e) {
      console.error('保存目标失败:', e)
      toast.error('操作失败，请重试')
    }
  }

  function handleEditorCancel() {
    setShowEditor(false)
    setEditingGoal(null)
  }

  async function handleDelete(goal: Goal) {
    const ok = await confirm({
      title: '删除目标',
      message: `确定删除目标「${goal.title}」吗？关联的任务不会被删除，仅解除关联。`,
      danger: true,
      confirmText: '删除',
      cancelText: '取消',
    })
    if (!ok) return
    try {
      await goalApi.delete(goal.id)
      setGoals(prev => prev.filter(g => g.id !== goal.id))
      toast.success('目标已删除')
    } catch (e) {
      console.error('删除目标失败:', e)
      toast.error('删除失败，请重试')
    }
  }

  async function handleArchive(goal: Goal) {
    const newStatus = goal.status === 'archived' ? 'active' : 'archived'
    try {
      await goalApi.update(goal.id, { status: newStatus })
      setGoals(prev => prev.map(g => (g.id === goal.id ? { ...g, status: newStatus } : g)))
      toast.success(newStatus === 'archived' ? '目标已归档' : '目标已恢复')
    } catch (e) {
      console.error('归档目标失败:', e)
      toast.error('操作失败，请重试')
    }
  }

  function handleProgressChange(_goalId: number, _progress: { total_tasks: number; completed_tasks: number; progress_percent: number }) {
    // 进度变化时由 GoalCard 内部维护本地进度状态，无需在此处刷新
    // 预留接口：未来若需汇总全局进度可在此实现
  }

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">目标 / OKR</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {format(today, 'yyyy年M月d日 EEEE', { locale: zhCN })}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[var(--color-accent)] rounded-lg transition-colors hover:opacity-90"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新建目标
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto">
        {/* 加载中 */}
        {loading || !secondaryDataLoaded ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-[var(--color-text-tertiary)]">加载中...</p>
          </div>
        ) : goals.length === 0 ? (
          /* 空状态 */
          <EmptyState
            icon={
              <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
            title="暂无目标"
            subtitle="创建年度 / 季度 / 月度目标，关联任务并跟踪完成进度"
          />
        ) : (
          <>
            {/* 归档切换 */}
            {archivedCount > 0 && (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowArchived(!showArchived)}
                  className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors"
                >
                  {showArchived ? '隐藏归档' : `查看归档（${archivedCount}）`}
                </button>
              </div>
            )}

            {/* 目标卡片网格 */}
            {visibleGoals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-[var(--color-text-tertiary)]">没有进行中的目标</p>
                <button
                  type="button"
                  onClick={() => setShowArchived(true)}
                  className="mt-2 text-xs text-[var(--color-accent)] hover:underline"
                >
                  查看归档目标
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleGoals.map(goal => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onEdit={handleEdit}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    onProgressChange={handleProgressChange}
                  />
                ))}
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {/* 创建/编辑弹窗 */}
      {showEditor && (
        <GoalEditor
          goal={editingGoal}
          onSave={handleEditorSave}
          onCancel={handleEditorCancel}
        />
      )}
    </div>
  )
}
