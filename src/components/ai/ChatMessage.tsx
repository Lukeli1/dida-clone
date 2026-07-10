import type { UIMessage } from './types'

interface ChatMessageItemProps {
  msg: UIMessage
  index: number
  onPreviewActions?: (messageIndex: number) => void
  onRejectActions?: (messageIndex: number) => void
}

/** 单条消息渲染（含打字机光标、操作预览入口） */
export function ChatMessageItem({ msg, index, onPreviewActions, onRejectActions }: ChatMessageItemProps) {
  const hasPendingPreview = msg.pendingPreview && (msg.pendingPreview.valid.length > 0 || msg.pendingPreview.errors.length > 0)

  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
      <div className={`flex gap-2.5 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
        {/* 头像 */}
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            msg.role === 'user' ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-ai)]'
          }`}
        >
          {msg.role === 'user' ? (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          )}
        </div>
        {/* 消息内容 */}
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
            msg.role === 'user'
              ? 'bg-[var(--color-accent)] text-white rounded-tr-sm'
              : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded-tl-sm'
          }`}
        >
          {msg.isStreaming && !msg.content ? (
            /* 等待首个 token：三个跳动的点 */
            <div className="flex gap-1 py-1">
              <span
                className="w-2 h-2 bg-[var(--color-text-tertiary)] rounded-full animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-2 h-2 bg-[var(--color-text-tertiary)] rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-2 h-2 bg-[var(--color-text-tertiary)] rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          ) : (
            <>
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              {/* 流式生成中的闪烁光标 */}
              {msg.isStreaming && <span className="ai-cursor" />}
            </>
          )}
          {/* 操作预览入口卡片 */}
          {hasPendingPreview && (
            <div className="mt-3 p-3 bg-[var(--color-surface)] border border-[var(--color-warning)]/30 rounded-xl shadow-sm animate-scale-in">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-[var(--color-warning)] text-base">⚡</span>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-[var(--color-warning)] mb-0.5">
                    AI 建议执行 {msg.pendingPreview!.valid.length + msg.pendingPreview!.errors.length} 项操作
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {msg.pendingPreview!.valid.length} 项可执行
                    {msg.pendingPreview!.errors.length > 0 && `，${msg.pendingPreview!.errors.length} 项校验失败`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onPreviewActions?.(index)}
                  className="flex-1 px-3 py-1.5 text-xs bg-[var(--color-accent)] text-white rounded-lg hover:brightness-110 transition-all font-medium"
                >
                  📋 查看预览
                </button>
                <button
                  onClick={() => onRejectActions?.(index)}
                  className="flex-1 px-3 py-1.5 text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)]/80 transition-colors"
                >
                  ✕ 忽略
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
