import { useState, useRef } from 'react'
import { hexWithAlpha } from '../../utils/priority'
import { PRESET_COLORS, ICON_PRESETS } from './constants'

/* ============ 图标选择器弹窗 ============ */

export interface HabitIconPickerProps {
  icon: string
  color: string
  onIconChange: (icon: string) => void
  onColorChange?: (color: string) => void
  onClose: () => void
}

/** 图标选择器弹窗：emoji 网格 + 自定义文字输入 */
export function HabitIconPicker({ icon, color, onIconChange, onColorChange, onClose }: HabitIconPickerProps) {
  const [showTextInput, setShowTextInput] = useState(false)
  const [customText, setCustomText] = useState('')
  const composingRef = useRef(false)

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {showTextInput ? (
          /* ---- 文字图标模式 ---- */
          <div className="p-5">
            <h4 className="text-sm font-semibold text-gray-900 text-center mb-5">自定义图标</h4>
            {/* 预览 */}
            <div className="flex justify-center mb-6">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
                style={{ backgroundColor: hexWithAlpha(color, 0.2), color }}
              >
                {customText || '?'}
              </div>
            </div>
            {/* 文字输入 */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-500 mb-2 text-center">输入文字（1-2个字符）</label>
              <input
                type="text"
                value={customText}
                onChange={e => { if (!composingRef.current) setCustomText(e.target.value.slice(0, 2)); else setCustomText(e.target.value) }}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={e => { composingRef.current = false; setCustomText((e.target as HTMLInputElement).value.slice(0, 2)) }}
                placeholder="如：早、水、阅"
                className="w-full px-4 py-3 text-center text-lg font-medium border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                autoFocus
              />
            </div>
            {/* 颜色选择 */}
            <div className="mb-6">
              <label className="block text-xs font-medium text-gray-500 mb-2 text-center">选择颜色</label>
              <div className="flex justify-center gap-3">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onColorChange?.(c)}
                    className={`w-8 h-8 rounded-full transition-all flex items-center justify-center ${
                      color === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-110'
                    }`}
                  >
                    <span className="w-full h-full rounded-full" style={{ backgroundColor: c }} />
                  </button>
                ))}
              </div>
            </div>
            {/* 按钮 */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowTextInput(false); setCustomText('') }}
                className="flex-1 py-3 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (customText.trim()) {
                    onIconChange(customText.trim())
                    onClose()
                  }
                }}
                disabled={!customText.trim()}
                className="flex-1 py-3 text-sm font-semibold text-white rounded-xl transition-opacity"
                style={{ backgroundColor: '#4F7DF3', opacity: customText.trim() ? 1 : 0.5 }}
              >
                确定
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 当前选中 + 文字图标按钮 */}
            <div className="p-5 pb-4 border-b border-gray-100 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-3xl" style={{ backgroundColor: hexWithAlpha(color, 0.15) }}>
                {icon}
              </div>
              <button
                type="button"
                onClick={() => { setShowTextInput(true); setCustomText(icon.length <= 2 ? icon : '') }}
                className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all ${
                  icon.length <= 2 && !ICON_PRESETS.some(p => p.emoji === icon)
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'
                }`}
                title="自定义文字图标"
              >
                <span className="text-xs font-bold">文</span>
              </button>
            </div>
            {/* 图标网格 */}
            <div className="px-5 py-5 grid grid-cols-10 gap-y-4 gap-x-1 overflow-y-auto max-h-[55vh]">
              {ICON_PRESETS.map(preset => (
                <button
                  key={preset.emoji}
                  type="button"
                  onClick={() => {
                    onIconChange(preset.emoji)
                    onClose()
                  }}
                  className={`w-full aspect-square rounded-full flex items-center justify-center text-xl transition-all ${
                    icon === preset.emoji
                      ? 'ring-2 ring-blue-500 ring-offset-2 scale-110'
                      : 'hover:scale-110 active:scale-95'
                  }`}
                  style={{ backgroundColor: hexWithAlpha(preset.color, 0.18) }}
                >
                  {preset.emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
