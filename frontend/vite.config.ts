import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // 与 proxy.cjs 中 127.0.0.1 一致；否则默认可能只监听 ::1，聚合代理会得到 502
    host: '127.0.0.1',
    port: 9998,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:9997',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://127.0.0.1:9997',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 9998,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:9997',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://127.0.0.1:9997',
        changeOrigin: true,
      },
    },
  },
})
