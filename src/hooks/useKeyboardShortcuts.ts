import { useEffect, type RefObject } from 'react'
import { useUIStore } from '../stores/uiStore'

/**
 * 键盘快捷键：Ctrl+N 新建、Ctrl+F 搜索、Esc 关闭、Ctrl+1/2/3 视图切换
 * ? / F1 打开快捷键帮助面板
 */
export function useKeyboardShortcuts(
  newTaskInputRef: RefObject<HTMLInputElement>,
  searchInputRef: RefObject<HTMLInputElement>,
) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const { setSelectedTaskId, setSearchQuery, setCurrentView, setSelectedListId, setSelectedTagId, setShortcutsHelpOpen } = useUIStore.getState()

      // 检查当前焦点是否在输入框/文本域中（用于判断 ? 是否应触发帮助面板）
      const target = e.target as HTMLElement
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      // 快捷键帮助面板：? 或 F1（? = Shift+/，需检测 shiftKey）
      if (e.key === 'F1') {
        e.preventDefault()
        setShortcutsHelpOpen(true)
        return
      }
      if (!isEditing && (e.key === '?' || (e.shiftKey && (e.key === '/' || e.code === 'Slash')))) {
        e.preventDefault()
        setShortcutsHelpOpen(true)
        return
      }

      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        newTaskInputRef.current?.focus()
      }
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        if (useUIStore.getState().selectedTaskId !== null) {
          setSelectedTaskId(null)
        } else if (useUIStore.getState().searchQuery) {
          setSearchQuery('')
        }
      }
      if (e.ctrlKey && e.key === '1') {
        e.preventDefault()
        setCurrentView('tasks')
        setSelectedListId(null)
        setSelectedTagId(null)
      }
      if (e.ctrlKey && e.key === '2') {
        e.preventDefault()
        setCurrentView('today')
        setSelectedListId(null)
        setSelectedTagId(null)
      }
      if (e.ctrlKey && e.key === '3') {
        e.preventDefault()
        setCurrentView('calendar')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [newTaskInputRef, searchInputRef])
}
