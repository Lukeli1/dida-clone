import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['tests/**', 'node_modules/**'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/utils/**', 'src/hooks/**', 'src/stores/**'],
    },
  },
})
