import { useState, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  chat, getLLMConfig, AI_SKILLS, formatTasksContext,
  ACTION_SYSTEM_PROMPT, parseActions,
  type AISkill, type ActionOp,
} from '../utils/llm'
import { api, llmChatStream } from '../api'
import type { Task, ChatMessage } from '../types'

interface AIAssistantProps {
  tasks: Task[]
  onClose: () => void
  onTasksChange?: () => void  // 任务变更后刷新数据
}

interface UIMessage {
  role: 'user' | 'assistant'
  content: string
  skillId?: string
  pendingAction?: ActionOp  // 待确认的操作
  isStreaming?: boolean      // 当前正在流式生成中（用于打字机光标）
}

export function AIAssistant({ tasks, onClose, onTasksChange }: AIAssistantProps) {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeSkill, setActiveSkill] = useState<AISkill | null>(null)
  const [showSkills, setShowSkills] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // llmChatStream 返回的取消函数（unlisten），用于"停止生成"
  const cleanupRef = useRef<(() => void) | null>(null)
  // 防止 done/error/stop 重复结算同一条回复
  const settledRef = useRef(false)

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  // 组件卸载时清理流式监听，避免内存泄漏与卸载后 setState
  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])

  // 自动调整输入框高度
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  // 选择技能
  function handleSelectSkill(skill: AISkill) {
    setActiveSkill(skill)
    setShowSkills(false)
    // 需要任务数据的技能直接执行
    const needsTasks = !['task-template', 'breakdown'].includes(skill.id)
    if (needsTasks) {
      sendMessage(skill.buildPrompt(tasks), skill.id)
    } else {
      // 需要用户补充输入的技能，提示用户
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `已选择技能：${skill.icon} ${skill.name}\n\n${skill.id === 'task-template' ? '请描述你要生成模板的场景（如"开会"、"出差"、"项目启动"）：' : '请输入你要拆解的任务标题和描述：'}`,
        skillId: skill.id,
      }])
      inputRef.current?.focus()
    }
  }

  /** 流式渲染时隐藏（可能尚未闭合的）操作指令块，避免露出原始 JSON */
  function stripActionsLive(text: string): string {
    return text
      .replace(/\[\[ACTION\]\][\s\S]*?\[\[\/ACTION\]\]/g, '')
      .replace(/\[\[ACTION\]\][\s\S]*$/, '')   // 流式中尚未闭合的块
      .replace(/\n{3,}/g, '\n\n')
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

    // 构建 system prompt
    let systemPrompt = ACTION_SYSTEM_PROMPT
    // 优先用传入的 skillId 查找技能（避免 setActiveSkill 后闭包内 activeSkill 尚未更新）
    const skillObj = skillId ? AI_SKILLS.find(s => s.id === skillId) : activeSkill
    if (skillObj) {
      systemPrompt += `\n\n当前技能模式：${skillObj.name} - ${skillObj.description}`
    }
    // 注入当前准确时间（关键！让 AI 能正确解析"明天""下周三"等相对日期）
    const now = new Date()
    const timeZone = 'Asia/Shanghai (UTC+8)'
    systemPrompt += `\n\n## 当前时间（用于解析相对日期，务必以此为准）`
    systemPrompt += `\nISO: ${now.toISOString()}`
    systemPrompt += `\n本地时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} (${timeZone})`
    systemPrompt += `\n星期: ${['日', '一', '二', '三', '四', '五', '六'][now.getDay()]}`
    // 始终附带任务上下文（让 AI 能回答任务相关问题）
    systemPrompt += `\n\n用户当前任务列表：\n${formatTasksContext(tasks)}`

    // 构建历史（排除当前消息）
    const history = newMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))

    // 发送给后端的完整消息（system + history + user）
    const backendMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content },
    ]

    const skill = skillId ?? activeSkill?.id ?? null

    // 占位 assistant 消息：流式逐字填充（打字机效果）
    const assistantIdx = newMessages.length
    setMessages(prev => [...prev, { role: 'assistant', content: '', skillId, isStreaming: true }])

    let accumulated = ''

    // 流式完成：解析操作指令并定稿
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

    // 流式失败：在占位消息上显示错误
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

    // 流式不可用时回退到非流式 chat
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
          setMessages(prev => prev.map((m, i) =>
            i === assistantIdx ? { ...m, content: display } : m
          ))
        },
        (full) => finalize(full),
        () => fallback(),
      )
    } catch {
      // 监听设置本身异常时，回退到非流式
      await fallback()
    }
  }

  // 停止生成：取消监听 + 保留已生成内容
  function handleStop() {
    cleanupRef.current?.()
    cleanupRef.current = null
    // 通知后端取消（如后端实现了该 command，失败则忽略）
    invoke('cancel_llm_chat').catch(() => {})
    // 阻止后续 chunk/done 事件再次结算
    settledRef.current = true
    setMessages(prev => prev.map(m =>
      m.isStreaming ? { ...m, isStreaming: false, content: m.content || '（已停止生成）' } : m
    ))
    setIsStreaming(false)
  }

  // 执行操作指令
  async function handleExecuteAction(action: ActionOp, messageIndex: number) {
    try {
      const { type, data } = action
      let resultMsg = ''

      switch (type) {
        case 'create_task': {
          const listId = tasks[0]?.list_id ?? 1
          await api.createTask({
            title: data.title,
            due_date: data.due_date,
            priority: data.priority ?? 0,
            notes: data.notes,
            list_id: listId,
          })
          resultMsg = `✅ 已创建任务：${data.title}`
          break
        }
        case 'update_task': {
          await api.updateTask(data.task_id, data.updates)
          resultMsg = `✅ 已更新任务 #${data.task_id}`
          break
        }
        case 'delete_task': {
          await api.deleteTask(data.task_id)
          resultMsg = `✅ 已删除任务 #${data.task_id}`
          break
        }
        case 'complete_task': {
          await api.updateTask(data.task_id, { completed: true })
          resultMsg = `✅ 已完成任务 #${data.task_id}`
          break
        }
        case 'create_subtask': {
          await api.createTask({
            title: data.title,
            priority: data.priority ?? 0,
            parent_id: data.parent_id,
            list_id: tasks.find(t => t.id === data.parent_id)?.list_id ?? 1,
          })
          resultMsg = `✅ 已为任务 #${data.parent_id} 添加子任务：${data.title}`
          break
        }
        default:
          resultMsg = `❌ 未知操作类型：${type}`
      }

      // 标记该消息的操作已执行
      setMessages(prev => prev.map((m, i) =>
        i === messageIndex ? { ...m, pendingAction: undefined } : m
      ))
      // 追加执行结果消息
      setMessages(prev => [...prev, { role: 'assistant', content: resultMsg }])
      // 通知父组件刷新任务
      onTasksChange?.()
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ 执行失败：${e.message || String(e)}`,
      }])
    }
  }

  // 拒绝操作
  function handleRejectAction(messageIndex: number) {
    setMessages(prev => prev.map((m, i) =>
      i === messageIndex ? { ...m, pendingAction: undefined } : m
    ))
    setMessages(prev => [...prev, { role: 'assistant', content: '已取消该操作。' }])
  }

  function handleSend() {
    sendMessage(input)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleClearChat() {
    // 若正在生成，先停止
    cleanupRef.current?.()
    cleanupRef.current = null
    settledRef.current = true
    setIsStreaming(false)
    setMessages([])
    setActiveSkill(null)
    setShowSkills(true)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* 头部 */}
      <header className="bg-gradient-to-r from-purple-500 to-purple-600 px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">AI 助手</h2>
            <p className="text-xs text-purple-100">
              {activeSkill ? `${activeSkill.icon} ${activeSkill.name}` : '智能任务管理助手'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSkills(!showSkills)}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="技能列表"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="清空对话"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
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

      {/* 技能栏 */}
      {showSkills && (
        <div className="border-b border-gray-100 bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-500 mb-2">⚡ 快捷技能</p>
          <div className="grid grid-cols-5 gap-2">
            {AI_SKILLS.map(skill => (
              <button
                key={skill.id}
                onClick={() => handleSelectSkill(skill)}
                className="flex flex-col items-center gap-1 p-2.5 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all group"
                title={skill.description}
              >
                <span className="text-xl group-hover:scale-110 transition-transform">{skill.icon}</span>
                <span className="text-xs text-gray-600 group-hover:text-purple-600">{skill.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">AI 任务助手</h3>
            <p className="text-sm text-gray-500 max-w-xs mb-4">
              我可以帮你管理任务、生成报告、智能搜索、拆解任务等。
              点击上方技能快捷使用，或直接输入问题。
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {['我今天的任务有哪些？', '帮我生成本周周报', '哪些任务比较紧急？'].map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-purple-50 hover:text-purple-600 text-gray-600 rounded-full transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex gap-2.5 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {/* 头像 */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                msg.role === 'user'
                  ? 'bg-blue-500'
                  : 'bg-gradient-to-br from-purple-400 to-purple-600'
              }`}>
                {msg.role === 'user' ? (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                )}
              </div>
              {/* 消息内容 */}
              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white rounded-tr-sm'
                  : 'bg-gray-100 text-gray-800 rounded-tl-sm'
              }`}>
                {msg.isStreaming && !msg.content ? (
                  /* 等待首个 token：三个跳动的点 */
                  <div className="flex gap-1 py-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                  <>
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    {/* 流式生成中的闪烁光标 */}
                    {msg.isStreaming && <span className="ai-cursor" />}
                  </>
                )}
                {/* 操作确认卡片 */}
                {msg.pendingAction && (
                  <div className="mt-3 p-3 bg-white border border-amber-200 rounded-xl shadow-sm">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-amber-500 text-base">⚡</span>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-amber-700 mb-0.5">AI 建议执行操作</p>
                        <p className="text-sm text-gray-700">{msg.pendingAction.description}</p>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 mb-2.5">
                      <pre className="text-xs text-gray-500 overflow-x-auto">{JSON.stringify(msg.pendingAction.data, null, 2)}</pre>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleExecuteAction(msg.pendingAction!, i)}
                        className="flex-1 px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
                      >
                        ✓ 确认执行
                      </button>
                      <button
                        onClick={() => handleRejectAction(i)}
                        className="flex-1 px-3 py-1.5 text-xs bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        ✕ 取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区 */}
      <div className="border-t border-gray-200 p-3 bg-white">
        {activeSkill && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-purple-50 rounded-lg">
            <span className="text-xs text-purple-600">
              {activeSkill.icon} {activeSkill.name} 模式
            </span>
            <button
              onClick={() => { setActiveSkill(null); setShowSkills(true) }}
              className="text-xs text-gray-400 hover:text-gray-600 ml-auto"
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
            placeholder={isStreaming ? 'AI 正在生成中…' : (activeSkill ? '请输入...' : '输入问题，或点击技能快捷使用...')}
            rows={1}
            className="flex-1 px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 resize-none max-h-30"
            style={{ minHeight: '42px' }}
          />
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="w-10 h-10 flex items-center justify-center bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors flex-shrink-0"
              title="停止生成"
            >
              {/* 停止图标 */}
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-10 h-10 flex items-center justify-center bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              title="发送"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
