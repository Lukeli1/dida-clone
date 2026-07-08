import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // 忽略 src-tauri/target 目录，避免文件监视器在 Rust 编译时因 dll 被占用而崩溃
    watch: {
      ignored: ['**/src-tauri/target/**', '**/patches/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'chrome100',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        // P3-14: 函数式 manualChunks，把 react/react-dom 独立为 vendor chunk，
        // 降低主入口 gzip 体积（目标 < 90KB）。
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'charts'
            if (id.includes('react-markdown') || id.includes('remark-gfm')) return 'markdown'
            if (id.includes('date-fns')) return 'date'
            if (id.includes('@tanstack/react-virtual')) return 'virtual'
            if (id.includes('react') || id.includes('scheduler') || id.includes('react-dom')) return 'react-vendor'
          }
        },
      },
    },
  },
})
