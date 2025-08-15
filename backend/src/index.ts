import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
// import WebSocket from 'ws'; // 已移除，改用外部AI服务
import { connectDatabase, disconnectDatabase } from './utils/database';
import { errorHandler } from './middleware/errorHandler';
// AI相关导入已删除，改用外部AI服务
// import { audioProgressService } from './services/audioProgressService'; // 已禁用WebSocket

// 加载环境变量
dotenv.config();

// 清除代理设置，确保AI服务连接正常
// 解决WSL开发环境中代理导致的AI服务502错误问题
// 注意：生产环境中所有服务(包括AI服务)都在同一设备，不存在此问题
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
console.log('🌐 已清除HTTP代理设置，确保AI服务连接正常 (仅开发环境需要)');

const app = express();
const PORT = process.env.PORT || 3001;

// 安全中间件 - 配置CORS/CORP策略解决音频文件跨域问题
app.use(helmet({
  crossOriginResourcePolicy: { 
    policy: "cross-origin" 
  },
  crossOriginEmbedderPolicy: false // 禁用COEP避免音频文件问题
}));

// CORS配置 - 支持多个前端端口
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173', // Vite开发服务器
    ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : [])
  ],
  credentials: true,
  exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Type']
}));

// 专门针对音频文件的CORS中间件
app.use('/api/audio', (req, res, next) => {
  const origin = req.headers.origin;
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
  next();
});

// 日志中间件
app.use(morgan('combined'));

// 请求解析中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 健康检查端点
app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: '心理测试系统后端服务',
  });
});

// 静态文件服务作为备选方案 - 仅用于uploads/audio
app.use('/uploads/audio', (req, res, next) => {
  // 设置CORS头
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
  next();
}, express.static('uploads/audio', {
  setHeaders: (res, path) => {
    // 设置音频文件的Content-Type
    if (path.endsWith('.mp3')) {
      res.setHeader('Content-Type', 'audio/mpeg');
    } else if (path.endsWith('.wav')) {
      res.setHeader('Content-Type', 'audio/wav');
    } else if (path.endsWith('.m4a')) {
      res.setHeader('Content-Type', 'audio/mp4');
    } else if (path.endsWith('.ogg')) {
      res.setHeader('Content-Type', 'audio/ogg');
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Accept-Ranges', 'bytes');
  }
}));

// API路由
import apiRoutes from './routes';
app.use('/api', apiRoutes);

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `路由 ${req.originalUrl} 不存在`,
  });
});

// 全局错误处理
app.use(errorHandler);

// 启动服务器
const startServer = async (): Promise<void> => {
  try {
    // 连接数据库
    await connectDatabase();

    // 创建HTTP服务器
    const server = createServer(app);

    // WebSocket服务器已移除，改用外部AI服务
    
    // 注释掉WebSocket服务，改用轮询机制
    // audioProgressService.initialize(server);

    // 启动HTTP服务器
    server.listen(PORT, () => {
      console.log(`🚀 服务器已启动在端口 ${PORT}`);
      console.log(`📱 健康检查: http://localhost:${PORT}/health`);
      console.log(`🌐 API地址: http://localhost:${PORT}/api`);
      console.log(`🤖 AI分析服务: ${process.env.AI_SERVICE_URL || 'http://192.168.9.84:5000'}`);
      // console.log(`🎵 音频进度WebSocket: ws://localhost:${PORT}/api/audio/progress`);
    });

    // 保存服务器实例以便优雅关闭
    (global as any).httpServer = server;
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
};

// 优雅关闭
const gracefulShutdown = async (signal: string) => {
  console.log(`收到${signal}信号，正在优雅关闭...`);
  
  // 关闭HTTP服务器
  const httpServer = (global as any).httpServer;
  if (httpServer) {
    httpServer.close(() => {
      console.log('HTTP服务器已关闭');
    });
  }
  
  // 断开数据库连接
  await disconnectDatabase();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 启动应用
startServer();