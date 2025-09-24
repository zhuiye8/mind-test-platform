import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

function normalizeUrl(value?: string): string | undefined {
  if (!value) return undefined
  return value.endsWith('/') ? value.slice(0, -1) : value
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const serverHost = env.VITE_DEV_SERVER_HOST || '0.0.0.0'
  const serverPort = Number(env.VITE_DEV_SERVER_PORT || 3000)
  const strictPort = env.VITE_DEV_STRICT_PORT !== 'false'

  const certDir = env.VITE_DEV_CERT_DIR
    ? path.resolve(process.cwd(), env.VITE_DEV_CERT_DIR)
    : path.resolve(__dirname, './certs')

  const defaultCertFile = env.VITE_DEV_CERT_FILE || 'dev-cert.pem'
  const defaultKeyFile = env.VITE_DEV_KEY_FILE || 'dev-cert-key.pem'

  const certPath = env.VITE_DEV_CERT_PATH
    ? path.resolve(process.cwd(), env.VITE_DEV_CERT_PATH)
    : path.join(certDir, defaultCertFile)

  const keyPath = env.VITE_DEV_KEY_PATH
    ? path.resolve(process.cwd(), env.VITE_DEV_KEY_PATH)
    : path.join(certDir, defaultKeyFile)

  let httpsConfig: { cert: Buffer; key: Buffer } | undefined
  if (env.VITE_DEV_USE_HTTPS === 'true') {
    const hasHttpsCert = fs.existsSync(certPath) && fs.existsSync(keyPath)
    if (hasHttpsCert) {
      httpsConfig = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      }
    } else {
      console.warn(
        `[vite] 未找到 HTTPS 证书，已回退到 HTTP: ${certPath} / ${keyPath}`
      )
    }
  }

  let proxy: Record<string, ProxyOptions> | undefined
  if (env.VITE_DEV_ENABLE_PROXY !== 'false') {
    const explicitTarget = normalizeUrl(env.VITE_API_PROXY_TARGET)
    const baseFromApi = (() => {
      const normalized = normalizeUrl(env.VITE_API_BASE_URL)
      if (!normalized || !/^https?:\/\//.test(normalized)) return undefined
      if (normalized.endsWith('/api')) {
        const trimmed = normalized.slice(0, -4)
        return trimmed || normalized
      }
      return normalized
    })()
    const proxyTarget = explicitTarget || baseFromApi || 'http://localhost:3101'
    proxy = {
      '/api': {
        target: proxyTarget,
        changeOrigin: env.VITE_API_PROXY_CHANGE_ORIGIN !== 'false',
        secure: env.VITE_API_PROXY_SECURE === 'true'
      }
    }
  }

  return {
    plugins: [react()],
    server: {
      host: serverHost, // 监听所有网络接口，默认 0.0.0.0
      port: serverPort, // 通过 VITE_DEV_SERVER_PORT 自定义
      strictPort,
      https: httpsConfig,
      proxy
    },
  build: {
    // 性能优化配置
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        // 手动分块优化
        manualChunks: {
          // Ant Design 单独打包
          'antd': ['antd'],
          'antd-icons': ['@ant-design/icons'],
          // React 生态单独打包
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // WebRTC相关代码单独打包
          'webrtc': [
            './src/services/webrtcPublisher.ts'
          ],
          // 工具库
          'utils': ['dayjs', 'axios']
        },
        // 优化文件名
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // 调整chunk大小警告限制
    chunkSizeWarningLimit: 800
  }
  }
})
