/**
 * AI分析功能路由
 * 主要提供教师端的AI分析功能
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  generateAIReport,
  getAIReportStatus,
  checkAIServiceHealth,
  endAISession,
} from '../controllers/aiController';

const router = Router();

// 所有AI路由都需要教师认证
router.use(authenticateToken);

// AI分析相关接口
router.post('/exam-results/:examResultId/generate-report', generateAIReport);  // 生成AI分析报告
router.get('/exam-results/:examResultId/report-status', getAIReportStatus);    // 获取报告状态
router.post('/exam-results/:examResultId/end-session', endAISession);          // 手动结束AI会话
router.get('/service/health', checkAIServiceHealth);                           // AI服务健康检查

export default router;