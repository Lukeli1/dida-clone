/**
 * 右键菜单集中策略的共享判定。
 *
 * 编辑类目标（input / textarea / contenteditable 及其子元素）必须保留
 * 系统文本编辑菜单（复制 / 粘贴等），业务菜单与「阻止默认浏览器菜单」
 * 的策略都不得吞掉它们。checkbox / radio 等非文本 input 不算编辑目标，
 * 仍按普通区域处理，避免破坏任务行的既有右键菜单。
 */

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'password',
  'email',
  'number',
])

export function isTextEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false

  const editable = target.closest<HTMLElement>('input, textarea, [contenteditable="true"], [contenteditable=""]')
  if (!editable) return false

  if (editable instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has((editable.type || 'text').toLowerCase())
  }
  return true
}
