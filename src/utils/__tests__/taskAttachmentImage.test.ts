import { describe, expect, it } from 'vitest'
import {
  MAX_IMAGE_ATTACHMENT_BYTES,
  bytesToBase64,
  extractClipboardImageFiles,
  inferImageMimeTypeFromName,
  isImageMimeType,
  readImageFileForUpload,
  sanitizeAttachmentFileName,
  validateImageAttachment,
} from '../taskAttachmentImage'

function makeFile(name: string, type: string, size: number): File {
  const content = new Uint8Array(Math.max(1, size))
  // PNG magic + padding，保证内容非空
  content.set([0x89, 0x50, 0x4e, 0x47], 0)
  return new File([content], name, { type })
}

describe('validateImageAttachment', () => {
  it('接受合法 PNG，并返回安全文件名与 MIME', () => {
    const result = validateImageAttachment({ name: '截图 2026.png', size: 1024, type: 'image/png' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.fileName).toBe('截图 2026.png')
      expect(result.mimeType).toBe('image/png')
      expect(result.extension).toBe('png')
    }
  })

  it('拒绝非图片 MIME', () => {
    const result = validateImageAttachment({ name: 'a.txt', size: 10, type: 'text/plain' })
    expect(result).toMatchObject({ ok: false, code: 'not-image' })
  })

  it('MIME 为空时按图片扩展名兜底，无法识别则拒绝', () => {
    expect(validateImageAttachment({ name: 'photo.JPG', size: 10, type: '' }).ok).toBe(true)
    expect(validateImageAttachment({ name: 'archive.zip', size: 10, type: '' })).toMatchObject({
      ok: false,
      code: 'not-image',
    })
  })

  it('拒绝前端不支持的 image/* 子类型', () => {
    const result = validateImageAttachment({ name: 'vector.svg', size: 10, type: 'image/svg+xml' })
    expect(result).toMatchObject({ ok: false, code: 'unsupported' })
  })

  it('拒绝超过 10MB 的图片', () => {
    const result = validateImageAttachment({
      name: 'huge.png',
      size: MAX_IMAGE_ATTACHMENT_BYTES + 1,
      type: 'image/png',
    })
    expect(result).toMatchObject({ ok: false, code: 'too-large' })
    expect(result.ok === false && result.error).toContain('10MB')
  })

  it('恰好 10MB 允许通过', () => {
    expect(validateImageAttachment({ name: 'edge.png', size: MAX_IMAGE_ATTACHMENT_BYTES, type: 'image/png' }).ok).toBe(
      true,
    )
  })

  it('拒绝空文件', () => {
    expect(validateImageAttachment({ name: 'empty.png', size: 0, type: 'image/png' })).toMatchObject({
      ok: false,
      code: 'empty',
    })
  })
})

describe('sanitizeAttachmentFileName', () => {
  it('剥离路径与非法字符，扩展名由 MIME 决定', () => {
    expect(sanitizeAttachmentFileName('../../etc/passwd', 'image/png')).toBe('passwd.png')
    expect(sanitizeAttachmentFileName('a<b>c:d"e|f?g*.jpeg', 'image/jpeg')).toBe('a_b_c_d_e_f_g.jpg')
    expect(sanitizeAttachmentFileName('C:\\Users\\me\\photo.png', 'image/png')).toBe('photo.png')
  })

  it('空名与 Windows 保留名安全回退', () => {
    expect(sanitizeAttachmentFileName('   ', 'image/png')).toBe('image.png')
    expect(sanitizeAttachmentFileName('CON', 'image/png')).toBe('_CON.png')
    expect(sanitizeAttachmentFileName('com1.png', 'image/png')).toBe('_com1.png')
  })

  it('超长文件名截断但保留扩展名', () => {
    const result = sanitizeAttachmentFileName(`${'a'.repeat(200)}.png`, 'image/png')
    expect(result.endsWith('.png')).toBe(true)
    expect(result.length).toBe(84)
  })
})

describe('bytesToBase64', () => {
  it('正确编码二进制数据并支持分块边界', () => {
    expect(bytesToBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('iVBORw==')
    const large = new Uint8Array(0x8000 + 3).fill(65)
    expect(bytesToBase64(large)).toBe(btoa('A'.repeat(0x8000 + 3)))
  })
})

describe('readImageFileForUpload', () => {
  it('合法图片返回文件名、MIME 与 base64 字节', async () => {
    const file = makeFile('截图.png', 'image/png', 16)
    const result = await readImageFileForUpload(file)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.fileName).toBe('截图.png')
      expect(result.payload.mimeType).toBe('image/png')
      expect(result.payload.bytesBase64).toBeTruthy()
      expect(result.payload.size).toBe(16)
    }
  })

  it('超大文件在读取前被拒绝', async () => {
    const file = makeFile('huge.png', 'image/png', MAX_IMAGE_ATTACHMENT_BYTES + 1)
    const result = await readImageFileForUpload(file)
    expect(result).toEqual({ ok: false, error: '图片大小不能超过 10MB' })
  })
})

describe('clipboard helpers', () => {
  it('isImageMimeType / inferImageMimeTypeFromName 基础判断', () => {
    expect(isImageMimeType('image/png')).toBe(true)
    expect(isImageMimeType('IMAGE/JPEG')).toBe(true)
    expect(isImageMimeType('text/plain')).toBe(false)
    expect(inferImageMimeTypeFromName('x.WEBP')).toBe('image/webp')
    expect(inferImageMimeTypeFromName('x')).toBeNull()
  })

  it('区分图片文件、非图片文件与纯文本粘贴', () => {
    const png = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })
    const pdf = new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' })
    const items = [
      { kind: 'file', type: 'image/png', getAsFile: () => png },
      { kind: 'file', type: 'application/pdf', getAsFile: () => pdf },
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
    ]
    const result = extractClipboardImageFiles(items)
    expect(result.imageFiles).toEqual([png])
    expect(result.rejectedFiles).toEqual([pdf])

    expect(extractClipboardImageFiles([items[2]])).toEqual({ imageFiles: [], rejectedFiles: [] })
  })
})
