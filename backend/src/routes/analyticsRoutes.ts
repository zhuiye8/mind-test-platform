import { Router } from 'express';
import { getTeacherAnalytics, getDashboardStats } from '../controllers/analyticsController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// 所有路由都需要认证
router.use(authenticateToken);

// 分析数据路由
router.get('/', getTeacherAnalytics); // 获取教师分析数据
router.get('/dashboard', getDashboardStats); // 获取仪表盘统计数据

export default router;