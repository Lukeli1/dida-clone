// 用户头像管理：上传、读取、删除

const STORAGE_KEY = 'userAvatar'

// 读取头像 data URL
export function getAvatar(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

// 保存头像 data URL
export function setAvatar(dataUrl: string): void {
  localStorage.setItem(STORAGE_KEY, dataUrl)
}

// 删除头像
export function removeAvatar(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// 从 File 对象读取为 data URL（base64），带尺寸压缩
export function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('图片不能超过 5MB'))
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      // 压缩到 128x128
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const size = 128
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(dataUrl)
          return
        }
        // 居中裁剪
        const minDim = Math.min(img.width, img.height)
        const sx = (img.width - minDim) / 2
        const sy = (img.height - minDim) / 2
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}
