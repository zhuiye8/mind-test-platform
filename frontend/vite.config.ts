import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // 监听所有网络接口
    port: 3000,       // 修改为3000端口以匹配用户需求
    strictPort: true, // 端口被占用时直接退出
    proxy: {
      '/api': {
        target: 'http://192.168.0.112:3001',
        changeOrigin: true,
        secure: false
      }
    }
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
})
