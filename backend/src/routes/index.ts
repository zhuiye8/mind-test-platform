import { Router } from 'express';
import authRoutes from './authRoutes';
import paperRoutes from './paperRoutes';
import examRoutes from './examRoutes';
import publicRoutes from './publicRoutes';
import analyticsRoutes from './analyticsRoutes';
import aiRoutes from './aiRoutes';
import reportRoutes from './reportRoutes';
import audioRoutes from './audioRoutes';
import aiProxyRoutes from './aiProxyRoutes';
import aiServiceRoutes from './aiServiceRoutes';
import webrtcRoutes from './webrtcRoutes';

const router = Router();

// API版本信息
router.get('/', (_req, res) => {
  res.json({
    service: '心理测试系统API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: '/api/auth',
      teacher: {
        papers: '/api/teacher/papers',
        exams: '/api/teacher/exams',
        analytics: '/api/teacher/analytics',
        ai: '/api/teacher/ai',
      },
      aiService: '/api/ai-service',
      public: '/api/public',
      reports: '/api/reports',
      audio: '/api/audio',
    },
    documentation: 'https://github.com/your-repo/psychology-test-system',
  });
});

// 挂载路由模块
router.use('/auth', authRoutes);              // 认证相关路由
router.use('/teacher/papers', paperRoutes);   // 教师端试卷管理路由
router.use('/teacher/exams', examRoutes);     // 教师端考试管理路由
router.use('/teacher/analytics', analyticsRoutes); // 教师端分析数据路由
router.use('/public', publicRoutes);          // 公开接口路由
router.use('/teacher/ai', aiRoutes);          // AI功能相关路由（教师端主路径）
router.use('/reports', reportRoutes);         // AI报告生成路由
router.use('/audio', audioRoutes);            // 语音文件管理路由
router.use('/ai-proxy', aiProxyRoutes);       // AI服务代理路由（解决CORS问题）
router.use('/ai-service', aiServiceRoutes);   // AI 服务专用路由
router.use('/', webrtcRoutes);                // WebRTC WHIP/WHEP 代理与启动API

export default router;
