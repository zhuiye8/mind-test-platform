import { Router } from 'express';
import authRoutes from './authRoutes';
import paperRoutes from './paperRoutes';
import examRoutes from './examRoutes';
import publicRoutes from './publicRoutes';
import analyticsRoutes from './analyticsRoutes';

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
      },
      public: '/api/public',
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

export default router;