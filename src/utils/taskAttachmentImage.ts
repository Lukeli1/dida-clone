/**
 * 任务图片附件：前端校验 / 文件名安全化 / 字节编码（纯函数）
 *
 * 约束：
 * - 仅接受 image/*，且后端能识别的 PNG / JPEG / GIF / WebP / BMP；
 * - 单文件 ≤ 10MB；
 * - 文件名只保留安全字符，扩展名由 MIME（后端最终以文件头为准）决定；
 * - 图片内容以字节上传，绝不写入任务 notes。
 */

export const MAX_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024

export const IMAGE_ATTACHMENT_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/bmp'

/** MIME → 标准化扩展名（后端还会按文件头二次校验） */
const MIME_TO_EXTENSION: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
}

const EXTENSION_TO_MIME: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export interface ImageFileCandidate {
  name: string
  size: number
  type: string
}

export type ImageAttachmentValidation =
  | {
      ok: true
      fileName: string
      mimeType: string
      extension: string
      size: number
    }
  | {
      ok: false
      code: 'empty' | 'not-image' | 'unsupported' | 'too-large'
      error: string
    }

export function isImageMimeType(mimeType: string | null | undefined): boolean {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('image/')
}

/** 从扩展名兜底推断 MIME（部分剪贴板 / 系统文件 type 为空） */
export function inferImageMimeTypeFromName(fileName: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim())
  if (!match) return null
  return EXTENSION_TO_MIME[match[1].toLowerCase()] ?? null
}

export function isSupportedImageMimeType(mimeType: string): boolean {
  return Object.prototype.hasOwnProperty.call(MIME_TO_EXTENSION, mimeType.toLowerCase())
}

/**
 * 文件名安全化：
 * - 去掉路径部分，只保留最后一段；
 * - 非法字符（路径分隔符、Windows 保留字符、控制字符）替换为 `_`；
 * - 去掉首尾空白与点，限制主文件名长度；
 * - 扩展名强制使用 MIME 对应的安全扩展名；
 * - 空名 / Windows 保留设备名自动加前缀或回退 `image`。
 */
function replaceUnsafeFileNameChars(value: string): string {
  let result = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    result += code < 0x20 || '<>:"|?*'.includes(char) ? '_' : char
  }
  return result
}

export function sanitizeAttachmentFileName(rawName: string, mimeType: string, fallback = 'image'): string {
  const extension = MIME_TO_EXTENSION[mimeType.toLowerCase()] ?? 'png'
  const leaf = (rawName || '').split(/[\\/]/).pop() ?? ''
  const withoutExtension = leaf.replace(/\.[^.]*$/, '')
  let stem = replaceUnsafeFileNameChars(withoutExtension)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .replace(/[_\s]+$/, '')
    .trim()

  if (!stem) stem = fallback
  if (WINDOWS_RESERVED_NAMES.test(stem)) stem = `_${stem}`
  if (stem.length > 80) stem = stem.slice(0, 80)

  return `${stem}.${extension}`
}

/**
 * 校验候选图片：MIME、大小、可支持格式。
 * 空 MIME 时允许按安全扩展名兜底，但最终仍以后端文件头识别为准。
 */
export function validateImageAttachment(candidate: ImageFileCandidate): ImageAttachmentValidation {
  const mimeType = (candidate.type || '').toLowerCase()
  if (candidate.size <= 0) {
    return { ok: false, code: 'empty', error: '图片内容为空，无法添加' }
  }
  if (candidate.size > MAX_IMAGE_ATTACHMENT_BYTES) {
    return { ok: false, code: 'too-large', error: '图片大小不能超过 10MB' }
  }

  if (mimeType && !isImageMimeType(mimeType)) {
    return { ok: false, code: 'not-image', error: '只能添加图片文件' }
  }

  const resolvedMime = mimeType || inferImageMimeTypeFromName(candidate.name) || ''
  if (!resolvedMime) {
    return { ok: false, code: 'not-image', error: '无法识别图片类型，请选择图片文件' }
  }
  if (!isSupportedImageMimeType(resolvedMime)) {
    return {
      ok: false,
      code: 'unsupported',
      error: '仅支持 PNG、JPEG、GIF、WebP、BMP 格式的图片',
    }
  }

  const extension = MIME_TO_EXTENSION[resolvedMime]
  return {
    ok: true,
    fileName: sanitizeAttachmentFileName(candidate.name, resolvedMime),
    mimeType: resolvedMime,
    extension,
    size: candidate.size,
  }
}

/** Uint8Array → base64（分块避免超长参数栈溢出） */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    let part = ''
    for (let i = 0; i < chunk.length; i += 1) part += String.fromCharCode(chunk[i])
    binary += part
  }
  return btoa(binary)
}

export interface ImageUploadPayload {
  fileName: string
  mimeType: string
  size: number
  bytesBase64: string
}

/**
 * 校验并读取 File/Blob 为可上传的字节载荷。
 * 读取前先做大小 / 类型校验，避免把超大文件读入内存。
 */
export async function readImageFileForUpload(
  file: Blob & { name?: string },
): Promise<{ ok: true; payload: ImageUploadPayload } | { ok: false; error: string }> {
  const candidate: ImageFileCandidate = {
    name: file.name || 'image',
    size: file.size,
    type: file.type,
  }
  const validation = validateImageAttachment(candidate)
  if (!validation.ok) return { ok: false, error: validation.error }

  try {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    return {
      ok: true,
      payload: {
        fileName: validation.fileName,
        mimeType: validation.mimeType,
        size: bytes.byteLength,
        bytesBase64: bytesToBase64(bytes),
      },
    }
  } catch {
    return { ok: false, error: '读取图片失败，请重试' }
  }
}

export interface ClipboardFileLike {
  kind: string
  type: string
  getAsFile: () => File | null
}

/**
 * 从剪贴板 items 中提取文件：
 * - imageFiles：可交给上传流程的图片；
 * - rejectedFiles：确实存在但不是图片的文件（调用方应提示并阻止默认粘贴）。
 * 只有文本（没有任何 file item）时两者都为空，调用方应放行普通粘贴。
 */
export function extractClipboardImageFiles(items: ArrayLike<ClipboardFileLike>): {
  imageFiles: File[]
  rejectedFiles: File[]
} {
  const imageFiles: File[] = []
  const rejectedFiles: File[] = []
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (!file) continue
    if (isImageMimeType(item.type) || isImageMimeType(file.type)) {
      imageFiles.push(file)
    } else {
      rejectedFiles.push(file)
    }
  }
  return { imageFiles, rejectedFiles }
}
