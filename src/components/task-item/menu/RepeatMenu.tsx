import { useState, useMemo } from 'react'
import type { SubMenuProps } from './menuItems'
import { useTaskActionContext } from '../../../contexts/TaskActionContext'
import { useMenuKeyboard, useMenuScope, type MenuItemInfo } from '../../../hooks/useMenuKeyboard'
import { parseRepeatRule, serializeRepeatRule, getRepeatSummary, type RepeatFrequency } from '../../../types/repeat'

/**
 * 重复规则子菜单：每天 / 每周 / 每月 / 每年 / 自定义。
 *
 * 自定义面板支持：频率（日/周/月/年）+ 间隔 + 指定星期（WEEKLY 时显示）+ 结束条件。
 * 与 DateMenu / PriorityMenu 一致，通过 useTaskActionContext 获取 task 并调用 onSetRepeatRule。
 * 自定义面板的展开状态由本组件自管，菜单卸载（onClose 触发）时自动重置。
 *
 * 键盘导航（P10-06）：快捷按钮水平支持 ←→ 选择、Enter 确认。自定义面板展开时
 * 键盘导航暂停（输入框获得焦点，由 hook 的表单控件放行逻辑保证不干扰输入）。
 */

const FREQ_OPTIONS: { value: RepeatFrequency; label: string }[] = [
  { value: 'DAILY', label: '天' },
  { value: 'WEEKLY', label: '周' },
  { value: 'MONTHLY', label: '月' },
  { value: 'YEARLY', label: '年' },
]

// 0=周日..6=周六，与 JS Date#getDay() 一致
const WEEKDAY_OPTIONS = [
  { value: 0, label: '日' },
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
]

const END_TYPE_OPTIONS = [
  { value: 'none', label: '永不结束' },
  { value: 'date', label: '到期日期' },
  { value: 'count', label: '重复次数' },
] as const

type EndType = (typeof END_TYPE_OPTIONS)[number]['value']

export function RepeatMenu({ task, onClose }: SubMenuProps) {
  const ctx = useTaskActionContext()
  const existing = parseRepeatRule(task.repeat_rule)
  const [showCustom, setShowCustom] = useState(false)

  // 自定义面板本地状态（从已有规则初始化）
  const [freq, setFreq] = useState<RepeatFrequency>(existing?.freq ?? 'WEEKLY')
  const [interval, setInterval] = useState<number>(existing?.interval ?? 1)
  const [byweekday, setByweekday] = useState<number[]>(existing?.byweekday ?? [])
  const [endType, setEndType] = useState<EndType>(existing?.endDate ? 'date' : existing?.count ? 'count' : 'none')
  const [endDate, setEndDate] = useState<string>(existing?.endDate ? existing.endDate.slice(0, 10) : '')
  const [count, setCount] = useState<number>(existing?.count ?? 3)

  // 悬停接管键盘作用域；自定义面板展开时暂停快捷按钮导航
  const { active, activate, deactivate } = useMenuScope('repeat')
  const keyboardActive = active && !showCustom

  function applyRule(ruleStr: string | null) {
    ctx.onSetRepeatRule(task.id, ruleStr)
    onClose()
  }

  function handleQuick(q: RepeatFrequency) {
    applyRule(serializeRepeatRule({ freq: q, interval: 1 }))
  }

  function handleClear() {
    applyRule(null)
  }

  function toggleWeekday(day: number) {
    setByweekday((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)))
  }

  function handleCustomApply() {
    const rule: { freq: RepeatFrequency; interval: number; byweekday?: number[]; endDate?: string; count?: number } = {
      freq,
      interval: Math.max(1, interval || 1),
    }
    if (freq === 'WEEKLY' && byweekday.length > 0) {
      rule.byweekday = [...byweekday].sort((a, b) => a - b)
    }
    if (endType === 'date' && endDate) {
      rule.endDate = new Date(endDate).toISOString()
    }
    if (endType === 'count' && count > 0) {
      rule.count = count
    }
    applyRule(serializeRepeatRule(rule))
  }

  const items: MenuItemInfo[] = useMemo(
    () => [
      { id: 'daily', label: '每天', onClick: () => handleQuick('DAILY') },
      { id: 'weekly', label: '每周', onClick: () => handleQuick('WEEKLY') },
      { id: 'monthly', label: '每月', onClick: () => handleQuick('MONTHLY') },
      { id: 'yearly', label: '每年', onClick: () => handleQuick('YEARLY') },
      { id: 'custom', label: '自定义', onClick: () => setShowCustom(true) },
      { id: 'clear', label: '清除', onClick: handleClear },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [task.id],
  )

  const { selectedIndex } = useMenuKeyboard(items, onClose, {
    horizontal: true,
    active: keyboardActive,
    resetKey: `${showCustom}`,
  })
  const selectedId = items[selectedIndex]?.id

  return (
    <div onMouseEnter={activate} onMouseLeave={deactivate}>
      <div className="border-t border-[var(--color-border-light)] my-1" />
      <div className="px-3 py-1 text-xs text-[var(--color-text-tertiary)] font-medium">重复</div>

      {showCustom ? (
        <div className="px-3 py-2 space-y-2.5">
          {/* 频率 + 间隔 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-secondary)] flex-shrink-0">每</span>
            <input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              className="w-14 text-sm border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
            />
            <select
              value={freq}
              onChange={(e) => setFreq(e.target.value as RepeatFrequency)}
              className="flex-1 text-sm border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 bg-[var(--color-surface)]"
            >
              {FREQ_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* 指定星期（仅 WEEKLY） */}
          {freq === 'WEEKLY' && (
            <div>
              <span className="block text-xs text-[var(--color-text-secondary)] mb-1">星期</span>
              <div className="flex flex-wrap gap-1">
                {WEEKDAY_OPTIONS.map((opt) => {
                  const selected = byweekday.includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      onClick={() => toggleWeekday(opt.value)}
                      className={`w-7 h-7 flex items-center justify-center rounded-full text-xs transition-colors ${
                        selected
                          ? 'bg-[var(--color-accent)] text-white'
                          : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                      }`}
                      title={`周${opt.label}`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 结束条件 */}
          <div>
            <span className="block text-xs text-[var(--color-text-secondary)] mb-1">结束条件</span>
            <select
              value={endType}
              onChange={(e) => setEndType(e.target.value as EndType)}
              className="w-full text-sm border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 bg-[var(--color-surface)]"
            >
              {END_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {endType === 'date' && (
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-sm border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
            />
          )}
          {endType === 'count' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)]">重复</span>
              <input
                type="number"
                min={1}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-16 text-sm border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
              />
              <span className="text-xs text-[var(--color-text-secondary)]">次</span>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 pt-1">
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
            <button
              onClick={() => handleQuick('DAILY')}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-accent)]/10 transition-colors ${selectedId === 'daily' ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
              title="每天"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="4" strokeWidth="2" />
                <path
                  strokeWidth="2"
                  strokeLinecap="round"
                  d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
                />
              </svg>
              <span className="text-[10px] text-[var(--color-text-secondary)]">每天</span>
            </button>
            <button
              onClick={() => handleQuick('WEEKLY')}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-accent)]/10 transition-colors ${selectedId === 'weekly' ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
              title="每周"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" />
                <path strokeWidth="2" strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <span className="text-[10px] text-[var(--color-text-secondary)]">每周</span>
            </button>
            <button
              onClick={() => handleQuick('MONTHLY')}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-accent)]/10 transition-colors ${selectedId === 'monthly' ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
              title="每月"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 18h18M5 14l2-2 2 2 2-2 2 2 2-2 2 2 2-2M3 22V8a2 2 0 012-2h2V2m4 4V2m4 4V2"
                />
              </svg>
              <span className="text-[10px] text-[var(--color-text-secondary)]">每月</span>
            </button>
            <button
              onClick={() => handleQuick('YEARLY')}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-accent)]/10 transition-colors ${selectedId === 'yearly' ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
              title="每年"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-[10px] text-[var(--color-text-secondary)]">每年</span>
            </button>
            <button
              onClick={() => setShowCustom(true)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-ai)]/10 transition-colors ${selectedId === 'custom' ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
              title="自定义"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="text-[10px] text-[var(--color-text-secondary)]">自定义</span>
            </button>
            <button
              onClick={handleClear}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors ${selectedId === 'clear' ? 'ring-2 ring-[var(--color-accent)]/40' : ''}`}
              title="不重复"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeWidth="2" strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-[10px] text-[var(--color-text-secondary)]">清除</span>
            </button>
          </div>

          {/* 当前规则摘要 */}
          {existing && (
            <div className="px-3 pb-1">
              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
                {getRepeatSummary(existing)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
