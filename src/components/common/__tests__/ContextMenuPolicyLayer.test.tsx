import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextMenuPolicyLayer } from '../ContextMenuPolicyLayer'

/**
 * 右键菜单集中策略层回归：
 * - 普通非编辑区域阻止 WebView 默认浏览器菜单（返回/刷新/另存为/打印不回业务区域）
 * - 普通区域有选中文本时提供只含实际可用操作的「复制」菜单
 * - input / textarea / contenteditable 及其子元素保留系统文本编辑菜单（defaultPrevented=false）
 * - 业务菜单已 preventDefault 时不重复处理，业务 handler 照常执行
 * - 不使用全局 stopPropagation（监听在 document 冒泡末端，只 preventDefault）
 */

function fireContextMenu(target: Element, clientX = 100, clientY = 120) {
  let prevented = false
  act(() => {
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 2,
      buttons: 2,
    })
    target.dispatchEvent(event)
    prevented = event.defaultPrevented
  })
  return prevented
}

describe('ContextMenuPolicyLayer', () => {
  let clipboardWriteText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.body.innerHTML = ''
    clipboardWriteText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })
  })

  /** 等待层内 setTimeout(0) 注册的 window 级关闭监听生效 */
  async function flushCloseListeners() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }

  function renderLayer() {
    render(<ContextMenuPolicyLayer />)
    const normal = document.createElement('div')
    normal.id = 'normal-area'
    normal.textContent = '普通区域文本'
    const input = document.createElement('input')
    input.id = 'text-input'
    input.type = 'text'
    const editable = document.createElement('div')
    editable.id = 'rich-editor'
    editable.setAttribute('contenteditable', 'true')
    editable.innerHTML = '<p>富文本</p>'
    document.body.append(normal, input, editable)
    return { normal, input, editable }
  }

  it('普通区域右键：阻止默认菜单，无选中文本时不弹自定义菜单', () => {
    const { normal } = renderLayer()
    const prevented = fireContextMenu(normal)
    expect(prevented).toBe(true)
    expect(screen.queryByText('复制')).not.toBeInTheDocument()
  })

  it('普通区域有选中文本：出现仅含「复制」的自定义菜单，点击后写入剪贴板并关闭', async () => {
    const { normal } = renderLayer()
    const selection = window.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(normal)
    selection.removeAllRanges()
    selection.addRange(range)
    expect(window.getSelection()!.toString()).toBe('普通区域文本')

    const prevented = fireContextMenu(normal)
    expect(prevented).toBe(true)
    expect(screen.getByText('复制')).toBeInTheDocument()

    fireEvent.click(screen.getByText('复制'))
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledWith('普通区域文本'))
    expect(screen.queryByText('复制')).not.toBeInTheDocument()
  })

  it('input / textarea / contenteditable 及其子元素不阻止默认（保留系统文本菜单）', () => {
    const { input, editable } = renderLayer()
    expect(fireContextMenu(input)).toBe(false)
    expect(fireContextMenu(editable)).toBe(false)
    expect(fireContextMenu(editable.querySelector('p')!)).toBe(false)
    expect(screen.queryByText('复制')).not.toBeInTheDocument()
  })

  it('业务菜单已 preventDefault 时层不处理，业务 handler 照常执行', () => {
    renderLayer()
    const business = document.createElement('div')
    business.id = 'business-area'
    document.body.append(business)
    const seen: boolean[] = []
    const handler = (e: Event) => {
      e.preventDefault()
      seen.push(e.defaultPrevented)
    }
    business.addEventListener('contextmenu', handler)

    // 业务 handler 先于 document 层执行（冒泡顺序），preventDefault 后层不再干预
    fireContextMenu(business)
    expect(seen).toEqual([true])
    expect(screen.queryByText('复制')).not.toBeInTheDocument()
  })

  it('层不做全局 stopPropagation：window 级监听仍能收到事件（菜单关闭逻辑不受破坏）', () => {
    const { normal } = renderLayer()
    const seen: boolean[] = []
    const windowHandler = () => seen.push(true)
    window.addEventListener('contextmenu', windowHandler)
    try {
      fireContextMenu(normal)
      expect(seen).toEqual([true])
    } finally {
      window.removeEventListener('contextmenu', windowHandler)
    }
  })

  it('Escape 关闭复制菜单', async () => {
    const { normal } = renderLayer()
    const selection = window.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(normal)
    selection.removeAllRanges()
    selection.addRange(range)
    fireContextMenu(normal)
    await flushCloseListeners()
    expect(screen.getByText('复制')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('复制')).not.toBeInTheDocument()
  })
})
