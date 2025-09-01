import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  generateAIReport,
  checkExamResultExists,
  getReportStatus,
} from '../controllers/aiReportController';

const router = Router();

/**
 * 生成AI分析报告（需要教师权限）
 */
router.post('/generate/:examResultId', authenticateToken, generateAIReport);

/**
 * 检查考试结果是否存在
 */
router.get('/check/:examResultId', authenticateToken, checkExamResultExists);

/**
 * 获取报告生成状态
 */
router.get('/status/:examResultId', authenticateToken, getReportStatus);

export default router;