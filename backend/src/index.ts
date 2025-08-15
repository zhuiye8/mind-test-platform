import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import WebSocket from 'ws';
import { connectDatabase, disconnectDatabase } from './utils/database';
import { errorHandler } from './middleware/errorHandler';
import { handleEmotionWebSocket, cleanupEmotionSessions } from './controllers/aiController';
import { emotionStreamService } from './services/emotionStreamService';
// import { audioProgressService } from './services/audioProgressService'; // 已禁用WebSocket

// 加载环境变量
dotenv.config();

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

    // 创建情绪分析WebSocket服务器
    const wss = new WebSocket.Server({ 
      server,
      path: '/api/emotion/stream'
    });

    // 处理情绪分析WebSocket连接
    wss.on('connection', (ws, req) => {
      console.log('🔗 情绪分析WebSocket连接建立');
      handleEmotionWebSocket(ws, req);
    });
    
    // 设置服务器引用以支持按需WebSocket初始化
    emotionStreamService.setServer(server);
    
    // 注释掉WebSocket服务，改用轮询机制
    // audioProgressService.initialize(server);

    // 启动HTTP服务器
    server.listen(PORT, () => {
      console.log(`🚀 服务器已启动在端口 ${PORT}`);
      console.log(`📱 健康检查: http://localhost:${PORT}/health`);
      console.log(`🌐 API地址: http://localhost:${PORT}/api`);
      console.log(`📡 情绪分析WebSocket: ws://localhost:${PORT}/api/emotion/stream`);
      // console.log(`🎵 音频进度WebSocket: ws://localhost:${PORT}/api/audio/progress`);
    });

    // 保存服务器实例以便优雅关闭
    (global as any).httpServer = server;
    (global as any).wsServer = wss;
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
};

// 优雅关闭
const gracefulShutdown = async (signal: string) => {
  console.log(`收到${signal}信号，正在优雅关闭...`);
  
  // 清理情绪分析会话
  cleanupEmotionSessions();
  
  // 关闭WebSocket服务器
  const wsServer = (global as any).wsServer;
  if (wsServer) {
    wsServer.close(() => {
      console.log('WebSocket服务器已关闭');
    });
  }
  
  // 清理音频进度WebSocket服务（已禁用）
  // if (audioProgressService.isInitialized()) {
  //   audioProgressService.cleanup();
  // }
  
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