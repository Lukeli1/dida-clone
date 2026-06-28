import { useState } from 'react'
import { hexWithAlpha } from '../../utils/priority'
import { PRESET_EMOJIS, PRESET_COLORS, BRAND_COLOR } from './constants'
import { HabitIconPicker } from './HabitIconPicker'

export interface CreateHabitFormProps {
  name: string
  setName: (v: string) => void
  icon: string
  setIcon: (v: string) => void
  color: string
  setColor: (v: string) => void
  goal: number
  setGoal: (v: number) => void
  unit: string
  setUnit: (v: string) => void
  onSave: () => void
  onCancel: () => void
}

/** 新建习惯表单：名称 / 图标 / 颜色 / 目标 / 单位 */
export function CreateHabitForm(props: CreateHabitFormProps) {
  const { name, setName, icon, setIcon, color, setColor, goal, setGoal, unit, setUnit, onSave, onCancel } = props
  const canSave = name.trim().length > 0
  const [customIcon, setCustomIcon] = useState('')
  const [showFormPicker, setShowFormPicker] = useState(false)

  function applyCustomIcon() {
    const trimmed = customIcon.trim()
    if (trimmed) setIcon(trimmed)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 animate-slide-in-top">
      <div className="space-y-4">
        {/* 名称 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">习惯名称</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSave) onSave() }}
            placeholder="例如：喝水、读书、跑步"
            autoFocus
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* 图标选择：预览 + 快速预设 + 更多 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">图标</label>
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0 border-2 border-blue-300"
              style={{ backgroundColor: hexWithAlpha(color, 0.15) }}
            >
              {icon}
            </div>
            {PRESET_EMOJIS.map(em => (
              <button
                key={em}
                type="button"
                onClick={() => { setIcon(em); setCustomIcon('') }}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all ${
                  icon === em ? 'ring-2 ring-blue-400 scale-110' : 'bg-gray-50 hover:bg-gray-100'
                }`}
                style={icon === em ? { backgroundColor: hexWithAlpha(color, 0.2) } : undefined}
              >
                {em}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowFormPicker(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="更多图标"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
            </button>
          </div>
          {/* 自定义 emoji 输入 */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customIcon}
              onChange={e => setCustomIcon(e.target.value)}
              onBlur={applyCustomIcon}
              onKeyDown={e => { if (e.key === 'Enter') applyCustomIcon() }}
              placeholder="输入任意 emoji"
              maxLength={4}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              type="button"
              onClick={applyCustomIcon}
              className="px-3 py-2 text-xs font-medium text-white rounded-lg transition-colors hover:opacity-90"
              style={{ backgroundColor: BRAND_COLOR }}
            >
              使用
            </button>
          </div>
        </div>

        {/* 图标选择器弹窗 */}
        {showFormPicker && (
          <HabitIconPicker
            icon={icon}
            color={color}
            onIconChange={(em) => { setIcon(em); setCustomIcon('') }}
            onColorChange={setColor}
            onClose={() => setShowFormPicker(false)}
          />
        )}

        {/* 颜色选择 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">颜色</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-all flex items-center justify-center ${
                  color === c ? 'ring-2 ring-blue-400 scale-110' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              >
                {color === c && (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 目标 + 单位 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">每日目标</label>
            <input
              type="number"
              min={1}
              value={goal}
              onChange={e => setGoal(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">单位（可选）</label>
            <input
              type="text"
              value={unit}
              onChange={e => setUnit(e.target.value)}
              placeholder="例如：杯、次、分钟"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: BRAND_COLOR }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
