import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createServer } from 'http';
import { connectDatabase, disconnectDatabase } from './utils/database';
import { errorHandler } from './middleware/errorHandler';

const initialEnvKeys = new Set(Object.keys(process.env));
const loadedEnvKeys = new Set<string>();

function loadEnvFile(filename: string, overrideLoaded = false): void {
  const envPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return;

  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    const alreadyDefined = process.env[key] !== undefined;
    const definedByLoader = loadedEnvKeys.has(key);
    if (!alreadyDefined) {
      process.env[key] = value;
      loadedEnvKeys.add(key);
    } else if (overrideLoaded && definedByLoader && !initialEnvKeys.has(key)) {
      process.env[key] = value;
    }
  }
}

const nodeEnv = process.env.NODE_ENV || 'development';
loadEnvFile('.env');
loadEnvFile('.env.local', true);
loadEnvFile(`.env.${nodeEnv}`, true);
loadEnvFile(`.env.${nodeEnv}.local`, true);

// 仅在开发环境清除代理设置，避免影响企业代理环境
if (process.env.NODE_ENV === 'development' && process.env.CLEAR_PROXY !== 'false') {
  delete process.env.http_proxy;
  delete process.env.https_proxy;
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  console.log('🌐 开发环境：已清除HTTP代理设置，确保AI服务连接正常');
  console.log('💡 提示：如需保留代理，请设置 CLEAR_PROXY=false');
}

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// 安全中间件 - 配置CORS/CORP策略解决音频文件跨域问题
app.use(helmet({
  crossOriginResourcePolicy: { 
    policy: "cross-origin" 
  },
  crossOriginEmbedderPolicy: false // 禁用COEP避免音频文件问题
}));

const defaultCorsOrigins = [
  'http://localhost:3000',
  'http://localhost:3100',
  'http://127.0.0.1:3100',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const extraCorsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...defaultCorsOrigins, ...extraCorsOrigins]));

// CORS配置 - 支持多个前端端口和调试
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Type'],
  optionsSuccessStatus: 200 // 支持legacy浏览器
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
// SDP 纯文本解析（WHIP/WHEP）
app.use(express.text({ type: 'application/sdp', limit: '50kb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 请求日志中间件（仅开发环境）
if (process.env.NODE_ENV === 'development') {
  app.use('/api', (req, _res, next) => {
    console.log(`${req.method} ${req.path} - ${req.headers.origin || 'unknown'}`);
    next();
  });
}

// 健康检查端点
app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: '心理测试系统后端服务',
    port: PORT,
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

// 启动配置验证
const validateConfiguration = async (): Promise<void> => {
  console.log('\n📋 启动配置验证');
  
  // 基本配置检查
  console.log(`🔧 端口: ${PORT} | 环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 数据库: ${process.env.DATABASE_URL ? '✅' : '❌'} | JWT: ${process.env.JWT_SECRET ? '✅' : '❌'}`);

  // AI服务检查
  const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:5678';
  console.log(`🤖 AI服务: ${aiServiceUrl}`);
  
  try {
    const { aiAnalysisService } = await import('./services/aiAnalysis');
    const healthCheck = await aiAnalysisService.checkWebSocketHealth();
    
    if (healthCheck.available) {
      console.log(`✅ AI服务连接成功 (${healthCheck.diagnostics?.responseTime || 0}ms)`);
    } else {
      console.log(`❌ AI服务连接失败: ${healthCheck.error}`);
    }
  } catch (error) {
    console.log(`⚠️ AI服务检查异常: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  console.log('====================\n');
};

// 启动服务器
const startServer = async (): Promise<void> => {
  try {
    // 配置验证
    await validateConfiguration();

    // 连接数据库
    await connectDatabase();

    // 创建HTTP服务器
    const server = createServer(app);

    // 音频进度已改用轮询机制，无需WebSocket

    // 启动HTTP服务器
    server.listen(PORT, () => {
      console.log(`🎉 服务器启动成功! 端口: ${PORT}`);
      console.log(`📱 健康检查: http://localhost:${PORT}/health`);
      console.log(`🌐 API地址: http://localhost:${PORT}/api\n`);
    });

    // 保存服务器实例以便优雅关闭
    (global as any).httpServer = server;
  } catch (error) {
    console.error('\n❌ 服务器启动失败:', error);
    console.error('请检查配置和依赖项是否正确');
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
