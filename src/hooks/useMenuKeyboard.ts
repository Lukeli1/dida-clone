import { useState, useEffect, useRef, useCallback, createElement, createContext, useContext } from 'react'
import type { ReactNode, Dispatch, SetStateAction } from 'react'

/**
 * 菜单键盘导航 Hook + 作用域协调器。
 *
 * 设计要点：
 * - 主菜单使用垂直方向（↑↓），子菜单使用水平方向（←→），两者方向键天然不冲突。
 * - 但 Enter 在主菜单与多个子菜单同时挂载时会重复触发，因此引入「作用域协调器」：
 *   同一时刻只有一个作用域处于 active，只有 active 的作用域才处理方向键与 Enter；
 *   Escape 由所有作用域处理（关闭菜单是幂等的）。
 * - 主菜单默认 active（scope === 'main'）；子菜单在 hover / 展开时把自己设为 active。
 * - 当焦点位于 input / textarea / select / contentEditable 时，所有按键一律放行，
 *   保证自定义日期、新建标签等输入框不受键盘导航干扰。
 */

export interface MenuItemInfo {
  id: string
  label?: string
  disabled?: boolean
  onClick?: () => void
}

export interface UseMenuKeyboardOptions {
  /** 水平布局：使用 ←→ 代替 ↑↓ */
  horizontal?: boolean
  /** 是否激活当前作用域（非激活时方向键 / Enter 不响应，Escape 仍响应） */
  active?: boolean
  /** 选中项重置依赖：当其变化时把选中项重置为 0（用于切换菜单形态，如删除确认面板） */
  resetKey?: string
}

/* -------------------------------------------------------------------------- */
/*                            作用域协调器                                      */
/* -------------------------------------------------------------------------- */

interface MenuScopeContextValue {
  activeScope: string
  setActiveScope: Dispatch<SetStateAction<string>>
}

const MenuScopeContext = createContext<MenuScopeContextValue>({
  activeScope: 'main',
  setActiveScope: () => {},
})

/** 在菜单根部包裹，提供 activeScope 状态。 */
export function MenuKeyboardScopeProvider({ children }: { children: ReactNode }) {
  const [activeScope, setActiveScope] = useState('main')
  return createElement(MenuScopeContext.Provider, { value: { activeScope, setActiveScope } }, children)
}

/**
 * 子菜单通过该 hook 把自己注册为某个作用域：
 * - active: 当前作用域是否激活
 * - activate: 鼠标进入 / 展开时调用，把自己设为 active
 * - deactivate: 鼠标离开 / 收起时调用，回到 'main'
 */
export function useMenuScope(scopeId: string) {
  const { activeScope, setActiveScope } = useContext(MenuScopeContext)
  return {
    active: activeScope === scopeId,
    activate: useCallback(() => setActiveScope(scopeId), [scopeId, setActiveScope]),
    deactivate: useCallback(() => {
      setActiveScope((cur) => (cur === scopeId ? 'main' : cur))
    }, [scopeId, setActiveScope]),
  }
}

/* -------------------------------------------------------------------------- */
/*                              导航 Hook                                      */
/* -------------------------------------------------------------------------- */

export function useMenuKeyboard(items: MenuItemInfo[], onClose: () => void, options?: UseMenuKeyboardOptions) {
  const horizontal = options?.horizontal
  const active = options?.active ?? true
  const resetKey = options?.resetKey

  const [selectedIndex, setSelectedIndex] = useState(0)

  // 用 ref 持有最新值，避免每次选中变化都重新注册监听
  const itemsRef = useRef(items)
  itemsRef.current = items
  const selectedRef = useRef(0)
  selectedRef.current = selectedIndex
  const activeRef = useRef(active)
  activeRef.current = active
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const nextKey = horizontal ? 'ArrowRight' : 'ArrowDown'
  const prevKey = horizontal ? 'ArrowLeft' : 'ArrowUp'

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // 焦点在表单控件中时不拦截，保证输入正常
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      switch (e.key) {
        case nextKey: {
          if (!activeRef.current) return
          e.preventDefault()
          setSelectedIndex((i) => {
            const list = itemsRef.current
            const len = list.length
            if (len === 0) return i
            for (let step = 1; step <= len; step++) {
              const next = (i + step) % len
              if (!list[next]?.disabled) return next
            }
            return i
          })
          break
        }
        case prevKey: {
          if (!activeRef.current) return
          e.preventDefault()
          setSelectedIndex((i) => {
            const list = itemsRef.current
            const len = list.length
            if (len === 0) return i
            for (let step = 1; step <= len; step++) {
              const prev = (i - step + len) % len
              if (!list[prev]?.disabled) return prev
            }
            return i
          })
          break
        }
        case 'Enter': {
          if (!activeRef.current) return
          e.preventDefault()
          itemsRef.current[selectedRef.current]?.onClick?.()
          break
        }
        case 'Escape': {
          e.preventDefault()
          onCloseRef.current()
          break
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [nextKey, prevKey])

  // items 数量或 resetKey 变化时重置选中项
  useEffect(() => {
    setSelectedIndex(0)
  }, [items.length, resetKey])

  return { selectedIndex, setSelectedIndex }
}
