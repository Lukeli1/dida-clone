import { useState } from 'react'
import './settings.css'
import { AppearancePanel } from './AppearancePanel'
import { GeneralPanel } from './GeneralPanel'
import { NotificationPanel } from './NotificationPanel'
import { LLMApiPanel } from './LLMApiPanel'
import { SystemPanel } from './SystemPanel'
import { PerfPanel } from './PerfPanel'
import { AboutPanel } from './AboutPanel'
import { ShortcutsPanel } from './ShortcutsPanel'
import SyncPanel from './SyncPanel'

interface SettingsViewProps {
  onClose: () => void
}

type SettingCategoryKey =
  'appearance' | 'general' | 'notifications' | 'ai' | 'sync' | 'shortcuts' | 'system' | 'perf' | 'about'

interface SettingCategory {
  key: SettingCategoryKey
  label: string
  icon: JSX.Element
}

export function SettingsView({ onClose }: SettingsViewProps) {
  const [activeCategory, setActiveCategory] = useState<SettingCategoryKey>('appearance')

  const categories: SettingCategory[] = [
    {
      key: 'appearance',
      label: '外观',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
          />
        </svg>
      ),
    },
    {
      key: 'general',
      label: '通用',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      key: 'notifications',
      label: '提醒与通知',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
      ),
    },
    {
      key: 'ai',
      label: '大模型 API',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
          />
        </svg>
      ),
    },
    {
      key: 'sync',
      label: '数据同步',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      ),
    },
    {
      key: 'shortcuts',
      label: '快捷键',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 3h6a2 2 0 012 2v14a2 2 0 01-2 2H9a2 2 0 01-2-2V5a2 2 0 012-2z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 7h.01M12 7h.01M15 7h.01M9 10h.01M12 10h.01M15 10h.01M9 13h6M9 16h6"
          />
        </svg>
      ),
    },
    {
      key: 'system',
      label: '系统',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
          />
        </svg>
      ),
    },
    {
      key: 'perf',
      label: '性能监控',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 12a9 9 0 1118 0M3 12h4m10 0h4M12 3v4m0 10v4m-4.95-9.95l2.83 2.83m4.24-4.24l-2.83 2.83M7.05 16.95l2.83-2.83m6.24-0.34l2.83 2.83"
          />
        </svg>
      ),
    },
    {
      key: 'about',
      label: '关于',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
  ]

  function renderContent() {
    switch (activeCategory) {
      case 'appearance':
        return <AppearancePanel />
      case 'general':
        return <GeneralPanel />
      case 'notifications':
        return <NotificationPanel />
      case 'ai':
        return <LLMApiPanel />
      case 'sync':
        return <SyncPanel />
      case 'shortcuts':
        return <ShortcutsPanel />
      case 'system':
        return <SystemPanel />
      case 'perf':
        return <PerfPanel />
      case 'about':
        return <AboutPanel />
    }
  }

  const activeLabel = categories.find((c) => c.key === activeCategory)?.label || ''

  return (
    <div
      data-testid="settings-view"
      className="settings-view flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--color-bg-secondary)]"
    >
      {/* 顶部标题栏 */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 md:px-6">
        <h2 className="text-[18px] font-semibold leading-6 text-[var(--color-text-primary)]">设置</h2>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]"
          aria-label="关闭设置"
          title="关闭设置"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      {/* 主体：宽屏左导航，窄屏顶部分类 */}
      <div className="settings-body">
        <nav className="settings-nav" aria-label="设置分类">
          <div className="settings-nav-list">
            {categories.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setActiveCategory(cat.key)}
                data-testid={`settings-category-${cat.key}`}
                aria-current={activeCategory === cat.key ? 'page' : undefined}
                className={`settings-nav-item flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-colors ${
                  activeCategory === cat.key
                    ? 'border-r-2 border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <span className={activeCategory === cat.key ? 'opacity-100' : 'opacity-70'}>{cat.icon}</span>
                <span className="truncate">{cat.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* 内容区独立滚动，宽度跟随设置区域 */}
        <div className="settings-content-scroll" data-testid="settings-content-scroll">
          <div key={activeCategory} className="settings-content-inner animate-fade-in" data-testid="settings-content">
            <h3
              id="settings-content-title"
              data-testid="settings-content-title"
              className="mb-4 text-[15px] font-semibold text-[var(--color-text-primary)]"
            >
              {activeLabel}
            </h3>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  )
}
