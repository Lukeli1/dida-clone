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
      <div className="px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">显示字体</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">选择应用的全局显示字体</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <select
              aria-label="显示字体"
              value={fontSetting.type === 'preset' ? fontSetting.key : ''}
              onChange={(e) => {
                if (e.target.value) onFontPresetSelect(e.target.value)
              }}
              className="min-w-0 max-w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
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
                className="whitespace-nowrap rounded-lg border border-[var(--color-accent)] px-3 py-1.5 text-sm text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)]"
              >
                更多字体
              </button>
            )}
          </div>
        </div>
        {fontSetting.type === 'system' && (
          <div className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent-light)] px-2.5 py-1 text-xs text-[var(--color-accent-text)]">
            <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
            {fontSetting.name}
          </div>
        )}
        <p className="mt-1.5 text-xs text-[var(--color-text-tertiary)]">滴答清单 · ABC abc 123</p>
      </div>

      {/* 字体大小 */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">字体大小</p>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">全局字号按比例缩放</p>
        </div>
        <div
          className="flex shrink-0 flex-wrap gap-1 rounded-lg bg-[var(--color-bg-tertiary)] p-0.5"
          role="group"
          aria-label="字体大小"
        >
          {(
            [
              { key: 'normal', label: '正常' },
              { key: 'large', label: '大' },
              { key: 'xlarge', label: '超大' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onFontSizeChange(item.key)}
              aria-pressed={fontSize === item.key}
              className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-3 text-xs transition-colors ${
                fontSize === item.key
                  ? 'bg-[var(--color-surface)] font-medium text-[var(--color-accent)] shadow-sm'
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
