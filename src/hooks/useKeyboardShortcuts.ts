import { useEffect, useMemo, type RefObject } from 'react'
import { useUIStore } from '../stores/uiStore'
import { DEFAULT_SHORTCUT_BINDINGS, normalizeCombo, buildCombo } from '../utils/shortcuts'

/**
 * 键盘快捷键：从 DEFAULT_SHORTCUT_BINDINGS + uiStore.customShortcuts 合并配置，
 * 动态匹配按键组合并执行对应操作。
 *
 * 支持自定义的快捷键 ID：
 * - newTask: 聚焦新建任务输入框
 * - search: 聚焦搜索框
 * - toggleSidebar: 预留（侧边栏折叠功能暂未实现）
 * - viewTasks: 切换到任务列表
 * - viewCalendar: 切换到日历视图
 * - viewQuadrant: 切换到四象限
 * - viewPomodoro: 切换到番茄钟
 * - viewHabit: 切换到习惯打卡
 * - shortcutsHelp: 打开快捷键帮助面板
 *
 * F1 和 Esc 始终硬编码（不在自定义范围内）：
 * - F1: 打开快捷键帮助
 * - Esc: 关闭任务详情 / 清除搜索
 */
export function useKeyboardShortcuts(
  newTaskInputRef: RefObject<HTMLInputElement>,
  searchInputRef: RefObject<HTMLInputElement>,
) {
  const customShortcuts = useUIStore(s => s.customShortcuts)

  // 合并默认和自定义快捷键，构建 combo → id 映射
  const bindings = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of DEFAULT_SHORTCUT_BINDINGS) {
      const keys = customShortcuts[b.id] || b.defaultKeys
      map.set(normalizeCombo(keys), b.id)
    }
    return map
  }, [customShortcuts])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const { setSelectedTaskId, setSearchQuery, setCurrentView, setSelectedListId, setSelectedTagId, setShortcutsHelpOpen, toggleSidebar } = useUIStore.getState()

      // F1 始终打开快捷键帮助（不在自定义范围内）
      if (e.key === 'F1') {
        e.preventDefault()
        setShortcutsHelpOpen(true)
        return
      }

      // 构建当前按键组合
      const combo = buildCombo(e)
      // 对于 Shift 产生的符号键（如 ?），也尝试不含 Shift 的组合
      const altCombo = e.shiftKey ? combo.replace('Shift+', '') : combo
      const shortcutId = bindings.get(combo) || bindings.get(altCombo)

      if (!shortcutId) {
        // Esc 处理（不在自定义范围内）
        if (e.key === 'Escape') {
          if (useUIStore.getState().selectedTaskId !== null) {
            setSelectedTaskId(null)
          } else if (useUIStore.getState().searchQuery) {
            setSearchQuery('')
          }
        }
        return
      }

      // 检查当前焦点是否在输入框中
      const target = e.target as HTMLElement
      const isEditing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      e.preventDefault()

      switch (shortcutId) {
        case 'newTask':
          if (!isEditing) newTaskInputRef.current?.focus()
          break
        case 'search':
          searchInputRef.current?.focus()
          break
        case 'toggleSidebar':
          // 窄屏切换抽屉开关；桌面/平板切换折叠状态
          if (typeof window !== 'undefined' && window.innerWidth < 768) {
            const { sidebarOpen, setSidebarOpen } = useUIStore.getState()
            setSidebarOpen(!sidebarOpen)
          } else {
            toggleSidebar()
          }
          break
        case 'viewTasks':
          setCurrentView('tasks')
          setSelectedListId(null)
          setSelectedTagId(null)
          break
        case 'viewCalendar':
          setCurrentView('calendar')
          break
        case 'viewQuadrant':
          setCurrentView('quadrant')
          break
        case 'viewPomodoro':
          setCurrentView('pomodoro')
          break
        case 'viewHabit':
          setCurrentView('habit')
          break
        case 'shortcutsHelp':
          if (!isEditing) setShortcutsHelpOpen(true)
          break
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [bindings, newTaskInputRef, searchInputRef])
}
