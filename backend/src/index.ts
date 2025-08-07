import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectDatabase, disconnectDatabase } from './utils/database';
import { errorHandler } from './middleware/errorHandler';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 安全中间件
app.use(helmet());

// CORS配置
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

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

    // 启动HTTP服务器
    app.listen(PORT, () => {
      console.log(`🚀 服务器已启动在端口 ${PORT}`);
      console.log(`📱 健康检查: http://localhost:${PORT}/health`);
      console.log(`🌐 API地址: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
};

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('收到SIGTERM信号，正在优雅关闭...');
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('收到SIGINT信号，正在优雅关闭...');
  await disconnectDatabase();
  process.exit(0);
});

// 启动应用
startServer();