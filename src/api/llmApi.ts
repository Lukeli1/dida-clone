import { invokeCommand as invoke } from './invokeClient'
import { listen } from '@tauri-apps/api/event'
import type { ChatMessage } from '../types'
import type { LLMConfig } from '../utils/llm'

/**
 * 流式 AI 对话：监听后端 `llm-chat-chunk` / `llm-chat-done` 事件实现打字机效果。
 *
 * 后端 command: `llm_chat_stream(config, messages, skill)`
 *   - 逐 token 发送 `llm-chat-chunk` 事件（payload 为本次 delta 字符串）
 *   - 全部输出完成后发送 `llm-chat-done` 事件（payload 为完整内容字符串）
 *
 * @returns 一个取消函数（unlisten），调用后停止接收后续事件，用于"停止生成"。
 *
 * 注意：这里不 `await invoke(...)`，而是 fire-and-forget + `.catch`，
 *       这样取消函数能在生成完成前就返回，使"停止生成"按钮可用。
 */
export async function llmChatStream(
  config: LLMConfig,
  messages: ChatMessage[],
  skill: string | null,
  onChunk: (delta: string) => void,
  onDone: (full: string) => void,
  onError: (err: string) => void,
): Promise<() => void> {
  const unlistenChunk = await listen<string>('llm-chat-chunk', (e) => onChunk(e.payload))
  const unlistenDone = await listen<string>('llm-chat-done', (e) => {
    onDone(e.payload)
    unlistenChunk()
    unlistenDone()
  })

  // 触发流式命令；失败时清理监听并回调 onError（回退到非流式）
  invoke('llm_chat_stream', { config, messages, skill }).catch((err) => {
    unlistenChunk()
    unlistenDone()
    onError(String(err))
  })

  // 返回取消函数：随时可停止接收事件
  return () => {
    unlistenChunk()
    unlistenDone()
  }
}
