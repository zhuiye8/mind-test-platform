import { Router } from 'express';
import { teacherLogin, verifyAuth } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// 教师登录路由
router.post('/login', teacherLogin);

// 验证认证状态路由（需要认证）
router.get('/verify', authenticateToken, verifyAuth);

export default router;