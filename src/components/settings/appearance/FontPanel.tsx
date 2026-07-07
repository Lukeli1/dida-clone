import { PRESET_FONTS, type AppFontSetting } from '../../../utils/font'
import { type FontSizeLevel } from '../../../utils/appearance'
import { isTauri } from '../../../api'

interface FontPanelProps {
  fontSetting: AppFontSetting
  fontSize: FontSizeLevel
  onFontPresetSelect: (key: string) => void
  onOpenFontPicker: () => void
  onFontSizeChange: (level: FontSizeLevel) => void
}

export function FontPanel({
  fontSetting,
  fontSize,
  onFontPresetSelect,
  onOpenFontPicker,
  onFontSizeChange,
}: FontPanelProps) {
  return (
    <>
      {/* 显示字体 */}
      <div className="px-4 py-3.5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-medium text-[var(--color-text-primary)]">显示字体</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">选择应用的全局显示字体</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={fontSetting.type === 'preset' ? fontSetting.key : ''}
              onChange={(e) => {
                if (e.target.value) onFontPresetSelect(e.target.value)
              }}
              className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)]"
            >
              {PRESET_FONTS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.displayName}
                </option>
              ))}
            </select>
            {isTauri && (
              <button
                onClick={onOpenFontPicker}
                className="px-3 py-1.5 text-sm text-[var(--color-accent)] border border-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent-light)] transition-colors whitespace-nowrap"
              >
                更多字体
              </button>
            )}
          </div>
        </div>
        {fontSetting.type === 'system' && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--color-accent-light)] text-[var(--color-accent-text)] rounded-md text-xs">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
            {fontSetting.name}
          </div>
        )}
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5">滴答清单 · ABC abc 123</p>
      </div>

      {/* 字体大小 */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">字体大小</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">全局字号按比例缩放</p>
        </div>
        <div className="flex gap-1 bg-[var(--color-bg-tertiary)] rounded-lg p-1">
          {(
            [
              { key: 'normal', label: '正常' },
              { key: 'large', label: '大' },
              { key: 'xlarge', label: '超大' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => onFontSizeChange(item.key)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                fontSize === item.key
                  ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
