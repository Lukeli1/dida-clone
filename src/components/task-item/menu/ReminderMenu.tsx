import { useState, useMemo } from 'react'
import type { SubMenuProps } from './menuItems'
import { useTaskActionContext } from '../../../contexts/TaskActionContext'
import { useMenuKeyboard, useMenuScope, type MenuItemInfo } from '../../../hooks/useMenuKeyboard'
import { getReminderTime, toDatetimeLocalValue, fromDatetimeLocalValue, formatReminderDisplay } from '../../../utils/reminder'

/**
 * 提醒子菜单：5 分钟 / 15 分钟 / 30 分钟 / 1 小时 / 1 天后 / 自定义 / 清除。
 *
 * 与 DateMenu / RepeatMenu 一致，通过 useTaskActionContext 获取 onSetReminder。
 * 自定义面板使用 <input type="datetime-local"> 选择具体日期时间。
 * 如果任务已有 reminder，底部显示当前提醒时间摘要。
 *
 * 键盘导航（P10-06）：快捷按钮水平支持 ←→ 选择、Enter 确认。自定义面板展开时
 * 键盘导航暂停（输入框获得焦点，由 hook 的表单控件放行逻辑保证不干扰输入）。
 */

// 快捷偏移选项：label + 偏移分钟数
const QUICK_OPTIONS: { id: string; label: string; minutes: number }[] = [
  { id: '5min', label: '5分', minutes: 5 },
  { id: '15min', label: '15分', minutes: 15 },
  { id: '30min', label: '30分', minutes: 30 },
  { id: '1hour', label: '1时', minutes: 60 },
  { id: '1day', label: '1天', minutes: 1440 },
]

export function ReminderMenu({ task, onClose }: SubMenuProps) {
  const ctx = useTaskActionContext()
  const [showCustom, setShowCustom] = useState(false)
  const [customDatetime, setCustomDatetime] = useState('')

  // 悬停接管键盘作用域；自定义面板展开时暂停快捷按钮导航
  const { active, activate, deactivate } = useMenuScope('reminder')
  const keyboardActive = active && !showCustom

  function handleQuickReminder(minutes: number) {
    ctx.onSetReminder(task.id, getReminderTime(minutes))
    onClose()
  }

  function handleClearReminder() {
    ctx.onSetReminder(task.id, null)
    onClose()
  }

  function openCustom() {
    setShowCustom(true)
    // 如果已有 reminder，预填当前值；否则默认为当前时间
    setCustomDatetime(
      task.reminder
        ? toDatetimeLocalValue(task.reminder)
        : toDatetimeLocalValue(new Date().toISOString()),
    )
  }

  function handleCustomApply() {
    if (customDatetime) {
      ctx.onSetReminder(task.id, fromDatetimeLocalValue(customDatetime))
    }
    setShowCustom(false)
    onClose()
  }

  const items: MenuItemInfo[] = useMemo(
    () => [
      ...QUICK_OPTIONS.map((opt) => ({
        id: opt.id,
        label: opt.label,
        onClick: () => handleQuickReminder(opt.minutes),
      })),
      { id: 'custom', label: '自定义', onClick: openCustom },
      { id: 'clear', label: '清除', onClick: handleClearReminder },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [task.id, task.reminder],
  )

  const { selectedIndex } = useMenuKeyboard(items, onClose, {
    horizontal: true,
    active: keyboardActive,
    resetKey: `${showCustom}`,
  })
  const selectedId = items[selectedIndex]?.id

  return (
    <div
      onMouseEnter={activate}
      onMouseLeave={deactivate}
    >
      <div className="border-t border-[var(--color-border-light)] my-1" />
      <div className="px-3 py-1 text-xs text-[var(--color-text-tertiary)] font-medium">提醒</div>

      {showCustom ? (
        <div className="px-3 py-2 space-y-2">
          <input
            type="datetime-local"
            value={customDatetime}
            onChange={(e) => setCustomDatetime(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleCustomApply() }
            }}
            className="w-full text-sm border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 bg-[var(--color-surface)]"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleCustomApply}
              className="flex-1 text-xs text-white bg-[var(--color-accent)] hover:brightness-110 rounded py-1.5 transition-colors"
            >
              确定
            </button>
            <button
              onClick={() => setShowCustom(false)}
              className="flex-1 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-tertiary)]/80 rounded py-1.5 transition-colors"
            >
              返回
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 快捷选项 */}
          <div className="flex items-center gap-1 px-3 py-1.5">
            {QUICK_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleQuickReminder(opt.minutes)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-accent)]/10 transition-colors ${selectedId === opt.id ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
                title={`${opt.label}后提醒`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="text-[10px] text-[var(--color-text-secondary)]">{opt.label}</span>
              </button>
            ))}
          </div>

          {/* 自定义 / 清除 */}
          <div className="flex items-center gap-1 px-3 pb-1.5">
            <button
              onClick={openCustom}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-ai)]/10 transition-colors ${selectedId === 'custom' ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
              title="自定义提醒时间"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[10px] text-[var(--color-text-secondary)]">自定义</span>
            </button>
            <button
              onClick={handleClearReminder}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors ${selectedId === 'clear' ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
              title="清除提醒"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-[10px] text-[var(--color-text-secondary)]">清除</span>
            </button>
          </div>

          {/* 当前提醒摘要 */}
          {task.reminder && (
            <div className="px-3 pb-1">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {formatReminderDisplay(task.reminder)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
