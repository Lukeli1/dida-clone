import { useState, useEffect, useCallback } from 'react'
import { goalApi } from '../../api'
import type { Goal } from '../../api/goalApi'
import { hexWithAlpha } from '../../utils/priority'

/** 目标类型标签配置 */
const TYPE_LABELS: Record<Goal['type'], string> = {
  annual: '年度',
  quarterly: '季度',
  monthly: '月度',
}

interface TaskGoalsPanelProps {
  taskId: number
}

/**
 * 任务详情中的"关联目标"面板。
 *
 * 显示当前任务关联的所有目标（pill 形式），并支持：
 *   - 点击 + 按钮：弹出下拉选择器，列出可关联的目标（active 状态）
 *   - 点击已关联目标的 ×：解除关联
 *
 * 数据通过 goalApi（getTaskGoals / linkTaskToGoal / unlinkTaskFromGoal / getAll）直接持久化，
 * 不依赖父组件状态，避免侵入 TaskDetail 的 onUpdate 接口。
 */
export function TaskGoalsPanel({ taskId }: TaskGoalsPanelProps) {
  const [linkedGoals, setLinkedGoals] = useState<Goal[]>([])
  const [allGoals, setAllGoals] = useState<Goal[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadLinkedGoals = useCallback(async () => {
    try {
      const list = await goalApi.getTaskGoals(taskId)
      setLinkedGoals(list)
    } catch (e) {
      console.error('加载任务关联目标失败:', e)
    }
  }, [taskId])

  useEffect(() => {
    loadLinkedGoals()
  }, [loadLinkedGoals])

  // 打开选择器时加载所有可关联的目标（active 状态）
  useEffect(() => {
    if (!showPicker) return
    async function loadAll() {
      try {
        setLoading(true)
        const list = await goalApi.getAll('active')
        setAllGoals(list)
      } catch (e) {
        console.error('加载目标列表失败:', e)
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  }, [showPicker])

  // 可关联的目标 = 所有 active 目标 - 已关联的目标
  const availableGoals = allGoals.filter((g) => !linkedGoals.some((lg) => lg.id === g.id))

  async function handleLink(goal: Goal) {
    try {
      await goalApi.linkTask(goal.id, taskId)
      setLinkedGoals((prev) => [...prev, goal])
      // 关联后不关闭选择器，允许继续关联多个目标
    } catch (e) {
      console.error('关联目标失败:', e)
    }
  }

  async function handleUnlink(goal: Goal) {
    try {
      await goalApi.unlinkTask(goal.id, taskId)
      setLinkedGoals((prev) => prev.filter((g) => g.id !== goal.id))
    } catch (e) {
      console.error('解除关联失败:', e)
    }
  }

  return (
    <div className="relative">
      {/* 区域标题 */}
      <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-[var(--color-text-tertiary)]">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        关联目标
      </div>

      {/* 已关联目标的 pill 列表 */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {linkedGoals.length > 0 ? (
          linkedGoals.map((goal) => {
            const color = goal.color ?? '#3B82F6'
            return (
              <span
                key={goal.id}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                style={{
                  backgroundColor: hexWithAlpha(color, 0.12),
                  color: color,
                }}
                title={`${goal.title}（${TYPE_LABELS[goal.type]}）`}
              >
                <span className="text-[10px] opacity-70">{TYPE_LABELS[goal.type]}</span>
                <span className="max-w-[120px] truncate">{goal.title}</span>
                <button
                  onClick={() => handleUnlink(goal)}
                  className="hover:opacity-70 transition-opacity"
                  title="解除关联"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )
          })
        ) : (
          <span className="text-xs text-[var(--color-text-tertiary)]">未关联目标</span>
        )}

        {/* 添加目标按钮 */}
        <button
          onClick={() => setShowPicker((v) => !v)}
          className="w-5 h-5 flex items-center justify-center rounded-full border border-[var(--color-border)] hover:border-[var(--color-accent)] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors"
          title="关联目标"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* 目标选择浮层 */}
      {showPicker && (
        <div className="absolute z-20 mt-1 bg-[var(--color-surface)] rounded-lg shadow-md border border-[var(--color-border-light)] p-2 w-64 max-h-64 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-[var(--color-text-tertiary)] px-2 py-1">加载中...</p>
          ) : availableGoals.length > 0 ? (
            availableGoals.map((goal) => {
              const color = goal.color ?? '#3B82F6'
              return (
                <button
                  key={goal.id}
                  onClick={() => handleLink(goal)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--color-bg-secondary)] text-left transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-[var(--color-text-secondary)] truncate">{goal.title}</span>
                    <span className="block text-[10px] text-[var(--color-text-tertiary)]">
                      {TYPE_LABELS[goal.type]}
                    </span>
                  </span>
                  <svg
                    className="w-4 h-4 text-[var(--color-text-tertiary)] flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={1.8}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )
            })
          ) : (
            <p className="text-xs text-[var(--color-text-tertiary)] px-2 py-1">
              {allGoals.length === 0 ? '暂无可关联的目标，请先在「目标 / OKR」中创建' : '所有目标已关联'}
            </p>
          )}

          {/* 关闭按钮 */}
          <div className="mt-1 pt-1 border-t border-[var(--color-border-light)]">
            <button
              onClick={() => setShowPicker(false)}
              className="w-full text-center text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] py-1 transition-colors"
            >
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
