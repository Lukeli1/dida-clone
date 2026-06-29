import { useState, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  chat, getLLMConfig, AI_SKILLS, formatTasksContext,
  ACTION_SYSTEM_PROMPT, parseActions,
  type AISkill, type ActionOp,
} from '../../utils/llm'
import { llmChatStream } from '../../api'
import type { ChatMessage } from '../../types'
import type { AIAssistantProps, UIMessage } from './types'
import { stripActionsLive, executeAction } from './ActionParser'
import { ChatMessageItem } from './ChatMessage'
import { WelcomeScreen } from './SkillSelector'

export function AIAssistant({ tasks, onClose, onTasksChange }: AIAssistantProps) {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeSkill, setActiveSkill] = useState<AISkill | null>(null)
  const [showSkillMenu, setShowSkillMenu] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null) // 流式取消函数
  const settledRef = useRef(false) // 防止 done/error/stop 重复结算

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  useEffect(() => {
    return () => { cleanupRef.current?.(); cleanupRef.current = null }
  }, [])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  function handleSelectSkill(skill: AISkill) {
    setActiveSkill(skill)
    setShowSkillMenu(false)
    const needsTasks = !['task-template', 'breakdown'].includes(skill.id)
    if (needsTasks) {
      sendMessage(skill.buildPrompt(tasks), skill.id)
    } else {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `已选择技能：${skill.icon} ${skill.name}\n\n${skill.id === 'task-template' ? '请描述你要生成模板的场景（如"开会"、"出差"、"项目启动"）：' : '请输入你要拆解的任务标题和描述：'}`,
        skillId: skill.id,
      }])
      inputRef.current?.focus()
    }
  }

  async function sendMessage(content: string, skillId?: string) {
    if (!content.trim() || isStreaming) return

    const config = getLLMConfig()
    if (!config) {
      setMessages(prev => [...prev,
        { role: 'user' as const, content },
        { role: 'assistant' as const, content: '请先在设置中配置大模型 API（Base URL、API Key、Model）后重试。' },
      ])
      return
    }

    const userMsg: UIMessage = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setIsStreaming(true)
    settledRef.current = false

    let systemPrompt = ACTION_SYSTEM_PROMPT
    // 优先用传入的 skillId 查找技能（避免闭包内 activeSkill 尚未更新）
    const skillObj = skillId ? AI_SKILLS.find(s => s.id === skillId) : activeSkill
    if (skillObj) {
      systemPrompt += `\n\n当前技能模式：${skillObj.name} - ${skillObj.description}`
    }
    // 注入当前准确时间，让 AI 能正确解析"明天""下周三"等相对日期
    const now = new Date()
    const timeZone = 'Asia/Shanghai (UTC+8)'
    systemPrompt += `\n\n## 当前时间（用于解析相对日期，务必以此为准）`
    systemPrompt += `\nISO: ${now.toISOString()}`
    systemPrompt += `\n本地时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} (${timeZone})`
    systemPrompt += `\n星期: ${['日', '一', '二', '三', '四', '五', '六'][now.getDay()]}`
    systemPrompt += `\n\n用户当前任务列表：\n${formatTasksContext(tasks)}`

    const history = newMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))

    const backendMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content },
    ]

    const skill = skillId ?? activeSkill?.id ?? null
    const assistantIdx = newMessages.length
    setMessages(prev => [...prev, { role: 'assistant', content: '', skillId, isStreaming: true }])

    let accumulated = ''

    const finalize = (full: string) => {
      if (settledRef.current) return
      settledRef.current = true
      const { actions, cleanedText } = parseActions(full)
      setMessages(prev => prev.map((m, i) =>
        i === assistantIdx
          ? { ...m, content: cleanedText || full, skillId, pendingAction: actions[0], isStreaming: false }
          : m
      ))
      setIsStreaming(false)
      cleanupRef.current = null
    }

    const failWith = (errMsg: string) => {
      if (settledRef.current) return
      settledRef.current = true
      setMessages(prev => prev.map((m, i) =>
        i === assistantIdx
          ? { ...m, content: `❌ 出错了：${errMsg}\n\n请检查设置中的大模型 API 配置。`, isStreaming: false }
          : m
      ))
      setIsStreaming(false)
      cleanupRef.current = null
    }

    const fallback = async () => {
      try {
        const reply = await chat(systemPrompt, content, history)
        finalize(reply)
      } catch (e: any) {
        failWith(e.message || String(e))
      }
    }

    try {
      cleanupRef.current = await llmChatStream(
        config, backendMessages, skill,
        (delta) => {
          if (settledRef.current) return
          accumulated += delta
          const display = stripActionsLive(accumulated)
          setMessages(prev => prev.map((m, i) => i === assistantIdx ? { ...m, content: display } : m))
        },
        (full) => finalize(full),
        () => fallback(),
      )
    } catch {
      await fallback()
    }
  }

  function handleStop() {
    cleanupRef.current?.()
    cleanupRef.current = null
    invoke('cancel_llm_chat').catch(() => {})
    settledRef.current = true
    setMessages(prev => prev.map(m =>
      m.isStreaming ? { ...m, isStreaming: false, content: m.content || '（已停止生成）' } : m
    ))
    setIsStreaming(false)
  }

  async function handleExecuteAction(action: ActionOp, messageIndex: number) {
    try {
      const resultMsg = await executeAction(action, tasks)
      setMessages(prev => prev.map((m, i) => i === messageIndex ? { ...m, pendingAction: undefined } : m))
      setMessages(prev => [...prev, { role: 'assistant', content: resultMsg }])
      onTasksChange?.()
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ 执行失败：${e.message || String(e)}` }])
    }
  }

  function handleRejectAction(messageIndex: number) {
    setMessages(prev => prev.map((m, i) => i === messageIndex ? { ...m, pendingAction: undefined } : m))
    setMessages(prev => [...prev, { role: 'assistant', content: '已取消该操作。' }])
  }

  function handleSend() { sendMessage(input) }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function handleClearChat() {
    cleanupRef.current?.()
    cleanupRef.current = null
    settledRef.current = true
    setIsStreaming(false)
    setMessages([])
    setActiveSkill(null)
    setShowSkillMenu(false)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-surface)]">
      <header className="bg-gradient-to-r from-purple-500 to-purple-600 px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">AI 助手</h2>
            <p className="text-xs text-purple-100">
              {activeSkill ? `${activeSkill.icon} ${activeSkill.name}` : '智能任务管理助手'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={handleClearChat} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="清空对话">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          )}
          <button onClick={onClose} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="关闭">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && <WelcomeScreen onSendQuickQuestion={(q) => sendMessage(q)} />}
        {messages.map((msg, i) => (
          <ChatMessageItem key={i} msg={msg} index={i} onExecuteAction={handleExecuteAction} onRejectAction={handleRejectAction} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
        {activeSkill && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-[var(--color-accent-light)] rounded-lg">
            <span className="text-xs text-[var(--color-accent)]">{activeSkill.icon} {activeSkill.name} 模式</span>
            <button onClick={() => { setActiveSkill(null) }} className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] ml-auto">退出 ✕</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={isStreaming ? 'AI 正在生成中…' : (activeSkill ? '请输入...' : '输入问题，或点击闪电⚡使用技能...')}
            rows={1}
            className="flex-1 px-3.5 py-2.5 text-sm border border-[var(--color-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 focus:border-[var(--color-accent)] resize-none max-h-30"
            style={{ minHeight: '42px' }}
          />

          {/* 技能按钮 */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowSkillMenu(!showSkillMenu)}
              disabled={isStreaming}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${showSkillMenu || activeSkill ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'}`}
              title="快捷技能"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </button>

            {showSkillMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSkillMenu(false)} />
                <div className="absolute bottom-full right-0 mb-2 w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="p-2 border-b border-[var(--color-border-light)]">
                    <p className="text-xs font-medium text-[var(--color-text-secondary)]">⚡ 快捷技能</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {AI_SKILLS.map(skill => (
                      <button
                        key={skill.id}
                        onClick={() => handleSelectSkill(skill)}
                        className="w-full flex items-center gap-3 p-2.5 hover:bg-[var(--color-accent-light)] transition-colors text-left"
                      >
                        <span className="text-xl">{skill.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[var(--color-text-primary)]">{skill.name}</div>
                          <div className="text-xs text-[var(--color-text-tertiary)] truncate">{skill.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {isStreaming ? (
            <button onClick={handleStop} className="w-10 h-10 flex items-center justify-center bg-[var(--color-danger)] text-white rounded-xl hover:bg-[var(--color-danger)] transition-colors flex-shrink-0" title="停止生成">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()} className="w-10 h-10 flex items-center justify-center bg-[var(--color-accent)] text-white rounded-xl hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0" title="发送">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
