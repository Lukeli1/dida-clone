import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { getAvatar, setAvatar, removeAvatar, fileToAvatar } from '../avatar'

describe('avatar 头像工具', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getAvatar / setAvatar / removeAvatar', () => {
    it('未存储时 getAvatar 返回 null', () => {
      expect(getAvatar()).toBeNull()
    })

    it('setAvatar 保存后 getAvatar 可读回相同 data URL', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
      setAvatar(dataUrl)
      expect(getAvatar()).toBe(dataUrl)
      expect(localStorage.getItem('userAvatar')).toBe(dataUrl)
    })

    it('removeAvatar 删除后 getAvatar 返回 null', () => {
      setAvatar('data:image/png;base64,xxxx')
      removeAvatar()
      expect(getAvatar()).toBeNull()
      expect(localStorage.getItem('userAvatar')).toBeNull()
    })

    it('setAvatar 可覆盖已存在的头像', () => {
      setAvatar('data:image/png;base64,old')
      setAvatar('data:image/jpeg;base64,new')
      expect(getAvatar()).toBe('data:image/jpeg;base64,new')
    })
  })

  describe('fileToAvatar 校验', () => {
    it('非图片文件被拒绝（抛出“请选择图片文件”）', async () => {
      const file = { type: 'text/plain', size: 100 } as unknown as File
      await expect(fileToAvatar(file)).rejects.toThrow('请选择图片文件')
    })

    it('超过 5MB 的图片被拒绝（抛出“图片不能超过 5MB”）', async () => {
      const file = { type: 'image/png', size: 6 * 1024 * 1024 } as unknown as File
      await expect(fileToAvatar(file)).rejects.toThrow('图片不能超过 5MB')
    })

    it('Reader 读取失败时抛出“读取文件失败”', async () => {
      // 用 mock 的 FileReader 触发 onerror
      const fakeReader = {
        onload: null as ((e: unknown) => void) | null,
        onerror: null as ((e: unknown) => void) | null,
        readAsDataURL: function () {
          // 异步触发 onerror
          setTimeout(() => this.onerror && this.onerror(new Event('error')), 0)
        },
      }
      vi.stubGlobal('FileReader', function () {
        return fakeReader
      })

      const file = { type: 'image/png', size: 1024 } as unknown as File
      await expect(fileToAvatar(file)).rejects.toThrow('读取文件失败')

      vi.unstubAllGlobals()
    })

    it('canvas 不可用时回退返回原始 data URL', async () => {
      const fakeDataUrl = 'data:image/png;base64,FAKE=='

      // mock FileReader：readAsDataURL 异步触发 onload
      const fakeReader = {
        onload: null as ((e: unknown) => void) | null,
        onerror: null as ((e: unknown) => void) | null,
        readAsDataURL: function () {
          setTimeout(() => this.onload && this.onload({ target: { result: fakeDataUrl } }), 0)
        },
      }
      vi.stubGlobal('FileReader', function () {
        return fakeReader
      })

      // mock Image：设置 src 后异步触发 onload
      const fakeImg = {
        onload: null as ((e: unknown) => void) | null,
        onerror: null as ((e: unknown) => void) | null,
        width: 200,
        height: 100,
        set src(_v: string) {
          setTimeout(() => this.onload && this.onload({}), 0)
        },
      }
      vi.stubGlobal('Image', function () {
        return fakeImg
      })

      // jsdom 默认 canvas.getContext('2d') 返回 null，函数应回退到 resolve(dataUrl)
      const file = { type: 'image/png', size: 1024 } as unknown as File
      await expect(fileToAvatar(file)).resolves.toBe(fakeDataUrl)

      vi.unstubAllGlobals()
    })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
