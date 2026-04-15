import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@chinese-chess/shared': path.resolve(__dirname, '../shared/index.ts')
    }
  },
  server: {
    port: 5173,
  }
})
