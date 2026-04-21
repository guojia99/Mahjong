import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

/**
 * 本地 make dev：不设 VITE_HMR_*，HMR 走本机 127.0.0.1。
 *
 * 若云端仍跑 `vite`/`npm run dev` 且经 HTTPS 域名访问，请设置例如：
 *   VITE_HMR_HOST=marjong.cubing.pro
 *   VITE_HMR_PROTOCOL=wss
 *   VITE_HMR_CLIENT_PORT=443
 * 并在反代上开启 WebSocket 转发（Upgrade / Connection）。
 *
 * 正式环境推荐：`npm run build` 后用 nginx/caddy 只托管 `dist/`，不要运行 Vite，这样不会有 HMR/WebSocket。
 */
const bindHost = process.env.VITE_BIND_HOST ?? '127.0.0.1'
const hmrHost = process.env.VITE_HMR_HOST
const hmr =
  hmrHost !== undefined && hmrHost !== ''
    ? {
        host: hmrHost,
        protocol: (process.env.VITE_HMR_PROTOCOL ?? 'wss') as 'ws' | 'wss',
        clientPort: Number(process.env.VITE_HMR_CLIENT_PORT ?? 443),
      }
    : undefined

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // 与本地 proxy.cjs 的 127.0.0.1 一致；云端可设 VITE_BIND_HOST=0.0.0.0 便于容器内监听
    host: bindHost,
    port: 9998,
    strictPort: true,
    allowedHosts:
      hmrHost !== undefined && hmrHost !== ''
        ? [hmrHost, 'localhost', '127.0.0.1']
        : true,
    hmr,
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
    host: bindHost,
    port: 9998,
    strictPort: true,
    allowedHosts: true,
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
