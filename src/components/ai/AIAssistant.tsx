import { useState, useRef, useEffect } from 'react'
import { invokeCommand as invoke } from '../../api/invokeClient'
import { useWindowSize } from '../../hooks/useWindowSize'
import {
  chat,
  getLLMConfigAsync,
  AI_SKILLS,
  formatTasksContext,
  ACTION_SYSTEM_PROMPT,
  parseActions,
  type AISkill,
} from '../../utils/llm'
import { llmChatStream } from '../../api'
import { useAIStore } from '../../stores/aiStore'
import { useUIStore } from '../../stores/uiStore'
import { useAiUndoStore } from '../../stores/aiUndoStore'
import type { ChatMessage } from '../../types'
import type { AIAssistantProps, UIMessage } from './types'
import { stripActionsLive } from './ActionParser'
import { ChatMessageItem } from './ChatMessage'
import { WelcomeScreen } from './SkillSelector'
import { parsePreferences } from './preferences'
import { useConfirm } from '../common/ConfirmDialog'
import { ActionPreviewDialog } from './ActionPreviewDialog'
import { validateAiActions, executeAiActions, undoLastAiAction } from '../../utils/aiActionExecutor'
import type { ValidationResult } from '../../utils/aiActionSafety'
import { useTaskStore } from '../../stores/taskStore'
import { api } from '../../api'
import type { Task } from '../../types'

export function AIAssistant({ tasks, onClose, onTasksChange }: AIAssistantProps) {
  // 对话与偏好改为全局 store 持久化，关闭面板后对话记录保留
  const messages = useAIStore((s) => s.messages)
  const preferences = useAIStore((s) => s.preferences)
  const setMessages = useAIStore((s) => s.setMessages)
  const addPreference = useAIStore((s) => s.addPreference)
  const clearPreferences = useAIStore((s) => s.clearPreferences)
  // 偏好自动检测：当前待确认的偏好（绑定到产生它的消息索引）
  const [pendingPrefs, setPendingPrefs] = useState<{ index: number; prefs: string[] } | null>(null)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeSkill, setActiveSkill] = useState<AISkill | null>(null)
  const [showSkillMenu, setShowSkillMenu] = useState(false)
  // 动作预览对话框
  const [actionPreview, setActionPreview] = useState<ValidationResult | null>(null)
  const [previewMessageIndex, setPreviewMessageIndex] = useState<number | null>(null)
  // 撤销状态
  const undoRecord = useAiUndoStore((s) => s.lastRecord)
  const [undoInProgress, setUndoInProgress] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null) // 流式取消函数
  const settledRef = useRef(false) // 防止 done/error/stop 重复结算
  const confirm = useConfirm()
  const { isNarrow } = useWindowSize()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  // 从日历工具栏 "AI 排程" 按钮跳转过来时，自动填入预设消息
  useEffect(() => {
    const preset = useUIStore.getState().aiPresetMessage
    if (preset) {
      setInput(preset)
      useUIStore.getState().setAiPresetMessage(null)
      // 延迟聚焦，等待 textarea 渲染
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [])

  /** 检测用户输入是否包含排程意图 */
  function detectSchedulingIntent(text: string): boolean {
    const keywords = ['安排明天', '排程', '规划日程', '安排任务', 'schedule', 'plan tomorrow', '安排一下', '帮我安排']
    const lower = text.toLowerCase()
    return keywords.some((k) => lower.includes(k.toLowerCase()))
  }

  function handleSelectSkill(skill: AISkill) {
    setActiveSkill(skill)
    setShowSkillMenu(false)
    const needsTasks = !['task-template', 'breakdown'].includes(skill.id)
    if (needsTasks) {
      sendMessage(skill.buildPrompt(tasks), skill.id)
    } else {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `已选择技能：${skill.icon} ${skill.name}\n\n${skill.id === 'task-template' ? '请描述你要生成模板的场景（如"开会"、"出差"、"项目启动"）：' : '请输入你要拆解的任务标题和描述：'}`,
          skillId: skill.id,
        },
      ])
      inputRef.current?.focus()
    }
  }

  async function sendMessage(content: string, skillId?: string) {
    if (!content.trim() || isStreaming) return
    // 开始新一轮对话，清除上一轮的偏好提示条
    setPendingPrefs(null)

    const config = await getLLMConfigAsync()
    if (!config) {
      setMessages((prev) => [
        ...prev,
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
    const skillObj = skillId ? AI_SKILLS.find((s) => s.id === skillId) : activeSkill
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
    // 注入已保存的用户偏好，让 AI 在后续对话中遵循
    if (preferences.length > 0) {
      systemPrompt += `\n\n## 用户偏好（请遵循这些偏好）\n${preferences.map((p) => `- ${p}`).join('\n')}`
    }

    const history = newMessages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }))

    const backendMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content },
    ]

    const skill = skillId ?? activeSkill?.id ?? null
    setMessages((prev) => [...prev, { role: 'assistant', content: '', skillId, isStreaming: true }])

    let accumulated = ''

    const finalize = (full: string) => {
      if (settledRef.current) return
      settledRef.current = true
      const { actions, cleanedText } = parseActions(full)

      // 校验动作并构建预览
      let pendingPreview: ValidationResult | null = null
      if (actions.length > 0) {
        pendingPreview = validateAiActions(actions, tasks)
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.isStreaming ? { ...m, content: cleanedText || full, skillId, pendingPreview, isStreaming: false } : m,
        ),
      )
      setIsStreaming(false)
      cleanupRef.current = null
      // 偏好自动检测：从用户输入 + AI 回复中提取偏好，提示用户确认保存
      const detected = parsePreferences(`${content}\n${cleanedText || full}`)
      if (detected.length > 0) {
        const idx = useAIStore.getState().messages.length - 1
        setPendingPrefs({ index: idx, prefs: detected })
      }
    }

    const failWith = (errMsg: string) => {
      if (settledRef.current) return
      settledRef.current = true
      setMessages((prev) =>
        prev.map((m) =>
          m.isStreaming
            ? { ...m, content: `❌ 出错了：${errMsg}\n\n请检查设置中的大模型 API 配置。`, isStreaming: false }
            : m,
        ),
      )
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
        config,
        backendMessages,
        skill,
        (delta) => {
          if (settledRef.current) return
          accumulated += delta
          const display = stripActionsLive(accumulated)
          setMessages((prev) => prev.map((m) => (m.isStreaming ? { ...m, content: display } : m)))
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
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false, content: m.content || '（已停止生成）' } : m)),
    )
    setIsStreaming(false)
  }

  /** 打开动作预览对话框 */
  function handlePreviewActions(messageIndex: number) {
    const msg = useAIStore.getState().messages[messageIndex]
    if (!msg?.pendingPreview) return
    setActionPreview(msg.pendingPreview)
    setPreviewMessageIndex(messageIndex)
  }

  /** 忽略待确认的操作 */
  function handleRejectActions(messageIndex: number) {
    setMessages((prev) => prev.map((m, i) => (i === messageIndex ? { ...m, pendingPreview: null } : m)))
    setMessages((prev) => [...prev, { role: 'assistant', content: '已忽略该操作建议。' }])
  }

  /** 确认执行预览中的动作 */
  async function handleConfirmActions() {
    if (!actionPreview || previewMessageIndex === null) {
      setActionPreview(null)
      setPreviewMessageIndex(null)
      return
    }

    // 先刷新任务列表，确保执行前重新校验时拿到的是最新数据
    // M1: 如果刷新失败，直接阻止执行，防止用过时数据通过快照校验
    try {
      await useTaskStore.getState().loadTasks()
    } catch {
      setActionPreview(null)
      setPreviewMessageIndex(null)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '❌ 无法刷新任务列表，请检查网络后重试' },
      ])
      return
    }
    // loadTasks 内部 catch 了错误不抛出，因此需要检查数据是否实际更新
    // 通过直接调用 api.getTasks() 确保拿到最新数据
    let currentTasks: Task[]
    try {
      currentTasks = await api.getTasks()
      // 同步更新 store
      useTaskStore.getState().setTasks(currentTasks)
    } catch {
      setActionPreview(null)
      setPreviewMessageIndex(null)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '❌ 无法获取最新任务列表，请检查网络后重试' },
      ])
      return
    }
    const tasksBefore = [...currentTasks]

    const validatedActions = actionPreview.valid.map((v) => v.action)

    // 从消息中保存的 pendingPreview 获取 expected token（独立可信来源）
    // 这样可以防止 actionPreview 状态被篡改后 token 仍然匹配
    const msgIndex = previewMessageIndex
    const savedMsg = messages[msgIndex]
    const savedPendingPreview = savedMsg?.pendingPreview
    const expectedToken = savedPendingPreview?.proposalToken ?? ''

    const result = await executeAiActions(
      validatedActions,
      tasksBefore,
      actionPreview.proposalToken,
      expectedToken,
      actionPreview.taskSnapshotVersion,
      currentTasks,
    )

    // 清除预览状态
    setActionPreview(null)
    setPreviewMessageIndex(null)

    if (result.success) {
      // 清除消息上的 pendingPreview
      setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, pendingPreview: null } : m)))
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `✅ 已执行 ${result.summaries.length} 项操作：\n${result.summaries.join('\n')}${result.undoSummary ? `\n\n💡 可点击撤销按钮恢复本次操作` : ''}`,
        },
      ])
      await onTasksChange?.()
    } else {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `❌ 执行失败：${result.error}` },
      ])
    }
  }

  /** 取消预览 */
  function handleCancelActions() {
    setActionPreview(null)
    setPreviewMessageIndex(null)
  }

  /** 撤销最近一次 AI 操作 */
  async function handleUndo() {
    if (undoInProgress) return
    const record = useAiUndoStore.getState().lastRecord
    if (!record || record.undone) return

    setUndoInProgress(true)
    try {
      let currentTasks: Task[]
      try {
        currentTasks = await api.getTasks()
        useTaskStore.getState().setTasks(currentTasks)
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '❌ 无法获取最新任务列表，已取消撤销以保护用户改动' },
        ])
        return
      }

      const result = await undoLastAiAction(currentTasks)

      if (result.success) {
        const parts: string[] = []
        if (result.summaries.length > 0) parts.push(result.summaries.join('\n'))
        if (result.skipped.length > 0) parts.push(`⚠️ 以下条目无法撤销：\n${result.skipped.join('\n')}`)
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `↩️ 撤销结果：\n${parts.join('\n\n') || '无变更'}` },
        ])
        await onTasksChange?.()
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `❌ 撤销失败：${result.error}` },
        ])
      }
    } finally {
      setUndoInProgress(false)
    }
  }

  function handleSend() {
    // 排程意图检测：用户输入包含排程关键词时，自动使用智能排程技能
    if (detectSchedulingIntent(input)) {
      const skill = AI_SKILLS.find((s) => s.id === 'auto-schedule')
      if (skill) {
        setActiveSkill(skill)
        sendMessage(skill.buildPrompt(tasks), skill.id)
        return
      }
    }
    sendMessage(input)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleClearChat() {
    const ok = await confirm({
      title: '清空对话',
      message: '确定要清空所有对话记录吗？此操作不可撤销。',
      danger: true,
      confirmText: '清空',
      cancelText: '取消',
    })
    if (!ok) return
    cleanupRef.current?.()
    cleanupRef.current = null
    settledRef.current = true
    setIsStreaming(false)
    setPendingPrefs(null)
    setMessages([])
    setActiveSkill(null)
    setShowSkillMenu(false)
    setActionPreview(null)
    setPreviewMessageIndex(null)
  }

  // 保存本轮检测到的偏好
  function handleSavePrefs() {
    if (!pendingPrefs) return
    pendingPrefs.prefs.forEach((p) => addPreference(p))
    setPendingPrefs(null)
  }

  // 忘记所有已保存的偏好
  async function handleForgetPrefs() {
    const ok = await confirm({
      title: '忘记所有偏好',
      message: `确定要忘记全部 ${preferences.length} 条已保存的用户偏好吗？此操作不可撤销。`,
      danger: true,
      confirmText: '忘记',
      cancelText: '取消',
    })
    if (!ok) return
    clearPreferences()
  }

  const canUndo = undoRecord && !undoRecord.undone

  return (
    <div
      className={`${isNarrow ? 'fixed inset-0 z-50' : 'flex-1'} flex flex-col overflow-hidden bg-[var(--color-surface)]`}
    >
      <header className="bg-[var(--color-ai)] px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">AI 助手</h2>
            <p className="text-xs text-white/80">
              {activeSkill ? `${activeSkill.icon} ${activeSkill.name}` : '智能任务管理助手'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* 撤销按钮 */}
          {canUndo && (
            <button
              onClick={handleUndo}
              disabled={undoInProgress}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-40"
              title={`撤销：${undoRecord!.summary}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="清空对话"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
          {preferences.length > 0 && (
            <button
              onClick={handleForgetPrefs}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors relative"
              title={`忘记所有偏好（已记住 ${preferences.length} 条）`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" strokeWidth={2} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9l-6 6m0-6l6 6" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-white/90 text-[var(--color-ai)] text-[10px] font-bold flex items-center justify-center">
                {preferences.length}
              </span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && <WelcomeScreen onSendQuickQuestion={(q) => sendMessage(q)} />}
        {messages.map((msg, i) => (
          <div key={i}>
            <ChatMessageItem
              msg={msg}
              index={i}
              onPreviewActions={handlePreviewActions}
              onRejectActions={handleRejectActions}
            />
            {pendingPrefs && pendingPrefs.index === i && (
              <div className="mt-2 ml-10 p-2.5 bg-[var(--color-accent-light)] border border-[var(--color-accent)]/20 rounded-lg flex items-start gap-2 animate-slide-down">
                <span className="text-sm leading-5">💡</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--color-text-secondary)] mb-0.5">检测到偏好：</p>
                  <p className="text-sm text-[var(--color-text-primary)] break-words leading-5">
                    {pendingPrefs.prefs.join('；')}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={handleSavePrefs}
                    className="px-2.5 py-1 text-xs bg-[var(--color-accent)] text-white rounded-md hover:brightness-110 transition-all font-medium"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setPendingPrefs(null)}
                    className="px-2.5 py-1 text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-md hover:brightness-95 transition-all"
                  >
                    忽略
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
        {activeSkill && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-[var(--color-accent-light)] rounded-lg animate-slide-down">
            <span className="text-xs text-[var(--color-accent)]">
              {activeSkill.icon} {activeSkill.name} 模式
            </span>
            <button
              onClick={() => {
                setActiveSkill(null)
              }}
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] ml-auto"
            >
              退出 ✕
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming ? 'AI 正在生成中…' : activeSkill ? '请输入...' : '输入问题，或点击闪电⚡使用技能...'
            }
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
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </button>

            {showSkillMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSkillMenu(false)} />
                <div
                  className="absolute bottom-full right-0 mb-2 w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg z-50 overflow-hidden animate-scale-in origin-bottom-right"
                  style={{ boxShadow: 'var(--shadow-modal)' }}
                >
                  <div className="p-2 border-b border-[var(--color-border-light)]">
                    <p className="text-xs font-medium text-[var(--color-text-secondary)]">⚡ 快捷技能</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {AI_SKILLS.map((skill) => (
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
            <button
              onClick={handleStop}
              className="w-10 h-10 flex items-center justify-center bg-[var(--color-danger)] text-white rounded-xl hover:brightness-110 transition-all flex-shrink-0"
              title="停止生成"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-10 h-10 flex items-center justify-center bg-[var(--color-accent)] text-white rounded-xl hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              title="发送"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 动作预览对话框 */}
      {actionPreview && (
        <ActionPreviewDialog
          validActions={actionPreview.valid}
          errors={actionPreview.errors}
          onConfirm={handleConfirmActions}
          onCancel={handleCancelActions}
        />
      )}
    </div>
  )
}
