import { useState } from 'react'
import { hexWithAlpha } from '../../utils/priority'
import { PRESET_COLORS } from './constants'
import { HabitIconPicker } from './HabitIconPicker'

/* ============ 编辑弹窗 ============ */

export interface HabitEditorProps {
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

/** 编辑弹窗：名称 / 图标 / 颜色 / 目标 / 单位，引用 HabitIconPicker */
export function HabitEditor(props: HabitEditorProps) {
  const { name, setName, icon, setIcon, color, setColor, goal, setGoal, unit, setUnit, onSave, onCancel } = props
  const canSave = name.trim().length > 0
  const [showIconPicker, setShowIconPicker] = useState(false)

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onCancel}>
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
          <h3 className="text-xl font-bold text-gray-900 mb-6">编辑习惯</h3>
          <div className="space-y-4">
            {/* 图标 + 名称（并排） */}
            <div className="flex items-center gap-4">
              {/* 图标预览 */}
              <div className="relative flex-shrink-0">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-3xl"
                  style={{ backgroundColor: hexWithAlpha(color, 0.2) }}
                >
                  {icon}
                </div>
                {/* 编辑图标的小铅笔 */}
                <button
                  type="button"
                  onClick={() => setShowIconPicker(true)}
                  className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full shadow flex items-center justify-center text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
              {/* 名称输入框 */}
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && canSave) onSave() }}
                autoFocus
                className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* 频率 */}
            <div className="flex items-center gap-4">
              <label className="w-16 text-base text-gray-700 flex-shrink-0">频率</label>
              <select className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-xl bg-white focus:outline-none focus:border-blue-500">
                <option>每天</option>
                <option>每周</option>
                <option>工作日</option>
                <option>周末</option>
              </select>
            </div>

            {/* 目标 */}
            <div className="flex items-center gap-4">
              <label className="w-16 text-base text-gray-700 flex-shrink-0">目标</label>
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={goal}
                  onChange={e => setGoal(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                  className="w-20 px-3 py-3 text-base border border-gray-300 rounded-xl text-center focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  placeholder="次/杯/分钟"
                  className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* 开始日期 */}
            <div className="flex items-center gap-4">
              <label className="w-16 text-base text-gray-700 flex-shrink-0">开始日期</label>
              <input
                type="date"
                className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-xl focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* 颜色选择 */}
            <div className="flex items-center gap-4">
              <label className="w-16 text-base text-gray-700 flex-shrink-0">颜色</label>
              <div className="flex-1 flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full transition-all flex items-center justify-center ${
                      color === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-110'
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
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-center gap-3 mt-8">
            <button
              type="button"
              onClick={onCancel}
              className="px-8 py-2.5 text-base text-gray-600 rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className="px-12 py-2.5 text-base text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#4F7DF3' }}
            >
              保存
            </button>
          </div>
        </div>
      </div>

      {/* 图标选择器弹窗 */}
      {showIconPicker && (
        <HabitIconPicker
          icon={icon}
          color={color}
          onIconChange={setIcon}
          onColorChange={setColor}
          onClose={() => setShowIconPicker(false)}
        />
      )}
    </>
  )
}
