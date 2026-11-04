import { describe, expect, it } from 'vitest'
import { isTextEditableTarget } from '../contextMenuPolicy'

/** 右键菜单集中策略：编辑类目标必须保留系统文本菜单（复制/粘贴），业务菜单不得吞掉 */
function el(tag: string, attrs: Record<string, string> = {}, innerHTML = ''): HTMLElement {
  const node = document.createElement(tag)
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value))
  node.innerHTML = innerHTML
  return node
}

describe('isTextEditableTarget', () => {
  it('input / textarea / contenteditable 命中', () => {
    document.body.innerHTML = ''
    const input = el('input', { type: 'text' })
    const textarea = el('textarea')
    const editable = el('div', { contenteditable: 'true' })
    document.body.append(input, textarea, editable)

    expect(isTextEditableTarget(input)).toBe(true)
    expect(isTextEditableTarget(textarea)).toBe(true)
    expect(isTextEditableTarget(editable)).toBe(true)
  })

  it('编辑控件的子元素与内部也命中，普通容器内的元素不命中', () => {
    document.body.innerHTML = ''
    const wrapper = el('div', {}, '<span class="icon">✎</span>')
    const editor = el('div', { contenteditable: 'true' }, '<p><b>加粗</b></p>')
    document.body.append(wrapper, editor)

    expect(isTextEditableTarget(wrapper.querySelector('span'))).toBe(false)
    expect(isTextEditableTarget(editor.querySelector('b'))).toBe(true)
    expect(isTextEditableTarget(editor.querySelector('p'))).toBe(true)
  })

  it('checkbox / radio 等非文本 input 不算编辑目标', () => {
    document.body.innerHTML = ''
    const checkbox = el('input', { type: 'checkbox' })
    document.body.append(checkbox)
    expect(isTextEditableTarget(checkbox)).toBe(false)
  })

  it('普通元素、SVG、null 返回 false', () => {
    document.body.innerHTML = ''
    const div = el('div', {}, '<svg><path /></svg>')
    document.body.append(div)
    expect(isTextEditableTarget(div)).toBe(false)
    expect(isTextEditableTarget(div.querySelector('path'))).toBe(false)
    expect(isTextEditableTarget(null)).toBe(false)
  })
})
