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

// 启动时配置验证和详细日志输出
const validateConfiguration = async (): Promise<void> => {
  console.log('\n📋 启动配置验证:');
  console.log('====================');

  // 1. 基本配置验证
  console.log(`🔧 服务器端口: ${PORT}`);
  console.log(`🌍 运行环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 数据库URL: ${process.env.DATABASE_URL ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`🔴 Redis URL: ${process.env.REDIS_URL || '未配置'}`);
  console.log(`🔐 JWT密钥: ${process.env.JWT_SECRET ? '✅ 已配置' : '❌ 未配置'}`);

  // 2. AI服务配置详细验证
  const aiServiceUrl = process.env.AI_SERVICE_URL;
  console.log('\n🤖 AI服务配置验证:');
  if (!aiServiceUrl) {
    console.log('  ⚠️  AI_SERVICE_URL未设置，使用默认值: http://192.168.9.84:5000');
    console.log('  💡 建议：在 .env 文件中设置 AI_SERVICE_URL=http://192.168.0.204:5000');
  } else {
    console.log(`  ✅ AI_SERVICE_URL: ${aiServiceUrl}`);
    
    // URL格式验证
    try {
      const url = new URL(aiServiceUrl);
      console.log(`  📍 协议: ${url.protocol}`);
      console.log(`  📍 主机: ${url.hostname}`);
      console.log(`  📍 端口: ${url.port || (url.protocol === 'https:' ? '443' : '80')}`);
      
      // 预期的WebSocket地址
      const wsUrl = url.protocol === 'https:' ? 'wss:' : 'ws:';
      console.log(`  🔗 预期WebSocket地址: ${wsUrl}//${url.host}/socket.io/`);
    } catch (error) {
      console.log(`  ❌ URL格式无效: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 3. 尝试连接AI服务 - 增强版诊断
  console.log('\n🔍 AI服务连通性测试:');
  try {
    const { aiAnalysisService } = await import('./services/aiAnalysisService');
    const healthCheck = await aiAnalysisService.checkWebSocketHealth();
    
    if (healthCheck.available) {
      console.log('  🎉 AI服务连接成功');
      console.log(`  ⚡ 响应时间: ${healthCheck.diagnostics?.responseTime || 0}ms`);
      if (healthCheck.diagnostics?.networkPath) {
        console.log(`  🌐 网络路径: ${healthCheck.diagnostics.networkPath}`);
      }
      if (healthCheck.diagnostics?.serviceInfo) {
        console.log('  📋 服务信息:', healthCheck.diagnostics.serviceInfo);
      }
      console.log(`  🔗 WebSocket地址: ${healthCheck.websocketUrl}`);
    } else {
      console.log('  ❌ AI服务连接失败');
      console.log(`  💬 错误信息: ${healthCheck.error}`);
      
      if (healthCheck.diagnostics?.networkPath) {
        console.log(`  🌐 目标路径: ${healthCheck.diagnostics.networkPath}`);
      }
      
      if (healthCheck.diagnostics?.urlComponents) {
        const components = healthCheck.diagnostics.urlComponents;
        console.log(`  📍 解析组件:`);
        console.log(`     协议: ${components.protocol}`);
        console.log(`     主机: ${components.hostname}`);
        console.log(`     端口: ${components.port}`);
      }
      
      if (healthCheck.diagnostics?.troubleshooting && healthCheck.diagnostics.troubleshooting.length > 0) {
        console.log('  🔧 解决方案:');
        healthCheck.diagnostics.troubleshooting.forEach((tip, index) => {
          console.log(`     ${index + 1}. ${tip}`);
        });
      } else {
        console.log('  🔧 通用解决方案:');
        console.log('     1. 检查AI服务是否已启动');
        console.log('     2. 确认IP地址和端口正确');
        console.log('     3. 检查网络防火墙设置');
        console.log('     4. 验证 .env 文件中的 AI_SERVICE_URL 配置');
      }
    }
  } catch (error) {
    console.log(`  ❌ AI服务测试异常: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('  🔧 异常处理建议:');
    console.log('     1. 检查AI分析服务模块是否正常');
    console.log('     2. 验证依赖项安装完整');
    console.log('     3. 查看详细错误日志');
  }

  // 4. 代理环境检查（WSL特殊处理）
  console.log('\n🌐 网络环境检查:');
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  
  if (httpProxy || httpsProxy) {
    console.log('  ⚠️  检测到代理设置:');
    if (httpProxy) console.log(`     HTTP_PROXY: ${httpProxy}`);
    if (httpsProxy) console.log(`     HTTPS_PROXY: ${httpsProxy}`);
    console.log('  💡 WSL环境提示：如果AI服务连接失败，可能需要清除代理设置');
    
    // WSL环境自动清除代理（可选）
    if (process.platform === 'linux' && (httpProxy || httpsProxy)) {
      delete process.env.HTTP_PROXY;
      delete process.env.http_proxy;
      delete process.env.HTTPS_PROXY;
      delete process.env.https_proxy;
      console.log('  🔧 已自动清除代理设置（WSL兼容性）');
    }
  } else {
    console.log('  ✅ 无代理设置，网络环境正常');
  }

  console.log('\n====================');
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

    // WebSocket服务器已移除，改用外部AI服务
    
    // 注释掉WebSocket服务，改用轮询机制
    // audioProgressService.initialize(server);

    // 启动HTTP服务器
    server.listen(PORT, () => {
      console.log('\n🎉 服务器启动成功!');
      console.log('====================');
      console.log(`🚀 服务器端口: ${PORT}`);
      console.log(`📱 健康检查: http://localhost:${PORT}/health`);
      console.log(`🌐 API地址: http://localhost:${PORT}/api`);
      console.log(`🤖 AI分析服务: ${process.env.AI_SERVICE_URL || 'http://192.168.9.84:5000'}`);
      console.log(`🔗 AI配置接口: http://localhost:${PORT}/api/ai/config`);
      console.log('====================\n');
      
      console.log('💡 快速测试命令:');
      console.log(`   curl http://localhost:${PORT}/health`);
      console.log(`   curl http://localhost:${PORT}/api/ai/config`);
      console.log('');
      
      // console.log(`🎵 音频进度WebSocket: ws://localhost:${PORT}/api/audio/progress`);
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